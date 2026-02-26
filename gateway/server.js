require('dotenv').config()

const express = require('express')
const axios = require('axios')
const fs = require('fs/promises')
const path = require('path')
const { spawn } = require('child_process')

const app = express()
app.use(express.json())

const PORT = Number(process.env.GATEWAY_PORT || 3000)
const LOG_REQUESTS = (process.env.GATEWAY_LOG_REQUESTS || '').trim() === '1'
const ARDUINO_VALIDATE_TIMEOUT_MS = Number(process.env.ARDUINO_VALIDATE_TIMEOUT_MS || 1_200_000)
const ARDUINO_BUILD_TIMEOUT_MS = Number(process.env.ARDUINO_BUILD_TIMEOUT_MS || 1_200_000)
const ARDUINO_FLASH_TIMEOUT_MS = Number(process.env.ARDUINO_FLASH_TIMEOUT_MS || 1_200_000)
const EI_RUN_TIMEOUT_MS = Number(process.env.EI_RUN_TIMEOUT_MS || 600_000)

const ARDUINO_MCP = process.env.ARDUINO_MCP || 'http://127.0.0.1:3080'
const EI_MCP = process.env.EI_MCP || 'http://127.0.0.1:8090'
const ARDUINO_WORKSPACE_DIR = process.env.ARDUINO_WORKSPACE_DIR || '/workspace'
const DEFAULT_PROJECT_ROOT = process.env.DEFAULT_ARDUINO_PROJECT_ROOT || '/workspace/Blink'
const ARDUINO_DEFAULT_FQBN = process.env.ARDUINO_DEFAULT_FQBN || 'arduino:mbed_nano:nano33ble'
const ARDUINO_FLASH_PORT = process.env.ARDUINO_FLASH_PORT || '/dev/ttyACM0'
const EI_LIBRARY_HEADER_DEFAULT = process.env.EI_LIBRARY_HEADER_DEFAULT || 'your_project_inferencing.h'
const EI_LIBRARY_ZIP_PATH = process.env.EI_LIBRARY_ZIP_PATH || '/outputs/ei_arduino_deployment.zip'

if (LOG_REQUESTS) {
  app.use((req, _res, next) => {
    console.log(`[gateway] ${req.method} ${req.path}`)
    next()
  })
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

function normalizeProjectName(projectRootLike) {
  const raw = String(projectRootLike || DEFAULT_PROJECT_ROOT).trim()
  let rel = raw
  if (rel.startsWith('/workspace/')) rel = rel.slice('/workspace/'.length)
  rel = rel.replace(/^Arduino\//, '')
  rel = rel.replace(/^\/+/, '')
  if (!rel || rel.includes('..') || rel.includes('\\')) {
    throw new Error(`Invalid project root: ${raw}`)
  }
  const projectName = rel.split('/')[0]
  if (!/^[A-Za-z0-9._-]+$/.test(projectName)) {
    throw new Error(`Invalid project name: ${projectName}`)
  }
  return projectName
}

function resolveProjectPaths(projectRootLike) {
  const projectName = normalizeProjectName(projectRootLike)
  const projectRoot = `/workspace/${projectName}`
  const sketchDir = path.posix.join(ARDUINO_WORKSPACE_DIR, projectName)
  const sketchPath = path.posix.join(sketchDir, `${projectName}.ino`)
  return { projectName, projectRoot, sketchDir, sketchPath }
}

function toValidFloat(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

function toValidInt(value, fallback) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return parsed
}

function toValidPin(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const raw = String(value).trim().toLowerCase()
  const m = raw.match(/^d?(\d+)$/)
  if (!m) return fallback
  return Number(m[1])
}

function sanitizeLabel(value, fallback) {
  const raw = String(value || '').trim()
  if (!raw) return fallback
  if (/^[A-Za-z0-9._-]+$/.test(raw)) return raw
  return fallback
}

function unwrapHeader(value) {
  let header = String(value || '').trim()
  if (!header) return ''
  const includeMatch = header.match(/^#include\s*[<"]([^>"]+)[>"]$/)
  if (includeMatch) header = includeMatch[1]
  header = header.replace(/^<+/, '').replace(/>+$/, '')
  header = header.replace(/^['"]+/, '').replace(/['"]+$/, '')
  return header.trim()
}

function isPlaceholderHeader(value) {
  const v = String(value || '').toLowerCase()
  return (
    v.includes('your_ei_header') ||
    v.includes('your-project-inferencing') ||
    v.includes('your_project_inferencing') ||
    v.includes('replace_me')
  )
}

function sanitizeHeader(value) {
  const rawHeader = unwrapHeader(value || EI_LIBRARY_HEADER_DEFAULT)
  if (!rawHeader) {
    return {
      ok: false,
      error: 'libraryHeader is required. Set EI_LIBRARY_HEADER_DEFAULT in .env or pass libraryHeader.'
    }
  }
  if (isPlaceholderHeader(rawHeader)) {
    return {
      ok: false,
      error: `libraryHeader is placeholder (${rawHeader}). Set EI_LIBRARY_HEADER_DEFAULT to your EI header (e.g. my_project_inferencing.h).`
    }
  }
  if (!/^[A-Za-z0-9._/\-]+\.h$/.test(rawHeader)) {
    return {
      ok: false,
      error: `libraryHeader must be a .h file name, got: ${rawHeader}`
    }
  }
  return { ok: true, value: rawHeader }
}

function blinkSketch() {
  return `void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(250);
  digitalWrite(LED_BUILTIN, LOW);
  delay(250);
}
`
}

function servoSweepSketch({ servoPin, servoType }) {
  if (servoType === '360') {
    return `#include <Servo.h>

Servo demoServo;
const int SERVO_PIN = ${servoPin};
const int SERVO_STOP = 90;
const int SERVO_FWD = 180;
const int SERVO_REV = 0;

void setup() {
  demoServo.attach(SERVO_PIN);
  demoServo.write(SERVO_STOP);
}

void loop() {
  demoServo.write(SERVO_FWD);
  delay(1200);
  demoServo.write(SERVO_STOP);
  delay(800);
  demoServo.write(SERVO_REV);
  delay(1200);
  demoServo.write(SERVO_STOP);
  delay(800);
}
`
  }

  return `#include <Servo.h>

Servo demoServo;
const int SERVO_PIN = ${servoPin};

void setup() {
  demoServo.attach(SERVO_PIN);
}

void loop() {
  demoServo.write(0);
  delay(800);
  demoServo.write(90);
  delay(800);
  demoServo.write(180);
  delay(800);
}
`
}

function inferenceSketch({
  actuator,
  servoType,
  libraryHeader,
  positiveLabel,
  threshold,
  ledPin,
  servoPin,
  servoPositiveAngle,
  servoNegativeAngle
}) {
  const isServo = actuator === 'servo'
  return `#include <Arduino.h>
#include <${libraryHeader}>
${isServo ? '#include <Servo.h>' : ''}

const char* POSITIVE_LABEL = "${positiveLabel}";
const float POSITIVE_THRESHOLD = ${threshold.toFixed(3)}f;
const int LED_PIN = ${ledPin};
const int SERVO_PIN = ${servoPin};
const int SERVO_POSITIVE_ANGLE = ${servoPositiveAngle};
const int SERVO_NEGATIVE_ANGLE = ${servoNegativeAngle};
const bool SERVO_MODE_360 = ${servoType === '360' ? 'true' : 'false'};

${isServo ? 'Servo actionServo;' : ''}
static float features[EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE];

void setup() {
  Serial.begin(115200);
  while (!Serial) {}
  pinMode(LED_PIN, OUTPUT);
  ${isServo ? 'actionServo.attach(SERVO_PIN); actionServo.write(SERVO_NEGATIVE_ANGLE);' : ''}
}

void loop() {
  memset(features, 0, sizeof(features));
  signal_t signal;
  numpy::signal_from_buffer(features, EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE, &signal);

  ei_impulse_result_t result = { 0 };
  EI_IMPULSE_ERROR err = run_classifier(&signal, &result, false);
  if (err != EI_IMPULSE_OK) {
    Serial.print("run_classifier error: ");
    Serial.println((int)err);
    delay(250);
    return;
  }

  float bestValue = 0.0f;
  const char* bestLabel = "";
  for (size_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    if (result.classification[i].value > bestValue) {
      bestValue = result.classification[i].value;
      bestLabel = result.classification[i].label;
    }
  }

  const bool positive = strcmp(bestLabel, POSITIVE_LABEL) == 0 && bestValue >= POSITIVE_THRESHOLD;
  digitalWrite(LED_PIN, positive ? HIGH : LOW);
  ${isServo ? 'actionServo.write(positive ? SERVO_POSITIVE_ANGLE : SERVO_NEGATIVE_ANGLE);' : ''}

  Serial.print("label=");
  Serial.print(bestLabel);
  Serial.print(" score=");
  Serial.print(bestValue, 4);
  Serial.print(" action=");
  Serial.println(positive ? "ON" : "OFF");
  delay(100);
}
`
}

async function writeSketch(sketchPath, content) {
  await fs.mkdir(path.posix.dirname(sketchPath), { recursive: true })
  await fs.writeFile(sketchPath, content, 'utf8')
}

function runCommand(bin, args, timeoutMs, extraEnv = null) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      shell: false,
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, timedOut: false, code: -1, stdout, stderr: error.message || String(error) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: !timedOut && code === 0, timedOut, code, stdout, stderr })
    })
  })
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function parseMissingHeader(stderr) {
  const m = String(stderr || '').match(/fatal error:\s*([^:\n]+):\s*No such file or directory/i)
  return m ? m[1].trim() : ''
}

async function tryInstallEiLibraryFromZip(timeoutMs) {
  if (!(await fileExists(EI_LIBRARY_ZIP_PATH))) {
    return { ok: false, skipped: true, reason: `EI ZIP not found at ${EI_LIBRARY_ZIP_PATH}` }
  }
  const args = ['lib', 'install', '--zip-path', EI_LIBRARY_ZIP_PATH]
  const result = await runCommand('arduino-cli', args, timeoutMs, {
    ARDUINO_LIBRARY_ENABLE_UNSAFE_INSTALL: 'true'
  })
  if (result.ok) {
    return { ok: true, command: `arduino-cli ${args.join(' ')}`, result }
  }
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase()
  if (output.includes('already installed')) {
    return { ok: true, command: `arduino-cli ${args.join(' ')}`, result, alreadyInstalled: true }
  }
  return { ok: false, command: `arduino-cli ${args.join(' ')}`, result }
}

async function checkUpstreamHealth(baseUrl) {
  try {
    const r = await axios.get(`${baseUrl}/health`, { timeout: 5_000 })
    return { ok: true, status: r.status, data: r.data }
  } catch (e) {
    return {
      ok: false,
      status: e?.response?.status || null,
      error: e?.response?.data || e?.message || String(e)
    }
  }
}

app.get('/health/upstreams', async (_req, res) => {
  const [arduino, ei] = await Promise.all([
    checkUpstreamHealth(ARDUINO_MCP),
    checkUpstreamHealth(EI_MCP)
  ])
  const healthy = arduino.ok && ei.ok
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    arduino,
    ei
  })
})

function sendAxiosError(res, e) {
  const status = e?.response?.status || 500
  const data = e?.response?.data
  if (data && typeof data === 'object') {
    res.status(status).json(data)
    return
  }
  res.status(status).json({ error: data || e.message || String(e) })
}

function shouldRetryWithEiZip(e) {
  const status = e?.response?.status
  const data = e?.response?.data
  if (status !== 400 || !data || typeof data !== 'object') return false
  const missingHeader = parseMissingHeader(data.stderr || '')
  return missingHeader.endsWith('_inferencing.h')
}

async function proxyArduinoWithEiZipFallback(pathname, body, timeoutMs) {
  try {
    const r = await axios.post(`${ARDUINO_MCP}${pathname}`, body, { timeout: timeoutMs })
    return { ok: true, data: r.data }
  } catch (e) {
    if (!shouldRetryWithEiZip(e)) throw e
    const autoInstall = await tryInstallEiLibraryFromZip(timeoutMs)
    if (!autoInstall.ok) {
      const data = e?.response?.data
      if (data && typeof data === 'object') {
        data.autoInstall = autoInstall
        const wrapped = new Error('Arduino MCP compile failed and EI ZIP auto-install failed')
        wrapped.response = { status: e?.response?.status || 500, data }
        throw wrapped
      }
      throw e
    }
    const r = await axios.post(`${ARDUINO_MCP}${pathname}`, body, { timeout: timeoutMs })
    return { ok: true, data: r.data, autoInstall }
  }
}

app.post('/arduino/validate', async (req, res) => {
  try {
    const out = await proxyArduinoWithEiZipFallback('/validate', req.body, ARDUINO_VALIDATE_TIMEOUT_MS)
    if (out.autoInstall && out.data && typeof out.data === 'object') {
      out.data.autoInstall = out.autoInstall
    }
    res.json(out.data)
  } catch (e) {
    sendAxiosError(res, e)
  }
})

app.post('/arduino/build', async (req, res) => {
  try {
    const out = await proxyArduinoWithEiZipFallback('/build', req.body, ARDUINO_BUILD_TIMEOUT_MS)
    if (out.autoInstall && out.data && typeof out.data === 'object') {
      out.data.autoInstall = out.autoInstall
    }
    res.json(out.data)
  } catch (e) {
    sendAxiosError(res, e)
  }
})

app.post('/arduino/example', async (req, res) => {
  try {
    const example = String(req.body?.example || '').trim().toLowerCase()
    if (!['blink', 'servo'].includes(example)) {
      res.status(400).json({ error: 'example must be one of: blink, servo' })
      return
    }
    const projectRootLike = req.body?.projectRoot || req.body?.projectName || DEFAULT_PROJECT_ROOT
    const { projectName, projectRoot, sketchDir, sketchPath } = resolveProjectPaths(projectRootLike)
    const servoPin = toValidPin(req.body?.servoPin, 9)
    const servoType = String(req.body?.servoType || 'positional').trim() === '360' ? '360' : 'positional'
    const sketch = example === 'blink' ? blinkSketch() : servoSweepSketch({ servoPin, servoType })
    await writeSketch(sketchPath, sketch)
    res.json({
      ok: true,
      example,
      projectName,
      projectRoot,
      sketchDir,
      sketchPath,
      settings: { servoPin, servoType }
    })
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) })
  }
})

app.post('/arduino/inference', async (req, res) => {
  try {
    const actuator = String(req.body?.actuator || '').trim().toLowerCase()
    if (!['led', 'servo'].includes(actuator)) {
      res.status(400).json({ error: 'actuator must be one of: led, servo' })
      return
    }

    const projectRootLike = req.body?.projectRoot || req.body?.projectName || DEFAULT_PROJECT_ROOT
    const { projectName, projectRoot, sketchDir, sketchPath } = resolveProjectPaths(projectRootLike)
    const libraryHeaderResult = sanitizeHeader(req.body?.libraryHeader)
    if (!libraryHeaderResult.ok) {
      res.status(400).json({ error: libraryHeaderResult.error })
      return
    }
    const libraryHeader = libraryHeaderResult.value
    const positiveLabel = sanitizeLabel(req.body?.positiveLabel, 'positive')
    const threshold = Math.max(0, Math.min(1, toValidFloat(req.body?.threshold, 0.8)))
    const ledPin = toValidPin(req.body?.ledPin, 13)
    const servoPin = toValidPin(req.body?.servoPin, 9)
    const servoType = String(req.body?.servoType || 'positional').trim() === '360' ? '360' : 'positional'
    const defaultPositive = servoType === '360' ? 180 : 90
    const defaultNegative = servoType === '360' ? 90 : 0
    const servoPositiveAngle = Math.max(0, Math.min(180, toValidInt(req.body?.servoPositiveAngle, defaultPositive)))
    const servoNegativeAngle = Math.max(0, Math.min(180, toValidInt(req.body?.servoNegativeAngle, defaultNegative)))

    const sketch = inferenceSketch({
      actuator,
      servoType,
      libraryHeader,
      positiveLabel,
      threshold,
      ledPin,
      servoPin,
      servoPositiveAngle,
      servoNegativeAngle
    })

    await writeSketch(sketchPath, sketch)
    res.json({
      ok: true,
      actuator,
      projectName,
      projectRoot,
      sketchDir,
      sketchPath,
      settings: {
        libraryHeader,
        positiveLabel,
        threshold,
        ledPin,
        servoPin,
        servoType,
        servoPositiveAngle,
        servoNegativeAngle
      }
    })
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) })
  }
})

app.post('/arduino/flash', async (req, res) => {
  try {
    const projectRootLike = req.body?.projectRoot || req.body?.projectName || DEFAULT_PROJECT_ROOT
    const { projectName, projectRoot } = resolveProjectPaths(projectRootLike)
    const fqbn = String(req.body?.fqbn || ARDUINO_DEFAULT_FQBN).trim()
    const port = String(req.body?.port || ARDUINO_FLASH_PORT).trim()
    if (!port.startsWith('/dev/')) {
      res.status(400).json({ error: 'port must be a /dev path, e.g. /dev/ttyACM0' })
      return
    }

    const compileArgs = ['compile', '--fqbn', fqbn, projectRoot]
    let compileResult = await runCommand('arduino-cli', compileArgs, ARDUINO_FLASH_TIMEOUT_MS)
    let autoInstall = null

    if (!compileResult.ok) {
      const missingHeader = parseMissingHeader(compileResult.stderr)
      if (missingHeader.endsWith('_inferencing.h')) {
        autoInstall = await tryInstallEiLibraryFromZip(ARDUINO_FLASH_TIMEOUT_MS)
        if (autoInstall.ok) {
          compileResult = await runCommand('arduino-cli', compileArgs, ARDUINO_FLASH_TIMEOUT_MS)
        }
      }
    }

    if (!compileResult.ok) {
      res.status(500).json({
        ok: false,
        phase: 'compile',
        projectName,
        projectRoot,
        fqbn,
        port,
        command: `arduino-cli ${compileArgs.join(' ')}`,
        autoInstall,
        ...compileResult
      })
      return
    }

    const uploadArgs = ['upload', '-p', port, '--fqbn', fqbn, projectRoot]
    const uploadResult = await runCommand('arduino-cli', uploadArgs, ARDUINO_FLASH_TIMEOUT_MS)
    if (!uploadResult.ok) {
      res.status(500).json({
        ok: false,
        phase: 'upload',
        projectName,
        projectRoot,
        fqbn,
        port,
        compile: compileResult,
        command: `arduino-cli ${uploadArgs.join(' ')}`,
        ...uploadResult
      })
      return
    }

    res.json({
      ok: true,
      projectName,
      projectRoot,
      fqbn,
      port,
      compile: compileResult,
      upload: uploadResult
    })
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) })
  }
})

app.post('/ei/run', async (req, res) => {
  try {
    const r = await axios.post(`${EI_MCP}/run`, req.body, { timeout: EI_RUN_TIMEOUT_MS })
    res.json(r.data)
  } catch (e) {
    sendAxiosError(res, e)
  }
})

app.listen(PORT, () => {
  console.log(`Gateway listening on :${PORT}`)
  console.log(`ARDUINO_MCP=${ARDUINO_MCP}`)
  console.log(`EI_MCP=${EI_MCP}`)
  console.log(`ARDUINO_WORKSPACE_DIR=${ARDUINO_WORKSPACE_DIR}`)
  console.log(`ARDUINO_DEFAULT_FQBN=${ARDUINO_DEFAULT_FQBN}`)
  console.log(`EI_LIBRARY_ZIP_PATH=${EI_LIBRARY_ZIP_PATH}`)
})
