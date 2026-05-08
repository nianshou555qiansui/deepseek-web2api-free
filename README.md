# DeepSeek Chat API Proxy

> 将 DeepSeek Chat (chat.deepseek.com) 的私有 API 转换为 OpenAI / Anthropic 兼容格式。

**🤖 全 AI 生成声明**: 本项目没有一行人工手写代码，全部由 **DeepSeek v4 Flash 模型** + **Claude Code** 生成。

**免责声明**: 本项目仅限学习研究使用。非官方项目，与 DeepSeek 无关。使用需自行承担风险，不保证稳定性。

---

## 功能特性

- **OpenAI 兼容** — `/v1/chat/completions` 与 `/v1/models` 接口，支持 `stream` 模式
- **Anthropic 兼容** — `/v1/messages` 接口，支持 Claude API 格式
- **思维链（Reasoning/Thinking）** — 专家模式下自动分离思维链 tokens 并通过 `reasoning_content` 字段输出
- **专家模式（Expert Mode）** — 开启 R1 风格深度推理，响应含 THINK→RESPONSE 双阶段
- **Quick 模式** — V3 风格快速回答，低延迟
- **联网搜索** — 通过 `search_enabled` 参数启用实时搜索增强
- **Function Calling** — 基于 DSML（DeepSeek Markup Language）提示词注入实现工具调用
- **流式筛分** — `StreamSieve` 引擎，逐字符检测 DSML 工具调用标签，从 SSE 流中实时分离正文与工具调用
- **PoW 鉴权** — 自动完成 WASM 工作量证明（DeepSeekHashV1）挑战
- **会话管理** — 自动创建和管理 DeepSeek Chat 会话
- **环境变量控制** — `MODE`/`THINKING`/`SEARCH` 环境变量独立控制模式/思考/搜索，`PORT` 配置监听端口

---

## 快速开始

### 前置条件

- Python 3.10+
- 可以访问 `chat.deepseek.com` 的网络环境
- 有效的 DeepSeek 账号（免费注册）

### 安装

```bash
# 1. 克隆/下载本项目
cd DS反代--pre-开源

# 2. 安装依赖
pip install -r requirements.txt
```

### 获取凭证

你需要从浏览器开发者工具中提取你的 DeepSeek 凭证：

1. 用浏览器打开 [chat.deepseek.com](https://chat.deepseek.com) 并登录
2. 按 `F12` 打开开发者工具，切换到 **Network（网络）** 标签
3. 在页面中随便发一条消息
4. 在网络请求列表中点击任意一个请求（如 `chat/completion`）
5. 在请求头中找到以下两个值：

| 凭证 | 位置 | 示例 |
|------|------|------|
| `DEEPSEEK_TOKEN` | `Authorization` 请求头的 Bearer 值 | `eyJhbGciOiJIUzI1NiIs...` |
| `DEEPSEEK_COOKIES` | `Cookie` 请求头的完整值 | `cf_clearance=xxx; session=yyy; ...` |

### 配置

```bash
# 复制环境变量模板
cp .env.example .env
```

编辑 `.env` 文件：

```ini
# 必填：你的 DeepSeek 凭证
DEEPSEEK_TOKEN=eyJhbGciOiJIUzI1NiIs...
DEEPSEEK_COOKIES=cf_clearance=xxx; session=yyy; ...

# 可选：API 中暴露的模型名称（不影响实际使用的模型）
MODEL_NAME=deepseek-chat

# 可选：监听端口（默认 8080）
PORT=8080

# 可选：模式控制
MODE=auto
THINKING=auto
SEARCH=auto
```

### 启动

```bash
# 方式一：直接启动（使用 .env 中的 PORT 配置）
python -m uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}

# 方式二：使用启动脚本（会自动杀掉占用配置端口的进程）
start.bat
```

启动后终端会输出：
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080
```

### 验证

```bash
curl http://localhost:8080/health
# → {"status":"ok"}

curl http://localhost:8080/v1/models
# → {"object":"list","data":[{"id":"deepseek-chat","object":"model","created":1234567890,"owned_by":"deepseek"}]}
```

---

## API 文档

### `POST /v1/chat/completions`

OpenAI 兼容的聊天补全接口。

#### 请求体

```json
{
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "stream": false,
  "temperature": 0.7,
  "top_p": 0.95,
  "max_tokens": null,
  "thinking_mode": false,
  "search_enabled": false,
  "tools": null,
  "tool_choice": "auto"
}
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | `string` | `"deepseek-chat"` | 模型名称（不影响实际模型，仅用于标识） |
| `messages` | `array` | 必填 | 消息列表，支持 `system`/`user`/`assistant`/`tool` 角色 |
| `stream` | `boolean` | `false` | 是否流式输出 |
| `temperature` | `float` | `null` | 采样温度（传递给 DeepSeek 但效果取决于服务端） |
| `top_p` | `float` | `null` | Top-p 采样 |
| `max_tokens` | `int` | `null` | 最大生成 tokens |
| `thinking_mode` | `boolean` | `false` | 开启专家模式深度推理 |
| `search_enabled` | `boolean` | `false` | 开启联网搜索增强 |
| `tools` | `array` | `null` | OpenAI 格式的工具定义 |
| `tool_choice` | `string\|dict` | `null` | 工具选择策略 |

#### 非流式响应（`stream: false`）

```json
{
  "id": "chatcmpl-a1b2c3d4e5f6",
  "object": "chat.completion",
  "created": 1712345678,
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "你好！有什么可以帮助你的吗？"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": -1,
    "completion_tokens": -1,
    "total_tokens": -1
  }
}
```

> **注意**: `usage` 中的 tokens 数返回 `-1`，因为 DeepSeek Chat 不暴露 token 计数。这是已知限制。

#### 流式响应（`stream: true`）

标准 OpenAI SSE 格式，每个事件是一行 `data: {...}\n\n`，以 `data: [DONE]\n\n` 结尾：

```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"！"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

---

## MODE / THINKING / SEARCH 详解

这三个环境变量是独立的控制维度，共同决定每个请求的行为：

| 环境变量 | 可选值 | 默认值 | 说明 |
|----------|--------|--------|------|
| `MODE` | `auto` / `quick` / `expert` | `auto` | 控制 `model_type`：`"default"`(quick) 或 `"expert"` |
| `THINKING` | `auto` / `enabled` / `disabled` | `auto` | 控制 `thinking_enabled`：`true` / `false` |
| `SEARCH` | `auto` / `enabled` / `disabled` | `auto` | 控制 `search_enabled`（联网搜索）：`true` / `false` |

优先级：环境变量 > 请求参数。当环境变量为 `auto` 时，由客户端请求中的对应字段决定行为。

### 组合示例

| MODE | THINKING | SEARCH | 行为 | 典型场景 |
|------|----------|--------|------|----------|
| `auto` | `auto` | `auto` | 由客户端 `thinking_mode` / `search_enabled` 决定 | 完全由客户端灵活控制 |
| `quick` | `disabled` | `auto` | 强制 V3 快速模式，无推理 | 追求低延迟、不需要深度推理 |
| `expert` | `enabled` | `enabled` | 强制 R1 专家模式 + 思维链 + 联网搜索 | 深度推理 + 实时信息 |
| `quick` | `enabled` | `disabled` | 快速模式 + 思考，关闭联网 | 快速响应但附带推理过程 |

### 环境变量与请求参数互斥

```
MODE=auto, THINKING=auto, SEARCH=auto, 请求 thinking_mode=true  →  quick + 有 reasoning_content
MODE=expert, THINKING=disabled, 请求 thinking_mode=true  →  expert + 无 reasoning_content + 由客户端决定搜索
MODE=quick, THINKING=enabled, SEARCH=disabled  →  quick + 有 reasoning_content + 无联网搜索
```

---

## 思维链（Reasoning / Thinking）

当 `thinking_mode=true`（即 expert 模式）时，流式和非流式响应中推理 tokens 通过 `reasoning_content` 字段暴露。

### 流式响应中的推理

专家模式下 SSE 流先输出推理 tokens，再输出正式回答：

```
data: {"id":"...","choices":[{"index":0,"delta":{"reasoning_content":""},"finish_reason":null}]}

data: {"id":"...","choices":[{"index":0,"delta":{"reasoning_content":"首先"},"finish_reason":null}]}

data: {"id":"...","choices":[{"index":0,"delta":{"reasoning_content":"需要"},"finish_reason":null}]}
...
data: {"id":"...","choices":[{"index":0,"delta":{"content":"您好"},"finish_reason":null}]}

data: {"id":"...","choices":[{"index":0,"delta":{"content":"！"},"finish_reason":null}]}
...
data: {"id":"...","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
data: [DONE]
```

客户端如 NextChat、Open WebUI 等支持识别 `reasoning_content` 字段并展示思维链。如果客户端不支持，可以设置 `THINKING=disabled` 强制不输出推理过程。

---

## Function Calling（工具调用）

本项目通过 **DSML（DeepSeek Markup Language）** 提示词注入实现工具调用，利用 DeepSeek Chat 对 XML 标签的理解能力。

### 工作原理

1. `tools` 参数中的函数定义被转换为 DSML 格式的系统提示词
2. 提示词指导模型以指定 XML 格式响应工具调用
3. `StreamSieve` 引擎实时从 SSE 流中检测 DSML 标签
4. 匹配的工具调用被转换为 OpenAI 格式的 `tool_calls` 返回

### 使用示例

```python
import openai

client = openai.Client(base_url="http://localhost:8080/v1", api_key="not-needed")

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "北京的天气怎么样？"}],
    tools=[{
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称"}
                },
                "required": ["city"]
            }
        }
    }],
    tool_choice="auto",
)
```

### DSML 格式

DSML 使用类似 XML 的标签结构。当模型决定调用工具时，响应格式为：

```xml
<|DSML|tool_calls>
  <|DSML|invoke name="get_weather">
    <|DSML|parameter name="city"><![CDATA[北京]]></|DSML|parameter>
  </|DSML|invoke>
</|DSML|tool_calls>
```

`StreamSieve` 引擎在收到第一个 `<` 标签字符时就转至 "capture" 模式，积累全部 DSML 内容后一起解析。避免了模型"先输出正文再输工具调用"导致的文本污染。

---

## 架构概览

```
┌──────────────┐     OpenAI 格式      ┌──────────────────────┐
│  客户端应用   │ ◄───── SSE ────────► │   FastAPI Server      │
│ (NextChat,    │                      │   (server.py)         │
│  OpenWebUI,   │                      │                       │
│  custom)      │                      │  ┌─────────────────┐  │
└──────────────┘                      │  │  ChatAdapter     │  │
                                      │  │  (adapter.py)    │  │
                                      │  │  - PoW solving   │  │
                                      │  │  - Session mgmt  │  │
                                      │  │  - SSE parsing   │  │
                                      │  │  - Fragment stm  │  │
                                      │  └────────┬────────┘  │
                                      │           │            │
                                      │  ┌────────▼────────┐  │
                                      │  │ StreamSieve     │  │
                                      │  │ (tool_sieve.py) │  │
                                      │  │ - DSML detection│  │
                                      │  │ - Real-time sep │  │
                                      │  └─────────────────┘  │
                                      │                       │
                                      │  ┌─────────────────┐  │
                                      │  │ DSML Parser     │  │
                                      │  │ (tool_dsml.py)  │  │
                                      │  │ - XML parsing   │  │
                                      │  │ - Format conv   │  │
                                      │  └─────────────────┘  │
                                      └──────────┬────────────┘
                                                 │
                                      DeepSeek 原生协议
                                      (PoW + SSE)
                                                 │
                                      ┌──────────▼────────────┐
                                      │  chat.deepseek.com    │
                                      │  (DeepSeek Chat API)  │
                                      └───────────────────────┘
```

### 核心组件

| 文件 | 职责 |
|------|------|
| `server.py` | FastAPI 服务器，路由分发，MODE/THINKING 控制，OpenAI SSE 格式化 |
| `adapter.py` | DeepSeek 协议适配器 — PoW 挑战求解，会话创建/管理，原生 SSE 解析，fragment 状态机 |
| `anthropic_format.py` | Anthropic `/v1/messages` 格式转换 — 请求解析、响应组装、SSE 生成 |
| `tool_sieve.py` | StreamSieve 流式筛分引擎 — 逐字符检测 DSML 工具调用标签，实时分离正文与工具调用 |
| `tool_dsml.py` | DSML 解析器/生成器 — XML 格式的 DSML ↔ OpenAI tool_calls 双向转换 |
| `sha3_wasm_bg.wasm` | WASM 二进制，用于 DeepSeekHashV1 工作量证明求解 |

### 请求生命周期

1. **客户端请求** → `/v1/chat/completions` 收到 OpenAI 格式请求
2. **模式解析** → `server.py` 根据环境变量和请求参数确定 `model_type` 和 `thinking_enabled`
3. **DSML 注入** → 如有 `tools`，`build_dsml_tool_prompt()` 生成 DSML 格式系统提示词
4. **PoW 求解** → `adapter.py` 请求并求解 DeepSeekHashV1 挑战
5. **会话创建** → 创建新的 DeepSeek Chat 会话（可选复用）
6. **请求发送** → 以原生格式发送到 `/api/v0/chat/completion`
7. **响应处理**:
   - 非流式：解析 SSE 收集全部内容 → 检测工具调用 → 返回 OpenAI 格式
   - 流式：逐 token 转发 → StreamSieve 实时筛分 → 格式化 OpenAI SSE

---

## 文件结构

```
├── server.py            # FastAPI 服务器主入口
├── adapter.py           # DeepSeek 协议适配器 (PoW, 会话, SSE)
├── anthropic_format.py  # Anthropic /v1/messages 格式转换
├── tool_sieve.py        # StreamSieve 流式工具调用检测引擎
├── tool_dsml.py         # DSML 解析器/生成器
├── sha3_wasm_bg.wasm    # WASM PoW 求解器
├── requirements.txt     # Python 依赖
├── .env.example         # 环境变量模板
├── .env                 # 你的实际配置（已 .gitignore）
├── start.bat            # Windows 启动脚本
├── AGENTS.md            # AI Agent 参考文档
└── README.md            # 本文件
```

---

## 常见问题

### Q: 启动后请求返回 502 Bad Gateway

原因通常是凭证失效或网络问题：

1. 检查 `.env` 中的 `DEEPSEEK_TOKEN` 和 `DEEPSEEK_COOKIES` 是否仍然有效（登录 chat.deepseek.com 重新提取）
2. 检查能否访问 `chat.deepseek.com`（可能需要代理）
3. 检查控制台日志中的具体错误信息

### Q: 流式输出中只有 reasoning_content 没有 content

在 `thinking_mode=true`（专家模式）下，模型会先输出完整的推理过程再输出回答。如果你看到只有推理没有内容：

1. 等待模型完成推理（响应尚未结束）
2. 如果真是 bug：确认服务端版本，检查 `finish_reason` 是否正常输出。已知旧版本可能缺少 `finish_reason: "stop"` 帧

### Q: 如何关闭思维链/推理展示？

设置环境变量 `THINKING=disabled`，即使请求中 `thinking_mode=true` 也不会输出 `reasoning_content`。

### Q: 一直转圈 / 响应极慢

- 专家模式（`thinking_mode=true`）本身就更慢，模型在做完整推理
- PoW 求解在低性能机器上可能需要数秒
- 检查网络到 `chat.deepseek.com` 的延迟

### Q: Windows 下 curl 请求中文返回 422

Windows bash curl 默认编码为 GBK，发送 JSON 时中文字符可能被错误编码。解决方式：

```bash
# 方式一：将请求体写入 JSON 文件
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d @body.json

# 方式二：用 PowerShell（推荐）
Invoke-RestMethod -Uri http://localhost:8080/v1/chat/completions `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"model":"deepseek-chat","messages":[{"role":"user","content":"你好"}],"stream":true}'
```

### Q: `.env` 修改后没有生效

需要重启服务器进程。FastAPI 的 reload 模式不会重新加载环境变量：

```bash
# 先杀掉旧进程
taskkill /F /IM python.exe
# 再重新启动
python -m uvicorn server:app --host 0.0.0.0 --port 8080
```

### Q: 支持多轮对话吗？

不支持。每次请求都是独立的，服务器会创建新的 DeepSeek Chat 会话。多轮会话支持需要在应用层面（如 NextChat）维护上下文。

### Q: 如何查看 PoW 求解过程和调试信息？

适配器使用 `httpx` 发送请求，设置日志级别可查看详细请求/响应：

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Q: Token/凭证多久过期？

DeepSeek 的 Token 有效期不明确。如果遇到 `401` 或 `403` 响应，重新登录 chat.deepseek.com 并更新 `.env` 中的凭证。

---

## 环境变量参考

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `DEEPSEEK_TOKEN` | `""` | **是** | DeepSeek API 的 Bearer Token |
| `DEEPSEEK_COOKIES` | `""` | **是** | DeepSeek 的 Cookie 值 |
| `MODEL_NAME` | `"deepseek-chat"` | 否 | API 响应中显示的模型名称 |
| `PORT` | `8080` | 否 | 服务器监听端口 |
| `MODE` | `"auto"` | 否 | `auto` / `quick` / `expert` |
| `THINKING` | `"auto"` | 否 | `auto` / `enabled` / `disabled` |
| `SEARCH` | `"auto"` | 否 | `auto` / `enabled` / `disabled` |

---

## 依赖

| 包 | 最低版本 | 用途 |
|----|----------|------|
| `fastapi` | ≥0.100.0 | Web 框架 |
| `uvicorn` | ≥0.20.0 | ASGI 服务器 |
| `httpx` | ≥0.24.0 | HTTP 客户端（用于调用 DeepSeek API） |
| `wasmtime` | ≥14.0.0 | WASM 运行时（PoW 求解） |
| `python-dotenv` | ≥1.0.0 | `.env` 文件加载 |

---

## 许可

本项目仅供学习研究。使用时请遵守 DeepSeek 的服务条款。

**不提供任何保证**，不保证服务的可用性、准确性、稳定性。使用本项目所产生的任何后果由使用者自行承担。

---

## 致谢

- [DeepSeek](https://deepseek.com) — 优秀的 AI 模型与平台
- OpenAI — API 标准格式参考
- [wasmtime-py](https://github.com/bytecodealliance/wasmtime-py) — WASM 运行时
