# Llumiverse 使用指南

## 目录

1. [概述](#1-概述)
2. [安装](#2-安装)
3. [核心概念](#3-核心概念)
4. [Driver 的创建与选择](#4-driver-的创建与选择)
5. [构建 Prompt](#5-构建-prompt)
6. [非流式调用：execute](#6-非流式调用execute)
7. [流式调用：stream](#7-流式调用stream)
8. [结构化输出：JSON Schema](#8-结构化输出json-schema)
9. [Tool Calling（函数调用）](#9-tool-calling函数调用)
10. [Embeddings](#10-embeddings)
11. [错误处理](#11-错误处理)
12. [完整示例](#12-完整示例)

---

## 1. 概述

**Llumiverse** 是 LLM 生态系统的统一连接层。它为 Node.js / Bun / TypeScript 环境提供了强类型的、模块化的接口来与几乎任何 AI 提供商交互。

**可以把它理解为 "LLM 领域的 JDBC 或 ODBC"。**

它的核心定位非常纯粹——只负责**抽象连接和执行协议**，让你可以在不修改业务代码的情况下切换提供商。它不做 prompt 模板引擎、不做 chain 编排、不做 "魔法式" 的编排逻辑。你构建应用，它负责管道。

### 支持的提供商

| 提供商 | Chat | Streaming | 工具调用 | Embeddings |
|---|---|---|---|---|
| OpenAI | ✅ | ✅ | ✅ | ✅ |
| Anthropic | ✅ | ✅ | ✅ | — |
| AWS Bedrock | ✅ | ✅ | ✅ | ✅ |
| Google Vertex AI | ✅ | ✅ | ✅ | ✅ |
| Azure OpenAI | ✅ | ✅ | ✅ | ✅ |
| Groq | ✅ | ✅ | ✅ | — |
| HuggingFace | ✅ | ✅ | — | — |
| Mistral AI | ✅ | ✅ | ✅ | ✅ |
| 兼容 OpenAI 格式的服务 | ✅ | ✅ | ✅ | ✅ |
| xAI (Grok) | ✅ | ✅ | ✅ | ✅ |

### 架构思想

```
你的业务代码
      │
      ▼
┌─────────────────────┐
│   Driver 接口        │  ← @llumiverse/core 定义
│   execute()          │
│   stream()           │
│   generateEmbeddings()│
└──────┬──────────────┘
       │
       ├── OpenAIDriver        → OpenAI API
       ├── AnthropicDriver     → Claude API
       ├── OpenAICompatible    → DeepSeek / Qwen / Ollama 等
       ├── BedrockDriver       → AWS Bedrock
       ├── VertexAIDriver      → Google Vertex AI
       └── ...更多
```

---

## 2. 安装

```bash
npm install @llumiverse/core @llumiverse/drivers
```

两个包的分工：

| 包 | 作用 |
|---|---|
| `@llumiverse/core` | 类型定义、接口、枚举（`PromptRole`、`PromptSegment`、`ExecutionOptions`、`JSONSchema` 等） |
| `@llumiverse/drivers` | 所有提供商的具体实现（`OpenAIDriver`、`AnthropicDriver`、`BedrockDriver` 等） |

要求：**Node.js 22+**（Bun 1.0+ 实验性支持）。

---

## 3. 核心概念

### 3.1 核心类型

```typescript
import {
  PromptRole,        // 枚举：system | user | assistant
  PromptSegment,     // 接口：{ role: PromptRole; content: string }
  ExecutionOptions,  // 接口：执行选项
  JSONSchema,        // 类型：JSON Schema 定义
  ToolDefinition,    // 接口：工具定义
} from '@llumiverse/core';
```

### 3.2 PromptSegment

每次 LLM 调用由一组有序的消息（`PromptSegment[]`）组成，每条消息包含角色和内容：

```typescript
const messages: PromptSegment[] = [
  {
    role: PromptRole.system,
    content: 'You are a helpful assistant.',
  },
  {
    role: PromptRole.user,
    content: 'Write a haiku about programming.',
  },
];
```

### 3.3 ExecutionOptions

控制模型行为的选项：

```typescript
const options: ExecutionOptions = {
  model: 'gpt-4o',              // 模型 ID（必填）
  temperature: 0.7,             // 温度（0-2）
  max_tokens: 1024,             // 最大生成 Token 数
  result_schema: { ... },       // JSON Schema 结构化输出
  tools: [...],                 // 工具定义
  model_options: {              // 驱动特定的选项
    _option_id: 'openai-text',
    max_tokens: 1024,
    temperature: 0.7,
  },
};
```

---

## 4. Driver 的创建与选择

### 4.1 OpenAI

```typescript
import { OpenAIDriver } from '@llumiverse/drivers';

const driver = new OpenAIDriver({
  apiKey: process.env.OPENAI_API_KEY,
  // baseURL: 'https://api.openai.com/v1',  // 可选，默认值
});
```

### 4.2 Anthropic (Claude)

```typescript
import { AnthropicDriver } from '@llumiverse/drivers';

const driver = new AnthropicDriver({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com',  // 可选
});
```

### 4.3 OpenAI Compatible（DeepSeek / Qwen / Ollama 等）

这是最通用的 Driver，适用于任何兼容 OpenAI Chat Completions API 格式的服务：

```typescript
import { OpenAICompatibleDriver } from '@llumiverse/drivers';

// DeepSeek
const driver = new OpenAICompatibleDriver({
  apiKey: process.env.DEEPSEEK_API_KEY,
  endpoint: 'https://api.deepseek.com/v1',
});

// 本地 Ollama
const driver = new OpenAICompatibleDriver({
  apiKey: 'ollama',                     // Ollama 不需要真实 key
  endpoint: 'http://localhost:11434/v1',
});

// 阿里通义千问
const driver = new OpenAICompatibleDriver({
  apiKey: process.env.DASHSCOPE_API_KEY,
  endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});
```

### 4.4 AWS Bedrock

```typescript
import { BedrockDriver } from '@llumiverse/drivers';

const driver = new BedrockDriver({
  region: 'us-west-2',
  // 自动使用本地 AWS 凭证
});
```

### 4.5 Google Vertex AI

```typescript
import { VertexAIDriver } from '@llumiverse/drivers';

const driver = new VertexAIDriver({
  project: process.env.GOOGLE_PROJECT_ID,
  region: 'us-central1',
});
```

### 4.6 多 Driver 管理（推荐模式）

在实际项目中，通常会用一个 Map 来缓存和管理多个 Driver：

```typescript
import { OpenAIDriver, AnthropicDriver, OpenAICompatibleDriver } from '@llumiverse/drivers';

type AnyDriver = OpenAIDriver | AnthropicDriver | OpenAICompatibleDriver;

class DriverManager {
  private drivers = new Map<string, AnyDriver>();

  getDriver(config: {
    provider: 'openai' | 'anthropic' | 'deepseek' | 'qwen' | 'custom';
    apiKey: string;
    baseURL?: string;
  }): AnyDriver {
    const key = `${config.provider}-${config.baseURL ?? 'default'}`;
    const cached = this.drivers.get(key);
    if (cached) return cached;

    let driver: AnyDriver;

    switch (config.provider) {
      case 'openai':
        driver = new OpenAIDriver({ apiKey: config.apiKey });
        break;
      case 'anthropic':
        driver = new AnthropicDriver({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
        });
        break;
      default:
        // deepseek, qwen, custom 等一切兼容 OpenAI 格式的服务
        driver = new OpenAICompatibleDriver({
          apiKey: config.apiKey,
          endpoint: config.baseURL!,
        });
        break;
    }

    this.drivers.set(key, driver);
    return driver;
  }
}
```

---

## 5. 构建 Prompt

Prompt 由 `PromptSegment[]` 表示，最常用的模式是 `system + user` 两条消息：

```typescript
const prompt: PromptSegment[] = [
  {
    role: PromptRole.system,
    content: '你是一个专业的翻译助手。请将用户输入翻译成英文，只输出翻译结果。',
  },
  {
    role: PromptRole.user,
    content: '人工智能正在改变世界。',
  },
];
```

### 多轮对话

```typescript
const conversation: PromptSegment[] = [
  { role: PromptRole.system, content: '你是一个技术顾问。' },
  { role: PromptRole.user, content: '什么是微服务架构？' },
  { role: PromptRole.assistant, content: '微服务是一种将应用拆分为多个独立服务的架构风格...' },
  { role: PromptRole.user, content: '它有什么缺点？' },
];
```

### 实用函数模式

建议将 Prompt 构建封装为纯函数，便于测试和复用：

```typescript
function buildTranslatePrompt(text: string, targetLang: string): PromptSegment[] {
  return [
    {
      role: PromptRole.system,
      content: `You are a translator. Translate the user's text to ${targetLang}. Output only the translation.`,
    },
    {
      role: PromptRole.user,
      content: text,
    },
  ];
}

function buildSummaryPrompt(text: string, maxLength: number): PromptSegment[] {
  return [
    {
      role: PromptRole.system,
      content: `Summarize the following text in no more than ${maxLength} words.`,
    },
    {
      role: PromptRole.user,
      content: text,
    },
  ];
}
```

---

## 6. 非流式调用：execute

`execute()` 是最基本的调用方式，发送 Prompt 后等待完整响应。

```typescript
const driver = new OpenAIDriver({ apiKey: process.env.OPENAI_API_KEY });

const prompt: PromptSegment[] = [
  { role: PromptRole.system, content: 'You are a helpful coding assistant.' },
  { role: PromptRole.user, content: 'Write a hello world in Python.' },
];

const response = await driver.execute(prompt, {
  model: 'gpt-4o',
  temperature: 0.7,
  max_tokens: 1024,
});

// 提取首个结果
console.log(response.result[0].value);
// 输出: "print('Hello, World!')"
```

### 响应结构

```typescript
interface Completion {
  result: Array<{
    value: unknown;     // 生成的文本（或解析后的 JSON）
    // ... 其他元数据
  }>;
  error?: {
    message: string;    // 验证错误时存在
    // ... 其他错误信息
  };
  tool_use?: Array<{   // 工具调用时存在
    tool_name: string;
    tool_input: Record<string, unknown>;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}
```

### 支持取消（AbortSignal）

```typescript
const controller = new AbortController();

// 5 秒后取消
setTimeout(() => controller.abort(), 5000);

try {
  const response = await driver.execute(prompt, {
    model: 'gpt-4o',
    signal: controller.signal,  // 传入 AbortSignal
  });
} catch (err) {
  if (controller.signal.aborted) {
    console.log('请求已取消');
  } else {
    console.error('请求失败:', err);
  }
}
```

---

## 7. 流式调用：stream

`stream()` 返回 `AsyncIterable<string>`，用于逐块接收生成内容，适合实时展示场景。

```typescript
const stream = await driver.stream(
  [
    { role: PromptRole.system, content: 'You are a poet.' },
    { role: PromptRole.user, content: 'Write a poem about AI.' },
  ],
  {
    model: 'gpt-4o',
    temperature: 0.9,
  }
);

let fullText = '';
for await (const chunk of stream) {
  process.stdout.write(chunk);  // 实时输出
  fullText += chunk;
}

console.log('\n--- 完整响应 ---');
console.log(fullText);
```

### 流式 + 进度反馈

```typescript
async function streamWithProgress(
  prompt: PromptSegment[],
  options: ExecutionOptions,
  onProgress: (chunk: string, progress: number) => void
): Promise<string> {
  const stream = await driver.stream(prompt, options);

  let accumulated = '';
  let chunkCount = 0;

  for await (const chunk of stream) {
    accumulated += chunk;
    chunkCount++;
    const progress = Math.min(10 + chunkCount * 2, 95);
    onProgress(chunk, progress);
  }

  return accumulated;
}

// 使用
const result = await streamWithProgress(
  prompt,
  { model: 'gpt-4o' },
  (chunk, progress) => {
    updateUI(chunk, progress);
  }
);
```

### 流式取消

```typescript
const controller = new AbortController();
const stream = await driver.stream(prompt, {
  model: 'gpt-4o',
  signal: controller.signal,
});

// 在另一个地方调用 controller.abort() 即可停止

try {
  for await (const chunk of stream) {
    if (controller.signal.aborted) break;
    process.stdout.write(chunk);
  }
} catch (err) {
  if (controller.signal.aborted) {
    console.log('Stream cancelled by user');
  }
}
```

---

## 8. 结构化输出：JSON Schema

Llumiverse 支持通过 `result_schema` 强制 LLM 输出符合指定 JSON Schema 的结构化数据。它会在底层自动转换为对应提供商的方式（例如 OpenAI 使用 `response_format`，其他提供商使用 prompt 约束）。

### 基本用法

```typescript
const schema = {
  type: 'object',
  properties: {
    sentiment: {
      type: 'string',
      enum: ['positive', 'neutral', 'negative'],
      description: '情感倾向',
    },
    confidence: {
      type: 'number',
      description: '置信度 (0-1)',
    },
    summary: {
      type: 'string',
      description: '一句话摘要',
    },
  },
  required: ['sentiment', 'confidence', 'summary'],
};

const response = await driver.execute(
  [
    { role: PromptRole.system, content: 'Analyze the sentiment of the text.' },
    { role: PromptRole.user, content: 'I love this product! It works perfectly.' },
  ],
  {
    model: 'gpt-4o',
    result_schema: schema,
  }
);

const data = response.result[0].value as {
  sentiment: string;
  confidence: number;
  summary: string;
};

console.log(data.sentiment);  // "positive"
console.log(data.confidence); // 0.98
console.log(data.summary);    // "User expresses strong satisfaction with the product."
```

### 递归结构（嵌套对象）

```typescript
const mindmapSchema = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          children: {
            type: 'array',
            items: { $ref: '#/$defs/node' },
          },
        },
        required: ['title'],
      },
    },
  },
  required: ['topic', 'nodes'],
  $defs: {
    node: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        children: {
          type: 'array',
          items: { $ref: '#/$defs/node' },
        },
      },
      required: ['title'],
    },
  },
};

const response = await driver.execute(
  [
    { role: PromptRole.system, content: 'Generate a mind map about TypeScript.' },
    { role: PromptRole.user, content: 'Create a detailed mind map covering TypeScript basics.' },
  ],
  {
    model: 'gpt-4o',
    result_schema: mindmapSchema,
  }
);

const mindmap = response.result[0].value;
console.log(JSON.stringify(mindmap, null, 2));
```

### 验证失败处理

当 LLM 返回的结果不符合 Schema 时，`response.error` 会包含错误信息：

```typescript
const response = await driver.execute(prompt, {
  model: 'gpt-4o',
  result_schema: schema,
});

if (response.error) {
  console.error('Schema validation failed:', response.error.message);
  // 可以进行重试或降级处理
} else {
  const data = response.result[0].value;
}
```

---

## 9. Tool Calling（函数调用）

Llumiverse 统一了不同提供商的工具定义格式，只需定义一次即可在任何支持的提供商上使用。

### 定义工具

```typescript
import type { ToolDefinition } from '@llumiverse/core';

const getWeatherTool: ToolDefinition = {
  name: 'get_weather',
  description: '获取指定地点的当前天气',
  input_schema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: '城市名称，例如 "北京"',
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: '温度单位',
      },
    },
    required: ['location'],
  },
};

const searchDatabaseTool: ToolDefinition = {
  name: 'search_documents',
  description: '搜索知识库中的文档',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      limit: { type: 'number', description: '返回结果数量，默认 5' },
    },
    required: ['query'],
  },
};
```

### 执行工具调用

```typescript
const response = await driver.execute(
  [
    {
      role: PromptRole.system,
      content: 'You are a helpful assistant with access to weather data and a knowledge base.',
    },
    {
      role: PromptRole.user,
      content: 'What is the weather in Tokyo today?',
    },
  ],
  {
    model: 'gpt-4o',
    tools: [getWeatherTool, searchDatabaseTool],
  }
);

// 处理工具调用
if (response.tool_use && response.tool_use.length > 0) {
  for (const tool of response.tool_use) {
    console.log(`调用工具: ${tool.tool_name}`);
    console.log(`参数:`, tool.tool_input);

    // 执行实际的函数
    let result: unknown;
    if (tool.tool_name === 'get_weather') {
      result = await fetchWeather(tool.tool_input.location, tool.tool_input.unit);
    } else if (tool.tool_name === 'search_documents') {
      result = await searchDocuments(tool.tool_input.query, tool.tool_input.limit);
    }

    console.log(`工具结果:`, result);
  }
}
```

---

## 10. Embeddings

Llumiverse 将 embeddings 统一为 `{ values: number[] }` 结构。

```typescript
const embedding = await driver.generateEmbeddings({
  content: 'Llumiverse is a universal LLM driver library.',
});

console.log(embedding.values);
// 输出: [0.012, -0.034, 0.078, ...]  ← 一个浮点数数组

console.log(`Embedding dimension: ${embedding.values.length}`);
// 输出: "Embedding dimension: 1536"  (取决于模型)
```

### 批量 Embeddings

```typescript
// 部分驱动支持批量处理
const embeddings = await Promise.all(
  texts.map(text => driver.generateEmbeddings({ content: text }))
);

const vectors = embeddings.map(e => e.values);
```

---

## 11. 错误处理

### 基本错误模式

```typescript
try {
  const response = await driver.execute(prompt, { model: 'gpt-4o' });

  if (response.error) {
    // Schema 验证错误（result_schema 不匹配）
    throw new Error(`Validation error: ${response.error.message}`);
  }

  return response.result[0].value;
} catch (err) {
  if (err instanceof Error && err.message.includes('aborted')) {
    console.log('Request was cancelled');
  } else {
    console.error('LLM call failed:', err);
    // 可在这里实现重试逻辑
  }
}
```

### 重试模式

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`Attempt ${attempt}/${maxRetries} failed:`, err);

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw lastError;
}

// 使用
const result = await withRetry(() =>
  driver.execute(prompt, { model: 'gpt-4o' })
);
```

---

## 12. 完整示例

### 示例 1：简单的文本分类服务

```typescript
import { OpenAIDriver } from '@llumiverse/drivers';
import { PromptRole } from '@llumiverse/core';
import type { PromptSegment, ExecutionOptions, JSONSchema } from '@llumiverse/core';

const driver = new OpenAIDriver({
  apiKey: process.env.OPENAI_API_KEY,
});

const classificationSchema: JSONSchema = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: ['技术', '娱乐', '体育', '政治', '教育', '其他'],
    },
    confidence: { type: 'number' },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['category', 'confidence', 'tags'],
};

async function classifyText(text: string) {
  const prompt: PromptSegment[] = [
    {
      role: PromptRole.system,
      content: 'You are a text classifier. Analyze the text and return category, confidence, and relevant tags.',
    },
    {
      role: PromptRole.user,
      content: text,
    },
  ];

  const options: ExecutionOptions = {
    model: 'gpt-4o-mini',
    temperature: 0.1,
    result_schema: classificationSchema,
  };

  const response = await driver.execute(prompt, options);

  if (response.error) {
    throw new Error(`Classification failed: ${response.error.message}`);
  }

  return response.result[0].value as {
    category: string;
    confidence: number;
    tags: string[];
  };
}

// 使用
const result = await classifyText(
  'OpenAI 刚刚发布了 GPT-5，性能提升了 10 倍。'
);
console.log(result.category);   // "技术"
console.log(result.confidence); // 0.95
console.log(result.tags);       // ["OpenAI", "GPT-5", "人工智能"]
```

### 示例 2：流式翻译 + 多 Provider 切换

```typescript
import { OpenAIDriver, AnthropicDriver, OpenAICompatibleDriver } from '@llumiverse/drivers';
import { PromptRole } from '@llumiverse/core';
import type { PromptSegment } from '@llumiverse/core';

type ProviderType = 'openai' | 'anthropic' | 'deepseek';

async function createDriver(type: ProviderType, apiKey: string, baseURL?: string) {
  switch (type) {
    case 'openai':
      return new OpenAIDriver({ apiKey });
    case 'anthropic':
      return new AnthropicDriver({ apiKey, baseURL });
    case 'deepseek':
      return new OpenAICompatibleDriver({
        apiKey,
        endpoint: baseURL ?? 'https://api.deepseek.com/v1',
      });
  }
}

async function* translateStream(
  text: string,
  targetLang: string,
  provider: ProviderType,
  apiKey: string
): AsyncIterable<string> {
  const driver = await createDriver(provider, apiKey);

  const prompt: PromptSegment[] = [
    {
      role: PromptRole.system,
      content: `Translate the following text to ${targetLang}. Preserve the original format.`,
    },
    {
      role: PromptRole.user,
      content: text,
    },
  ];

  const stream = await driver.stream(prompt, {
    model: provider === 'openai' ? 'gpt-4o' :
           provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' :
           'deepseek-chat',
    temperature: 0.3,
  });

  for await (const chunk of stream) {
    yield chunk;
  }
}

// 使用 - 只需切换 provider 参数即可切换底层模型
async function main() {
  const text = 'Machine learning is transforming every industry.';

  console.log('=== OpenAI 翻译 ===');
  for await (const chunk of translateStream(text, 'Chinese', 'openai', process.env.OPENAI_API_KEY!)) {
    process.stdout.write(chunk);
  }

  console.log('\n\n=== DeepSeek 翻译 ===');
  for await (const chunk of translateStream(text, 'Chinese', 'deepseek', process.env.DEEPSEEK_API_KEY!)) {
    process.stdout.write(chunk);
  }
}
```

### 示例 3：完整的服务封装

```typescript
import { OpenAIDriver, AnthropicDriver, OpenAICompatibleDriver } from '@llumiverse/drivers';
import { PromptRole } from '@llumiverse/core';
import type { PromptSegment, ExecutionOptions, JSONSchema } from '@llumiverse/core';

type DriverMap = Map<string, OpenAIDriver | AnthropicDriver | OpenAICompatibleDriver>;

interface ProviderConfig {
  type: 'openai' | 'anthropic' | 'deepseek' | 'qwen' | 'custom';
  apiKey: string;
  baseURL?: string;
  defaultModel: string;
  temperature?: number;
  maxTokens?: number;
}

class LLMService {
  private drivers: DriverMap = new Map();

  addProvider(name: string, config: ProviderConfig): void {
    let driver: OpenAIDriver | AnthropicDriver | OpenAICompatibleDriver;

    switch (config.type) {
      case 'openai':
        driver = new OpenAIDriver({ apiKey: config.apiKey });
        break;
      case 'anthropic':
        driver = new AnthropicDriver({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
        });
        break;
      default:
        driver = new OpenAICompatibleDriver({
          apiKey: config.apiKey,
          endpoint: config.baseURL!,
        });
        break;
    }

    this.drivers.set(name, driver);
  }

  async execute(
    providerName: string,
    messages: PromptSegment[],
    overrides?: Partial<ExecutionOptions>
  ) {
    const driver = this.drivers.get(providerName);
    if (!driver) throw new Error(`Provider "${providerName}" not found`);

    const response = await driver.execute(messages, overrides ?? {});

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result[0].value;
  }

  async executeStructured<T>(
    providerName: string,
    messages: PromptSegment[],
    schema: JSONSchema,
    overrides?: Partial<ExecutionOptions>
  ): Promise<T> {
    const driver = this.drivers.get(providerName);
    if (!driver) throw new Error(`Provider "${providerName}" not found`);

    const response = await driver.execute(messages, {
      ...overrides,
      result_schema: schema,
    });

    if (response.error) {
      throw new Error(`Structured output error: ${response.error.message}`);
    }

    return response.result[0].value as T;
  }

  async *stream(
    providerName: string,
    messages: PromptSegment[],
    overrides?: Partial<ExecutionOptions>
  ): AsyncIterable<string> {
    const driver = this.drivers.get(providerName);
    if (!driver) throw new Error(`Provider "${providerName}" not found`);

    const stream = await driver.stream(messages, overrides ?? {});
    for await (const chunk of stream) {
      yield chunk;
    }
  }

  removeProvider(name: string): void {
    this.drivers.delete(name);
  }
}

// ── 使用示例 ──

const llm = new LLMService();

llm.addProvider('openai-main', {
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  defaultModel: 'gpt-4o',
  temperature: 0.7,
});

llm.addProvider('deepseek', {
  type: 'deepseek',
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com/v1',
  defaultModel: 'deepseek-chat',
});

llm.addProvider('local', {
  type: 'custom',
  apiKey: 'sk-no-key-required',
  baseURL: 'http://localhost:11434/v1',
  defaultModel: 'llama3',
});

// 非结构化调用
const summary = await llm.execute('openai-main', [
  { role: PromptRole.user, content: 'Explain quantum computing in 3 sentences.' },
], { model: 'gpt-4o', temperature: 0.3 });
console.log(summary);

// 结构化调用
const analysis = await llm.executeStructured<{ sentiment: string; score: number }>(
  'deepseek',
  [
    { role: PromptRole.system, content: 'Analyze the sentiment.' },
    { role: PromptRole.user, content: 'This product is amazing!' },
  ],
  {
    type: 'object',
    properties: {
      sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
      score: { type: 'number' },
    },
    required: ['sentiment', 'score'],
  },
  { model: 'deepseek-chat' }
);
console.log(analysis.sentiment, analysis.score);

// 流式调用
console.log('\n流式输出:');
for await (const chunk of llm.stream('local', [
  { role: PromptRole.user, content: '写一首关于人工智能的诗' },
], { model: 'llama3' })) {
  process.stdout.write(chunk);
}
```

---

## 总结

Llumiverse 的核心设计理念可以用一句话概括：**"Write once, run on any LLM"**。

它不试图成为 AI 应用框架（那是 LangChain 或 Vercel AI SDK 的领域），而是专注于做 LLM 领域的 "数据库驱动层"——提供统一的、类型安全的接口，让你在切换底层模型时无需改动业务代码。

### 关键要点

| 场景 | 推荐方式 |
|---|---|
| 一次性获取完整结果 | `driver.execute()` |
| 需要实时展示生成过程 | `driver.stream()`（AsyncIterable） |
| 强制输出特定 JSON 格式 | `ExecutionOptions.result_schema` |
| 模型需要调用外部工具 | `ExecutionOptions.tools` |
| 文本向量化 | `driver.generateEmbeddings()` |
| 切换模型提供商 | 只需更换 Driver 构造函数 |
| 请求取消 | `AbortController` + `AbortSignal` |