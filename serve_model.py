#!/usr/bin/env python3
"""Simple OpenAI-compatible server that loads a Hugging Face model.

Usage:
    # install dependencies first
    pip install transformers fastapi uvicorn torch

    # run
    MODEL_ID="<your-hf-username>/edgeai-docs-embedding-qwen-0.5b-instruct" \
    uvicorn serve_model:app --host 0.0.0.0 --port 11434

The gateway in this repo is already configured to talk to http://127.0.0.1:11434
by default when OPENAI_BASE_URL is set that way.  Just set the environment
variable and start this script; the repo .env already has the model name.

The server only implements a tiny subset of the OpenAI API (``/v1/models`` and
``/v1/completions``) and is intended for local development / testing.
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os

app = FastAPI()

MODEL_ID = os.environ.get("MODEL_ID")
if not MODEL_ID:
    raise RuntimeError("Please set MODEL_ID environment variable")

# lazy-load HF objects
_tokenizer = None
_model = None


def get_tokenizer():
    global _tokenizer
    if _tokenizer is None:
        from transformers import AutoTokenizer

        _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    return _tokenizer


def get_model():
    global _model
    if _model is None:
        from transformers import AutoModelForCausalLM
        import torch

        _model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=torch.float16)
        _model.to("cuda" if torch.cuda.is_available() else "cpu")
    return _model


class CompletionRequest(BaseModel):
    model: str
    prompt: str
    max_tokens: Optional[int] = 128


class CompletionResponse(BaseModel):
    id: str
    object: str
    choices: List[dict]
    model: str


@app.get("/v1/models")
def list_models():
    return {"data": [{"id": MODEL_ID, "object": "model"}]}


@app.post("/v1/completions", response_model=CompletionResponse)
def create_completion(req: CompletionRequest):
    if req.model != MODEL_ID:
        raise HTTPException(status_code=400, detail="model not found")
    tokenizer = get_tokenizer()
    model = get_model()
    inputs = tokenizer(req.prompt, return_tensors="pt").to(model.device)
    outputs = model.generate(**inputs, max_new_tokens=req.max_tokens)
    text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return {
        "id": req.model,
        "object": "text_completion",
        "choices": [{"text": text, "index": 0}],
        "model": req.model,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=11434)
