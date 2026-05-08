"""
OpenAI-compatible API proxy for DeepSeek Chat
Supports streaming, tool calling (via DSML prompt injection), content parts, expert mode.
"""
import json
import os
import time
import uuid
import asyncio
from typing import Optional, Union, Any

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from adapter import DeepSeekAdapter, TOKEN, COOKIES
from tool_dsml import (
    parse_dsml_tool_calls,
    format_tool_calls_for_prompt,
    build_dsml_tool_prompt,
)
from tool_sieve import StreamSieve, SieveEvent

load_dotenv()

MODEL_NAME = os.environ.get("MODEL_NAME", "deepseek-chat")
MODE = os.environ.get("MODE", "auto").strip().lower()
THINKING = os.environ.get("THINKING", "auto").strip().lower()
PORT = int(os.environ.get("PORT", "8080"))

app = FastAPI(title="DeepSeek Chat API (Expert Preview)", version="2.1.0-pre")
adapter = DeepSeekAdapter(token=TOKEN, cookies=COOKIES)

# In-memory session store
_sessions: dict[str, str] = {}


# ---- Pydantic models ----

class ContentPart(BaseModel):
    type: str
    text: Optional[str] = None


class FunctionCall(BaseModel):
    name: str
    arguments: str  # JSON string


class ToolCall(BaseModel):
    id: str
    type: str = "function"
    function: FunctionCall


class ChatMessage(BaseModel):
    role: str
    content: Optional[Union[str, list[ContentPart]]] = None
    tool_calls: Optional[list[ToolCall]] = None
    tool_call_id: Optional[str] = None


class FunctionDef(BaseModel):
    name: str
    description: Optional[str] = ""
    parameters: Optional[dict] = None


class ToolDef(BaseModel):
    type: str = "function"
    function: FunctionDef


class ChatCompletionRequest(BaseModel):
    model: Optional[str] = MODEL_NAME
    messages: list[ChatMessage]
    stream: Optional[bool] = False
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    tools: Optional[list[ToolDef]] = None
    tool_choice: Optional[Union[str, dict]] = None
    # Expert mode
    thinking_mode: Optional[bool] = False
    search_enabled: Optional[bool] = False


class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    created: int
    owned_by: str = "deepseek"


class ModelList(BaseModel):
    object: str = "list"
    data: list[ModelInfo]


# ---- Session helpers ----

def _get_session() -> str:
    sid = str(uuid.uuid4())
    ds_session = adapter.create_session()
    _sessions[sid] = ds_session
    return sid


def _get_ds_session(proxy_sid: str) -> str:
    ds = _sessions.get(proxy_sid)
    if ds is None:
        raise HTTPException(status_code=400, detail="Session not found")
    return ds


# ---- Message / prompt building ----

def _extract_text(content: Union[str, list[ContentPart], None]) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    return " ".join(
        p.text for p in content if p.type == "text" and p.text
    )


def _build_prompt(messages: list[ChatMessage], tools: list[ToolDef] | None = None) -> str:
    """Build a prompt string from messages, injecting tool definitions if present."""
    parts = []

    tool_prompt_text = None
    if tools:
        tool_prompt_text = build_dsml_tool_prompt([t.model_dump() for t in tools])

    has_system_message = any(m.role == "system" for m in messages)

    for m in messages:
        if m.role == "system":
            text = _extract_text(m.content)
            if tool_prompt_text:
                text = text + "\n\n" + tool_prompt_text if text else tool_prompt_text
            if text:
                parts.append(f"System: {text}")
        elif m.role == "user":
            parts.append(f"User: {_extract_text(m.content)}")
        elif m.role == "assistant":
            segs = []
            text = _extract_text(m.content)
            if text:
                segs.append(text)
            if m.tool_calls:
                dsml = format_tool_calls_for_prompt([tc.model_dump() for tc in m.tool_calls])
                if dsml:
                    segs.append(dsml)
            if segs:
                parts.append(f"Assistant: {' '.join(segs)}")
        elif m.role == "tool":
            result = _extract_text(m.content)
            parts.append(f"Tool result: {result[:1000]}")

    # Only inject standalone tool prompt if there is no system message to attach it to
    if tool_prompt_text and not has_system_message:
        parts.insert(0, f"System: {tool_prompt_text}")

    return "\n".join(parts)


# ---- OpenAI SSE helpers ----

def _openai_chunk(proxy_id: str, content: str = "", finish: bool = False,
                  reasoning_content: str = None) -> str:
    delta = {}
    if not finish:
        if reasoning_content is not None:
            delta["reasoning_content"] = reasoning_content
        elif content:
            delta["content"] = content
    choice = {
        "index": 0,
        "delta": delta,
        "finish_reason": "stop" if finish else None,
    }
    chunk = {
        "id": proxy_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": MODEL_NAME,
        "choices": [choice],
    }
    return f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"


def _emit_tool_calls_chunks(tool_calls: list[dict], chat_id: str) -> list[str]:
    """生成 OpenAI 流式 tool_calls SSE 事件。"""
    chunks = []
    created = int(time.time())
    for i, tc in enumerate(tool_calls):
        # 首帧：id + name
        delta = {
            "role": "assistant",
            "content": None,
            "tool_calls": [{
                "index": i,
                "id": tc["id"],
                "type": "function",
                "function": {"name": tc["function"]["name"], "arguments": ""},
            }],
        }
        chunks.append(f"data: {json.dumps({'id': chat_id, 'object': 'chat.completion.chunk', 'created': created, 'model': MODEL_NAME, 'choices': [{'index': 0, 'delta': delta, 'finish_reason': None}]}, ensure_ascii=False)}\n\n")
        # 次帧：arguments
        delta2 = {
            "tool_calls": [{
                "index": i,
                "function": {"arguments": tc["function"]["arguments"]},
            }],
        }
        chunks.append(f"data: {json.dumps({'id': chat_id, 'object': 'chat.completion.chunk', 'created': created, 'model': MODEL_NAME, 'choices': [{'index': 0, 'delta': delta2, 'finish_reason': None}]}, ensure_ascii=False)}\n\n")
    # finish
    chunks.append(f"data: {json.dumps({'id': chat_id, 'object': 'chat.completion.chunk', 'created': created, 'model': MODEL_NAME, 'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'tool_calls'}]}, ensure_ascii=False)}\n\n")
    return chunks


# ---- Extract tool names ----

def _get_tool_names(tools: list[ToolDef] | None) -> list[str]:
    names = []
    for t in tools or []:
        if t.function and t.function.name:
            names.append(t.function.name)
    return names


# ---- Response parsing for non-streaming ----

def _parse_response_for_tools(text: str, tool_names: list[str]) -> tuple[list[dict] | None, str]:
    """Parse response text for DSML tool calls. Returns (tool_calls, cleaned_text)."""
    return parse_dsml_tool_calls(text, tool_names)


# ---- Endpoints ----

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/v1/models")
async def list_models():
    return ModelList(data=[
        ModelInfo(id=MODEL_NAME, created=int(time.time())),
    ])


@app.post("/v1/chat/completions")
async def chat_completions(req: ChatCompletionRequest):
    proxy_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    prompt = _build_prompt(req.messages, req.tools)

    # MODE controls model_type (quick → "default", expert → "expert")
    if MODE == "expert":
        model_type = "expert"
    else:
        model_type = "default"  # quick mode or auto, matches native request format

    # THINKING controls thinking_enabled independent of mode
    if THINKING == "enabled":
        thinking = True
    elif THINKING == "disabled":
        thinking = False
    else:
        thinking = req.thinking_mode or False

    search = req.search_enabled or False

    search = req.search_enabled or False

    if req.stream:
        return await _handle_stream(proxy_id, prompt, req.tools, model_type=model_type, thinking_mode=thinking, search_enabled=search)

    return _handle_nonstream(proxy_id, prompt, req.tools, model_type=model_type, thinking_mode=thinking, search_enabled=search)


def _handle_nonstream(proxy_id: str, prompt: str, tools: list[ToolDef] | None = None,
                      model_type: str | None = None,
                      thinking_mode: bool = False, search_enabled: bool = False):
    """Non-streaming completion with tool call detection."""
    sid = _get_session()
    ds_id = _get_ds_session(sid)
    content = adapter.chat(ds_id, prompt, model_type=model_type,
                           thinking_enabled=thinking_mode, search_enabled=search_enabled)

    tool_names = _get_tool_names(tools)
    tool_calls, cleaned = _parse_response_for_tools(content, tool_names)

    if tool_calls:
        return {
            "id": proxy_id,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": MODEL_NAME,
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": tool_calls,
                },
                "finish_reason": "tool_calls",
            }],
            "usage": {"prompt_tokens": -1, "completion_tokens": -1, "total_tokens": -1},
        }

    return {
        "id": proxy_id,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": MODEL_NAME,
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": cleaned or content,
            },
            "finish_reason": "stop",
        }],
        "usage": {"prompt_tokens": -1, "completion_tokens": -1, "total_tokens": -1},
    }


async def _handle_stream(proxy_id: str, prompt: str, tools: list[ToolDef] | None = None,
                         model_type: str | None = None,
                         thinking_mode: bool = False, search_enabled: bool = False):
    """Streaming completion with StreamSieve tool call detection and expert mode support."""
    sid = _get_session()
    ds_id = _get_ds_session(sid)
    tool_names = _get_tool_names(tools)

    async def event_stream():
        yield _openai_chunk(proxy_id, finish=False)
        role_sent = False

        def _parse_fn(text):
            return parse_dsml_tool_calls(text, tool_names)

        sieve = StreamSieve(parse_fn=_parse_fn)
        full_buf = ""

        for token in adapter.chat_stream(ds_id, prompt,
                                          model_type=model_type,
                                          thinking_enabled=thinking_mode,
                                          search_enabled=search_enabled):
            if isinstance(token, dict):
                tt = token.get("__type")
                if tt == "status":
                    if token["status"] == "FINISHED":
                        break
                    continue
                elif tt == "thinking":
                    # Emit reasoning_content for thinking tokens
                    content = token.get("content", "")
                    if content:
                        if not role_sent:
                            yield _openai_chunk(proxy_id, reasoning_content="")
                            role_sent = True
                        yield _openai_chunk(proxy_id, reasoning_content=content)
                    continue

            # Normal text token (str) — feed to sieve
            full_buf += token
            for evt in sieve.feed(token):
                if evt.type == "text":
                    if evt.data:
                        if not role_sent:
                            if thinking_mode:
                                yield _openai_chunk(proxy_id, reasoning_content="")
                            role_sent = True
                        yield _openai_chunk(proxy_id, content=evt.data)
                elif evt.type == "tool_calls":
                    for chunk in _emit_tool_calls_chunks(evt.data, proxy_id):
                        yield chunk
                    yield "data: [DONE]\n\n"
                    return

        # Flush sieve
        had_tool = False
        for evt in sieve.flush():
            if evt.type == "text" and evt.data:
                if not role_sent:
                    if thinking_mode:
                        yield _openai_chunk(proxy_id, reasoning_content="")
                    role_sent = True
                yield _openai_chunk(proxy_id, content=evt.data)
            elif evt.type == "tool_calls":
                had_tool = True
                for chunk in _emit_tool_calls_chunks(evt.data, proxy_id):
                    yield chunk

        if had_tool:
            yield "data: [DONE]\n\n"
            return

        # Fallback: sieve 没抓到，全量重试
        if not had_tool and full_buf:
            tc_result, _ = parse_dsml_tool_calls(full_buf, tool_names)
            if tc_result:
                if not role_sent:
                    if thinking_mode:
                        yield _openai_chunk(proxy_id, reasoning_content="")
                    role_sent = True
                for chunk in _emit_tool_calls_chunks(tc_result, proxy_id):
                    yield chunk
                yield "data: [DONE]\n\n"
                return

        yield _openai_chunk(proxy_id, finish=True)
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
