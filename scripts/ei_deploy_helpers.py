#!/usr/bin/env python3
"""
ei_deploy_helpers.py — Helper functions for polling Edge Impulse jobs
and downloading Arduino ZIP libraries via the Edge Impulse REST API.

These are used by the Arduino MCP server (arduino_mcp.py) for any EI API
calls that the ei-agentic-claude MCP doesn't cover directly, or when you
want to run the download step as a standalone script.

Usage (standalone):
    python3 ei_deploy_helpers.py \
        --project-id 123456 \
        --api-key ei_xxxx \
        --output /tmp/ei_lib_123456.zip

Environment variables (alternative to flags):
    EI_API_KEY
    EI_PROJECT_ID
"""

import argparse
import os
import sys
import time
import urllib.error
import urllib.request
import json
from pathlib import Path

EI_BASE = "https://studio.edgeimpulse.com/v1"


def _headers(api_key: str) -> dict:
    return {
        "x-api-key": api_key,
        "Accept": "application/json",
    }


def get_project(project_id: int, api_key: str) -> dict:
    """Return project info dict from EI API."""
    url = f"{EI_BASE}/api/{project_id}/info"
    req = urllib.request.Request(url, headers=_headers(api_key))
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def trigger_arduino_build(project_id: int, api_key: str, engine: str = "tflite") -> dict:
    """
    POST to EI deployment endpoint to trigger an Arduino library build.
    Returns { jobId } on success.
    """
    url = f"{EI_BASE}/api/{project_id}/jobs/deploy?type=arduino&engine={engine}"
    req = urllib.request.Request(
        url,
        data=b"{}",
        headers={**_headers(api_key), "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"error": f"HTTP {e.code}: {body}"}


def poll_job(project_id: int, job_id: int, api_key: str, interval: float = 5.0, max_wait: float = 600) -> dict:
    """
    Poll a job until finished. Returns the final job status dict.
    Raises TimeoutError if max_wait seconds elapse.
    """
    deadline = time.time() + max_wait
    while time.time() < deadline:
        url = f"{EI_BASE}/api/{project_id}/jobs/{job_id}/status"
        req = urllib.request.Request(url, headers=_headers(api_key))
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        job = data.get("job", {})
        print(f"  Job {job_id} status: {job.get('status', '?')}", flush=True)
        if job.get("finishedSuccessfully"):
            return job
        if job.get("finishMs") and not job.get("finishedSuccessfully"):
            raise RuntimeError(f"Job {job_id} failed: {job.get('output', {})}")
        time.sleep(interval)
    raise TimeoutError(f"Job {job_id} did not finish within {max_wait}s")


def download_arduino_zip(project_id: int, api_key: str, output_path: str) -> Path:
    """
    Download the built Arduino library ZIP from Edge Impulse.
    Returns the Path of the saved file.
    """
    url = f"{EI_BASE}/api/{project_id}/jobs/deploy/arduino/download"
    req = urllib.request.Request(url, headers={**_headers(api_key), "Accept": "application/zip"})
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()
    if len(data) < 1024:
        raise ValueError(f"Downloaded file too small ({len(data)} bytes) — build may have failed")
    output_path.write_bytes(data)
    print(f"  Saved {len(data):,} bytes → {output_path}", flush=True)
    return output_path


def full_deploy_and_download(
    project_id: int,
    api_key: str,
    output_path: str,
    engine: str = "tflite",
) -> Path:
    """
    Trigger build → poll → download in one call.
    Returns Path to the downloaded ZIP.
    """
    print(f"[EI] Triggering Arduino library build for project {project_id}…")
    result = trigger_arduino_build(project_id, api_key, engine)
    if "error" in result:
        raise RuntimeError(result["error"])
    job_id = result.get("id") or result.get("jobId")
    if not job_id:
        raise RuntimeError(f"No job ID in response: {result}")
    print(f"[EI] Build job started: {job_id}")

    print(f"[EI] Polling job {job_id}…")
    poll_job(project_id, job_id, api_key)

    print(f"[EI] Downloading ZIP…")
    return download_arduino_zip(project_id, api_key, output_path)


# ── CLI entry point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deploy Edge Impulse project as Arduino ZIP library")
    parser.add_argument("--project-id", type=int, default=int(os.getenv("EI_PROJECT_ID", "0")))
    parser.add_argument("--api-key", default=os.getenv("EI_API_KEY", ""))
    parser.add_argument("--output", default="/tmp/ei_lib.zip")
    parser.add_argument("--engine", default="tflite", choices=["tflite", "tflite-eon", "tensaiflow"])
    args = parser.parse_args()

    if not args.project_id or not args.api_key:
        print("ERROR: --project-id and --api-key are required (or set EI_PROJECT_ID / EI_API_KEY)", file=sys.stderr)
        sys.exit(1)

    try:
        path = full_deploy_and_download(args.project_id, args.api_key, args.output, args.engine)
        print(f"\n✅ Done! Library saved to: {path}")
    except Exception as e:
        print(f"\n❌ Failed: {e}", file=sys.stderr)
        sys.exit(1)
