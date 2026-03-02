"""LLM client supporting Ollama and llama.cpp backends."""

import json
import os
import subprocess
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class LLMClient(ABC):
    """Abstract base class for LLM clients."""

    @abstractmethod
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        """Generate completion text."""
        pass

    @abstractmethod
    def chat(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048,
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        """Generate chat completion."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if the LLM service is available."""
        pass


class OllamaClient(LLMClient):
    """Ollama API client (OpenAI-compatible)."""

    def __init__(
        self,
        model: str,
        base_url: str = "http://localhost:11434/v1",
        api_key: str = "ollama",
        timeout: int = 300,
        debug: bool = False,
    ):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.debug = debug

    def _request(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        import requests

        url = f"{self.base_url}{endpoint}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        if self.debug:
            print(f"[ollama] Request: {url}", file=__import__("sys").stderr)
            print(f"[ollama] Payload: {payload}", file=__import__("sys").stderr)

        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            raise RuntimeError(f"Ollama request failed: {e}")

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        return self.chat(messages, max_tokens, temperature, **kwargs)

    def chat(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048,
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            **kwargs,
        }
        result = self._request("/chat/completions", payload)
        return result["choices"][0]["message"]["content"]

    def is_available(self) -> bool:
        import requests

        try:
            response = requests.get(
                f"{self.base_url}/models",
                timeout=5,
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            return response.status_code == 200
        except Exception:
            return False


class LlamaCppClient(LLMClient):
    """llama.cpp via CLI (llama-cli or similar)."""

    def __init__(
        self,
        model_path: str,
        context_size: int = 4096,
        threads: int = 4,
        gpu_layers: int = 0,
        batch_size: int = 512,
        debug: bool = False,
    ):
        self.model_path = model_path
        self.context_size = context_size
        self.threads = threads
        self.gpu_layers = gpu_layers
        self.batch_size = batch_size
        self.debug = debug
        self._binary = self._find_binary()

    def _find_binary(self) -> str:
        """Find llama-cli or llamacpp binary."""
        import shutil

        for name in ["llama-cli", "llama", "llama.cpp"]:
            binary = shutil.which(name)
            if binary:
                return binary
        raise RuntimeError("llama.cpp binary not found (install llama.cpp)")

    def _run_llama(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        cmd = [
            self._binary,
            "-m", self.model_path,
            "-n", str(max_tokens),
            "-t", str(self.threads),
            "-c", str(self.context_size),
            "--temp", str(temperature),
            "-p", prompt,
        ]

        if self.gpu_layers > 0:
            cmd.extend(["--gpu-layers", str(self.gpu_layers)])

        if system_prompt:
            cmd.extend(["--system", system_prompt])

        if self.debug:
            print(f"[llama.cpp] Running: {' '.join(cmd)}", file=__import__("sys").stderr)

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=max_tokens * 2,
            )
            if result.returncode != 0:
                raise RuntimeError(f"llama.cpp failed: {result.stderr}")
            return result.stdout
        except subprocess.TimeoutExpired:
            raise RuntimeError("llama.cpp timed out")

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        return self._run_llama(
            prompt, system_prompt, max_tokens, temperature, **kwargs
        )

    def chat(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048,
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        prompt = self._format_chat_prompt(messages)
        return self.generate(prompt, None, max_tokens, temperature, **kwargs)

    def _format_chat_prompt(self, messages: List[Dict[str, str]]) -> str:
        """Format messages as llama.cpp prompt."""
        parts = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                parts.append(f"System: {content}")
            elif role == "user":
                parts.append(f"User: {content}")
            elif role == "assistant":
                parts.append(f"Assistant: {content}")
        parts.append("Assistant:")
        return "\n\n".join(parts)

    def is_available(self) -> bool:
        import os

        return os.path.exists(self.model_path)


class HuggingFaceHubClient(LLMClient):
    """HuggingFace Hub models with optional LoRA adapter (transformers + PEFT)."""

    def __init__(
        self,
        base_model: str = "Qwen/Qwen2.5-Coder-7B-Instruct",
        adapter_repo: Optional[str] = None,
        quantization: bool = True,
        device: str = "auto",
        max_tokens: int = 2048,
        temperature: float = 0.7,
        debug: bool = False,
    ):
        self.base_model = base_model
        self.adapter_repo = adapter_repo
        self.quantization = quantization
        self.device = device
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.debug = debug
        self._model = None
        self._tokenizer = None

    def _ensure_loaded(self):
        """Lazy load model and tokenizer."""
        if self._model is not None:
            return

        if self.debug:
            print(f"[hf] Loading base model: {self.base_model}", file=__import__("sys").stderr)
            if self.adapter_repo:
                print(f"[hf] Loading adapter: {self.adapter_repo}", file=__import__("sys").stderr)

        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from peft import PeftModel

        quantization_config = None
        if self.quantization:
            quantization_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
                bnb_4bit_compute_dtype=torch.bfloat16,
            )

        self._model = AutoModelForCausalLM.from_pretrained(
            self.base_model,
            quantization_config=quantization_config,
            device_map=self.device,
            torch_dtype=torch.bfloat16 if not self.quantization else None,
        )

        if self.adapter_repo:
            self._model = PeftModel.from_pretrained(self._model, self.adapter_repo)

        self._tokenizer = AutoTokenizer.from_pretrained(self.base_model)

        if self.debug:
            print(f"[hf] Model loaded successfully", file=__import__("sys").stderr)

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        self._ensure_loaded()

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        return self.chat(messages, max_tokens, temperature, **kwargs)

    def chat(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048,
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        self._ensure_loaded()

        text = self._tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )

        inputs = self._tokenizer(text, return_tensors="pt").to(self._model.device)

        outputs = self._model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temperature,
            do_sample=temperature > 0.0,
            **kwargs,
        )

        input_len = inputs["input_ids"].shape[-1]
        generated_ids = outputs[0][input_len:]
        response = self._tokenizer.decode(generated_ids, skip_special_tokens=True)
        return response.strip()

    def is_available(self) -> bool:
        try:
            import transformers
            import peft
            return True
        except ImportError:
            return False


def create_llm_client(
    provider: str = "auto",
    model: Optional[str] = None,
    base_url: Optional[str] = None,
    adapter_repo: Optional[str] = None,
    debug: bool = False,
) -> LLMClient:
    """Factory function to create appropriate LLM client.

    Args:
        provider: "ollama", "llama.cpp", "huggingface", or "auto"
        model: Model name (for Ollama: tag, for HF: base model)
        base_url: API URL (for Ollama)
        adapter_repo: HuggingFace repo for LoRA adapter (e.g., "<your-hf-username>/EdgeAI-Docs-Qwen2.5-Coder-7B-Instruct")
        debug: Enable debug output
    """
    provider = provider.lower()

    if provider == "ollama":
        return OllamaClient(
            model=model or "qwen2.5:3b-instruct",
            base_url=base_url or "http://localhost:11434/v1",
            debug=debug,
        )

    if provider == "llama.cpp":
        model_path = model or os.path.expanduser("~/models/llama.bin")
        return LlamaCppClient(
            model_path=model_path,
            debug=debug,
        )

    if provider == "huggingface":
        return HuggingFaceHubClient(
            base_model=model or "Qwen/Qwen2.5-Coder-7B-Instruct",
            adapter_repo=adapter_repo,
            debug=debug,
        )

    if provider == "auto":
        try:
            return OllamaClient(
                model=model or "qwen2.5:3b-instruct",
                base_url=base_url or "http://localhost:11434/v1",
                debug=debug,
            )
        except Exception:
            pass

    raise ValueError(f"Cannot create LLM client for provider: {provider}")
