import { PromptRole } from '@llumiverse/core';
import type { JSONSchema, PromptSegment } from '@llumiverse/core';

// ============================================================
// MindSprout — AI Prompts & JSON Schemas
// ============================================================

export const SYSTEM_PROMPTS = {
  generate: `你是一个专业的思维导图生成助手。请根据用户提供的主题，生成一个结构清晰、逻辑完整的思维导图。

要求：
1. 思维导图应该有明确的层级结构，从中心主题向外展开
2. 每个节点包含简洁的标题(title)和详细的内容描述(content)
3. 子节点(children)应该与父节点有明确的逻辑关系
4. 内容应该全面且有深度，覆盖主题的主要方面
5. 请严格按照JSON格式输出，确保输出可以被正确解析`,

  expand: `你是一个专业的思维导图扩展助手。请根据用户提供的节点信息，为其生成相关的子节点。

要求：
1. 子节点应该与父节点主题紧密相关，逻辑清晰
2. 每个子节点包含简洁的标题(title)和详细的内容描述(content)
3. 可以适当生成更深层的子节点(children)
4. 保持思维导图的整体逻辑一致性
5. 请严格按照JSON格式输出，确保输出可以被正确解析`,

  enrich: `你是一个专业的内容优化助手。请根据用户提供的节点标题和内容，为其生成更丰富、更详细的内容描述。

要求：
1. 内容应该信息丰富、有深度
2. 可以添加具体的例子、数据或应用场景
3. 保持内容的准确性和专业性
4. 直接输出优化后的内容描述文本，不需要JSON格式`,

  rag_generate: `你是一个专业的思维导图生成助手。用户将提供一些参考文档内容，请根据这些参考内容和主题，生成一个结构清晰、逻辑完整的思维导图。

要求：
1. 严格基于提供的参考文档内容生成思维导图，不要编造文档中没有的信息
2. 思维导图应该有明确的层级结构，从中心主题向外展开
3. 每个节点包含简洁的标题(title)和详细的内容描述(content)
4. 子节点(children)应该与父节点有明确的逻辑关系
5. 内容应该全面且有深度，覆盖参考文档的主要方面
6. 请严格按照JSON格式输出，确保输出可以被正确解析`,

  rag_expand: `你是一个专业的思维导图扩展助手。用户将提供一些参考文档内容，请根据这些参考内容和节点信息，为其生成相关的子节点。

要求：
1. 严格基于提供的参考文档内容生成子节点，不要编造文档中没有的信息
2. 子节点应该与父节点主题紧密相关，逻辑清晰
3. 每个子节点包含简洁的标题(title)和详细的内容描述(content)
4. 可以适当生成更深层的子节点(children)
5. 保持思维导图的整体逻辑一致性
6. 请严格按照JSON格式输出，确保输出可以被正确解析`,

  rag_enrich: `你是一个专业的内容优化助手。用户将提供一些参考文档内容，请根据这些参考内容和节点信息，为其生成更丰富、更详细的内容描述。

要求：
1. 严格基于提供的参考文档内容生成描述，不要编造文档中没有的信息
2. 内容应该信息丰富、有深度
3. 可以添加参考文档中具体的例子、数据或应用场景
4. 保持内容的准确性和专业性
5. 直接输出优化后的内容描述文本，不需要JSON格式`,
};

export const MINDMAP_JSON_SCHEMA: JSONSchema = {
  type: 'object',
  description: '思维导图节点结构',
  properties: {
    nodes: {
      type: 'array',
      description: '思维导图节点列表',
      items: {
        $ref: '#/$defs/node',
      },
    },
  },
  required: ['nodes'],
  $defs: {
    node: {
      type: 'object',
      description: '单个思维导图节点',
      properties: {
        title: {
          type: 'string',
          description: '节点标题，简洁明了',
        },
        content: {
          type: 'string',
          description: '节点内容描述，详细说明该节点的信息',
        },
        children: {
          type: 'array',
          description: '子节点列表',
          items: {
            $ref: '#/$defs/node',
          },
        },
      },
      required: ['title'],
    },
  },
};

export function buildGeneratePrompt(topic: string, ragContext?: string): PromptSegment[] {
  if (ragContext) {
    return buildRAGGeneratePrompt(topic, ragContext);
  }
  return [
    {
      role: PromptRole.system,
      content: SYSTEM_PROMPTS.generate,
    },
    {
      role: PromptRole.user,
      content: `请为主题"${topic}"生成一个思维导图，返回符合以下JSON Schema的结构：\n${JSON.stringify(MINDMAP_JSON_SCHEMA, null, 2)}`,
    },
  ];
}

export function buildRAGGeneratePrompt(topic: string, ragContext: string): PromptSegment[] {
  return [
    {
      role: PromptRole.system,
      content: SYSTEM_PROMPTS.rag_generate,
    },
    {
      role: PromptRole.user,
      content: `请基于以下参考文档内容，为主题"${topic}"生成一个思维导图：\n\n---参考文档---\n${ragContext}\n---参考文档结束---\n\n返回符合以下JSON Schema的结构：\n${JSON.stringify(MINDMAP_JSON_SCHEMA, null, 2)}`,
    },
  ];
}

export function buildExpandPrompt(
  nodeTitle: string,
  nodeContent: string,
  context?: string,
  ragContext?: string
): PromptSegment[] {
  const systemPrompt = ragContext ? SYSTEM_PROMPTS.rag_expand : SYSTEM_PROMPTS.expand;
  let userPrompt = `请为以下节点生成子节点：\n\n节点标题：${nodeTitle}\n节点内容：${nodeContent}`;
  if (ragContext) {
    userPrompt += `\n\n---参考文档---\n${ragContext}\n---参考文档结束---`;
  }
  if (context) {
    userPrompt += `\n\n上下文信息：${context}`;
  }
  userPrompt += `\n\n返回符合以下JSON Schema的结构：\n${JSON.stringify(MINDMAP_JSON_SCHEMA, null, 2)}`;

  return [
    {
      role: PromptRole.system,
      content: systemPrompt,
    },
    {
      role: PromptRole.user,
      content: userPrompt,
    },
  ];
}

export function buildEnrichPrompt(
  nodeTitle: string,
  nodeContent: string,
  context?: string,
  ragContext?: string
): PromptSegment[] {
  const systemPrompt = ragContext ? SYSTEM_PROMPTS.rag_enrich : SYSTEM_PROMPTS.enrich;
  let userPrompt = `请优化以下节点的内容描述：\n\n节点标题：${nodeTitle}\n当前内容：${nodeContent}`;
  if (ragContext) {
    userPrompt += `\n\n---参考文档---\n${ragContext}\n---参考文档结束---`;
  }
  if (context) {
    userPrompt += `\n\n上下文信息：${context}`;
  }
  userPrompt += `\n\n请直接输出优化后的内容描述文本。`;

  return [
    {
      role: PromptRole.system,
      content: systemPrompt,
    },
    {
      role: PromptRole.user,
      content: userPrompt,
    },
  ];
}
