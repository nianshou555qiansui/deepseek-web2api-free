# DeepSeek Chat API Proxy

> 将 DeepSeek Chat (chat.deepseek.com) 的私有 API 转换为 OpenAI / Anthropic 兼容格式。

> **🤖 全 AI 生成声明**: 本项目没有一行人工手写代码。所有的 API 端点设计、协议逆向、PoW 求解、SSE 解析、格式映射、文档编写等等全部由 **DeepSeek v4 Flash 模型** + **Claude Code** 协作完成。至于为什么用 Flash 版本？因为作者钱不够用，用不起 Pro 😅。但事实证明 Flash 版本非！常！好！—— 推理能力够强、响应速度够快、性价比拉满，猛猛夸！

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
- **管理面板** — 内置 Web 管理界面，支持请求统计、账号池管理（多账号轮询/添加/删除/重登录）

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

### 管理面板

项目内置 Web 管理界面，提供请求统计和账号池管理功能：

```
浏览器打开 http://localhost:8080/webui/
```

默认密码为 `.env` 中设置的 `DEEPSEEK_ADMIN_PASSWORD`（未设置则为 `admin`）。

管理面板功能：
- **概览** — 实时请求统计（总量/成功/失败/延迟/运行时长）+ 账号池状态一览
- **账号池** — 添加/删除账号，一键重登录异常账号

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

### `POST /v1/messages`

Anthropic Claude API 兼容的聊天补全接口。

#### 请求体

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "system": "You are a helpful assistant.",
  "stream": false,
  "thinking": {"type": "enabled", "budget_tokens": 16000},
  "tools": [
    {"name": "get_weather", "description": "获取天气", "input_schema": {"type": "object", "properties": {"city": {"type": "string"}}}}
  ]
}
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | `string` | `"claude-3-5-sonnet-20241022"` | 模型名称（不影响实际模型，仅用于标识） |
| `messages` | `array` | 必填 | 消息列表，支持 `user`/`assistant` 角色 |
| `system` | `string\|array` | `null` | 系统提示词 |
| `stream` | `boolean` | `false` | 是否流式输出 |
| `thinking` | `object` | `null` | `{"type": "enabled"}` 开启思考模式 |
| `tools` | `array` | `null` | Anthropic 格式的工具定义（`name`/`description`/`input_schema`） |
| `max_tokens` | `int` | `null` | 被忽略（DeepSeek 不支持） |
| `metadata` | `object` | `null` | 被忽略 |
| `stop_sequences` | `array` | `null` | 被忽略 |

#### 非流式响应（`stream: false`）

```json
{
  "id": "msg_xxxxxxxxxxxxxxxxxxxxxxxx",
  "type": "message",
  "role": "assistant",
  "content": [
    {"type": "text", "text": "你好！有什么可以帮助你的吗？"}
  ],
  "model": "deepseek-chat",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {"input_tokens": -1, "output_tokens": -1}
}
```

工具调用时：

```json
"content": [
  {"type": "tool_use", "id": "toolu_xxx", "name": "get_weather", "input": {"city": "北京"}}
],
"stop_reason": "tool_use"
```

#### 流式响应（`stream: true`）

Anthropic 原生 SSE 格式，包含 `message_start`、`content_block_start`、`content_block_delta`、`content_block_stop`、`message_delta`、`message_stop` 事件：

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_...","type":"message","role":"assistant","content":[],"model":"deepseek-chat","stop_reason":null,...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"推理过程..."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"回答内容"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":-1}}

event: message_stop
data: {}
```

> **注意**: Anthropic 端点与 OpenAI 端点共享相同的底层 adapter，MODE/THINKING/SEARCH 环境变量同时影响两个端点。

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
┌──────────────────────────────────────────────────────────────────┐
│                          管理面板                                │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │ 前端 SPA (webui/)    │  │ Admin API (admin.py)             │ │
│  │ · 概览面板           │◄─┤ · 密码认证 / 统计 / 账号管理     │ │
│  │ · 账号池管理         │  │ · 重登录触发                     │ │
│  └──────────────────────┘  └───────┬──────────────────────────┘ │
└────────────────────────────────────┼────────────────────────────┘
                                     │
┌──────────────┐     OpenAI 格式      ┌────────▼─────────────────┐
│  客户端应用   │ ◄───── SSE ────────► │   FastAPI Server          │
│ (NextChat,    │                      │   (server.py)             │
│  OpenWebUI,   │                      │                           │
│  custom)      │                      │  ┌─────────────────────┐  │
└──────────────┘                      │  │  AccountPool         │  │
                                      │  │  (account_pool.py)   │  │
                                      │  │  · 多账号轮询选择    │  │
                                      │  │  · 状态追踪          │  │
                                      │  │  · 健康检查          │  │
                                      │  └────────┬────────────┘  │
                                      │           │                │
                                      │  ┌────────▼────────────┐  │
                                      │  │  ChatAdapter         │  │
                                      │  │  (adapter.py)        │  │
                                      │  │  - PoW solving       │  │
                                      │  │  - Session mgmt      │  │
                                      │  │  - SSE parsing       │  │
                                      │  │  - Fragment stm      │  │
                                      │  └────────┬────────────┘  │
                                      │           │                │
                                      │  ┌────────▼────────────┐  │
                                      │  │ StreamSieve          │  │
                                      │  │ (tool_sieve.py)      │  │
                                      │  │ - DSML detection     │  │
                                      │  │ - Real-time sep      │  │
                                      │  └──────────────────────┘  │
                                      │                           │
                                      │  ┌──────────────────────┐  │
                                      │  │ DSML Parser          │  │
                                      │  │ (tool_dsml.py)       │  │
                                      │  │ - XML parsing        │  │
                                      │  │ - Format conv        │  │
                                      │  └──────────────────────┘  │
                                      └──────────┬────────────────┘
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
| `account_pool.py` | 多账号管理 — CRUD、状态追踪（idle/busy/error）、轮询分配、健康检查 |
| `admin.py` | 管理后台 API — 密码认证、请求统计、账号池增删查改、重登录触发 |
| `webui/` | 管理面板前端 — 纯静态 SPA，零 build 依赖 |
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
├── account_pool.py      # 多账号池管理 (轮询、状态追踪、健康检查)
├── admin.py             # 管理后台 API 端点
├── webui/               # 管理面板前端 (纯静态 SPA)
│   ├── index.html
│   ├── app.js
│   └── style.css
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
| `DEEPSEEK_ADMIN_PASSWORD` | `"admin"` | 否 | 管理面板登录密码 |

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

本项目使用 **Unlicense** 协议正式发布到公有领域（public domain）。

```
This is free and unencumbered software released into the public domain.
```

你可以自由地复制、修改、发布、使用、编译、出售或分发本软件，无论用于商业或非商业目的，无论以任何形式。

**不提供任何保证**，不保证服务的可用性、准确性、稳定性。使用本项目所产生的任何后果由使用者自行承担。

---

## 致谢

- [DeepSeek](https://deepseek.com) — 优秀的 AI 模型与平台
- OpenAI — API 标准格式参考
- [wasmtime-py](https://github.com/bytecodealliance/wasmtime-py) — WASM 运行时
