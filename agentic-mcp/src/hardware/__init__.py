"""Hardware detection and configuration for different device types."""

import os
import platform
import subprocess
from enum import Enum
from typing import Dict, Any


class HardwareType(Enum):
    RASPBERRY_PI_5 = "rpi5"
    RASPBERRY_PI_4 = "rpi4"
    RASPBERRY_PI_OTHER = "rpi_other"
    NVIDIA_LAPTOP = "nvidia_laptop"
    NVIDIA_DESKTOP = "nvidia_desktop"
    AMD_GPU = "amd_gpu"
    GENERIC_LINUX = "generic_linux"
    UNKNOWN = "unknown"


def detect_raspberry_pi() -> bool:
    """Check if running on Raspberry Pi."""
    try:
        with open("/proc/cpuinfo", "r") as f:
            content = f.read()
            return "Raspberry Pi" in content or "bcm2712" in content
    except Exception:
        pass
    return False


def detect_gpu() -> Dict[str, Any]:
    """Detect GPU and return info."""
    gpu_info = {"vendor": None, "model": None, "compute_units": None}

    if platform.system() != "Linux":
        return gpu_info

    try:
        result = subprocess.run(
            ["lspci"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        pci_output = result.stdout.lower()

        if "nvidia" in pci_output:
            gpu_info["vendor"] = "nvidia"
            try:
                result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if result.returncode == 0:
                    gpu_info["model"] = result.stdout.strip().split("\n")[0]
            except Exception:
                pass
        elif "amd" in pci_output or "radeon" in pci_output:
            gpu_info["vendor"] = "amd"
        elif "intel" in pci_output:
            gpu_info["vendor"] = "intel"

    except Exception:
        pass

    return gpu_info


def detect_hardware() -> HardwareType:
    """Auto-detect the hardware type."""
    system = platform.system()
    machine = platform.machine()

    if detect_raspberry_pi():
        if "bcm2712" in _get_cpuinfo():
            return HardwareType.RASPBERRY_PI_5
        return HardwareType.RASPBERRY_PI_4

    gpu_info = detect_gpu()

    if gpu_info["vendor"] == "nvidia":
        if _is_laptop():
            return HardwareType.NVIDIA_LAPTOP
        return HardwareType.NVIDIA_DESKTOP

    if gpu_info["vendor"] == "amd":
        return HardwareType.AMD_GPU

    if system == "Linux":
        return HardwareType.GENERIC_LINUX

    return HardwareType.UNKNOWN


def _get_cpuinfo() -> str:
    try:
        with open("/proc/cpuinfo", "r") as f:
            return f.read().lower()
    except Exception:
        return ""


def _is_laptop() -> bool:
    if platform.system() != "Linux":
        return platform.system() == "Darwin"

    try:
        with open("/sys/class/dmi/id/chassis_type", "r") as f:
            chassis = f.read().strip()
            return chassis in ("10", "11", "8")
    except Exception:
        pass

    try:
        result = subprocess.run(
            ["loginctl"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return "seat0" in result.stdout
    except Exception:
        pass

    return False


def get_hardware_config(hardware: HardwareType) -> Dict[str, Any]:
    """Get optimal configuration for the detected hardware."""

    configs = {
        HardwareType.RASPBERRY_PI_5: {
            "max_tokens": 2048,
            "default_model": "qwen2.5:3b-instruct",
            "default_llm_url": "http://localhost:11434/v1",
            "context_length": 4096,
            "quantization": "q4_K_M",
            "threads": 4,
            "batch_size": 512,
            "use_gpu": False,
        },
        HardwareType.RASPBERRY_PI_4: {
            "max_tokens": 1024,
            "default_model": "qwen2.5:1.8b-instruct",
            "default_llm_url": "http://localhost:11434/v1",
            "context_length": 2048,
            "quantization": "q4_0",
            "threads": 4,
            "batch_size": 256,
            "use_gpu": False,
        },
        HardwareType.NVIDIA_LAPTOP: {
            "max_tokens": 4096,
            "default_model": "Qwen/Qwen2.5-Coder-7B-Instruct",
            "default_llm_provider": "huggingface",
            "default_adapter": "<your-hf-username>/EdgeAI-Docs-Qwen2.5-Coder-7B-Instruct",
            "default_llm_url": "http://localhost:11434/v1",
            "context_length": 8192,
            "quantization": "q4_0",
            "threads": 8,
            "batch_size": 2048,
            "use_gpu": True,
            "gpu_layers": 32,
        },
        HardwareType.NVIDIA_DESKTOP: {
            "max_tokens": 8192,
            "default_model": "llama3.1:8b-instruct-q4_0",
            "default_llm_url": "http://localhost:11434/v1",
            "context_length": 16384,
            "quantization": "q4_0",
            "threads": 16,
            "batch_size": 4096,
            "use_gpu": True,
            "gpu_layers": 99,
        },
        HardwareType.AMD_GPU: {
            "max_tokens": 4096,
            "default_model": "llama3.1:8b-instruct-q4_0",
            "default_llm_url": "http://localhost:11434/v1",
            "context_length": 8192,
            "quantization": "q4_0",
            "threads": 8,
            "batch_size": 2048,
            "use_gpu": True,
            "gpu_layers": 32,
        },
        HardwareType.GENERIC_LINUX: {
            "max_tokens": 2048,
            "default_model": "qwen2.5:3b-instruct",
            "default_llm_url": "http://localhost:11434/v1",
            "context_length": 4096,
            "quantization": "q4_K_M",
            "threads": 4,
            "batch_size": 512,
            "use_gpu": False,
        },
        HardwareType.UNKNOWN: {
            "max_tokens": 2048,
            "default_model": "qwen2.5:3b-instruct",
            "default_llm_url": "http://localhost:11434/v1",
            "context_length": 4096,
            "quantization": "q4_K_M",
            "threads": 4,
            "batch_size": 512,
            "use_gpu": False,
        },
    }

    return configs.get(hardware, configs[HardwareType.UNKNOWN])
