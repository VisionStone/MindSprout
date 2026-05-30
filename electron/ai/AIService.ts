import { safeStorage } from 'electron';
import log from 'electron-log';
import {
  OpenAIDriver,
  AnthropicDriver,
  OpenAICompatibleDriver,
} from '@llumiverse/drivers';
import type { PromptSegment, ExecutionOptions } from '@llumiverse/core';
import type { AIProviderConfig, TaskType } from '../../src/types';
import {
  buildGeneratePrompt,
  buildExpandPrompt,
  buildEnrichPrompt,
  MINDMAP_JSON_SCHEMA,
} from './prompts';

// ============================================================
// MindSprout — AI Service with Llumiverse
// ============================================================

export class AIService {
  private drivers = new Map<
    string,
    OpenAIDriver | AnthropicDriver | OpenAICompatibleDriver
  >();

  /**
   * Get or create an LLM driver for the given provider configuration.
   * Drivers are cached by provider_type + id.
   */
  getDriver(
    config: AIProviderConfig
  ): OpenAIDriver | AnthropicDriver | OpenAICompatibleDriver {
    const cacheKey = `${config.provider_type}-${config.id}`;

    const cached = this.drivers.get(cacheKey);
    if (cached) {
      return cached;
    }

    let apiKey: string;
    try {
      // Attempt to decrypt the API key using Electron safeStorage.
      // The key is expected to be stored as a base64-encoded encrypted buffer.
      const encrypted = Buffer.from(config.api_key, 'base64');
      apiKey = safeStorage.decryptString(encrypted);
    } catch {
      // Fallback to plain text if decryption fails (backward compatibility).
      apiKey = config.api_key;
      log.warn('[AIService] Failed to decrypt API key, using plain text');
    }

    let driver: OpenAIDriver | AnthropicDriver | OpenAICompatibleDriver;

    switch (config.provider_type) {
      case 'openai':
        driver = new OpenAIDriver({ apiKey });
        break;
      case 'anthropic':
        driver = new AnthropicDriver({
          apiKey,
          baseURL: config.base_url || undefined,
        });
        break;
      default:
        // Covers deepseek, qwen, custom, google, local, and any future providers.
        driver = new OpenAICompatibleDriver({
          apiKey,
          endpoint: config.base_url,
        });
        break;
    }

    this.drivers.set(cacheKey, driver);
    return driver;
  }

  /**
   * Execute a non-streaming AI task.
   * Uses structured JSON output (result_schema) for generate and expand tasks.
   */
  async execute(
    taskType: TaskType,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    if (signal?.aborted) {
      throw new Error('Task aborted');
    }

    const provider = params.provider as AIProviderConfig | undefined;
    if (!provider) {
      throw new Error('No AI provider configured');
    }

    const driver = this.getDriver(provider);
    const segments = this.buildSegments(taskType, params);
    const options = this.buildExecutionOptions(provider, taskType);

    log.info(`[AIService] Executing ${taskType} with model ${provider.model_id}`);

    const response = await driver.execute(segments, options);

    if (signal?.aborted) {
      throw new Error('Task aborted');
    }

    if (response.error) {
      throw new Error(
        `Result validation error: ${response.error.message}`
      );
    }

    const result = response.result?.[0];
    if (!result) {
      return null;
    }

    return result.value;
  }

  /**
   * Execute a streaming AI task.
   * Yields text chunks as they arrive from the model.
   */
  async *stream(
    taskType: TaskType,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): AsyncIterable<string> {
    if (signal?.aborted) {
      throw new Error('Task aborted');
    }

    const provider = params.provider as AIProviderConfig | undefined;
    if (!provider) {
      throw new Error('No AI provider configured');
    }

    const driver = this.getDriver(provider);
    const segments = this.buildSegments(taskType, params);
    const options = this.buildExecutionOptions(provider, taskType);

    log.info(`[AIService] Streaming ${taskType} with model ${provider.model_id}`);

    const completionStream = await driver.stream(segments, options);

    for await (const chunk of completionStream) {
      if (signal?.aborted) {
        throw new Error('Task aborted');
      }
      yield chunk;
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────────

  private buildSegments(
    taskType: TaskType,
    params: Record<string, unknown>
  ): PromptSegment[] {
    switch (taskType) {
      case 'generate':
        return buildGeneratePrompt(
          params.topic as string,
          params.ragContext as string | undefined
        );
      case 'expand':
        return buildExpandPrompt(
          params.nodeTitle as string,
          params.nodeContent as string,
          params.context as string | undefined,
          params.ragContext as string | undefined
        );
      case 'enrich':
        return buildEnrichPrompt(
          params.nodeTitle as string,
          params.nodeContent as string,
          params.context as string | undefined,
          params.ragContext as string | undefined
        );
      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }
  }

  private buildExecutionOptions(
    provider: AIProviderConfig,
    taskType: TaskType
  ): ExecutionOptions {
    const options: ExecutionOptions = {
      model: provider.model_id,
      model_options: this.buildModelOptions(provider),
    };

    // Structured output for generate and expand tasks
    if (taskType === 'generate' || taskType === 'expand') {
      options.result_schema = MINDMAP_JSON_SCHEMA;
    }

    return options;
  }

  private buildModelOptions(
    provider: AIProviderConfig
  ): ExecutionOptions['model_options'] {
    const common = {
      max_tokens: provider.max_tokens,
      temperature: provider.temperature,
    };

    switch (provider.provider_type) {
      case 'openai':
        return {
          _option_id: 'openai-text',
          ...common,
        } as ExecutionOptions['model_options'];
      case 'anthropic':
        return {
          _option_id: 'anthropic-claude',
          ...common,
        } as ExecutionOptions['model_options'];
      default:
        return {
          _option_id: 'text-fallback',
          ...common,
        } as ExecutionOptions['model_options'];
    }
  }
}
