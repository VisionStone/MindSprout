import { createSignal, onMount, For } from 'solid-js';
import type { AIProviderConfig, AIProviderType } from '@/types';

/* -------------------------------------------------------------------------- */
//  AIProviderForm
/* -------------------------------------------------------------------------- */

const providerTypeOptions: { value: AIProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'local', label: 'Local' },
  { value: 'custom', label: 'Custom' },
];

export default function AIProviderForm() {
  const [providers, setProviders] = createSignal<AIProviderConfig[]>([]);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [displayName, setDisplayName] = createSignal('');
  const [providerType, setProviderType] = createSignal<AIProviderType>('openai');
  const [apiKey, setApiKey] = createSignal('');
  const [baseUrl, setBaseUrl] = createSignal('');
  const [modelId, setModelId] = createSignal('');
  const [temperature, setTemperature] = createSignal(0.7);
  const [maxTokens, setMaxTokens] = createSignal(4096);
  const [isDefault, setIsDefault] = createSignal(false);
  const [testResult, setTestResult] = createSignal<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = createSignal(false);

  const loadProviders = async (): Promise<void> => {
    try {
      const rows =
        (await window.electronAPI.settings.getProviders()) as AIProviderConfig[];
      setProviders(rows);
    } catch (err) {
      console.error('Failed to load providers:', err);
    }
  };

  onMount(loadProviders);

  const resetForm = (): void => {
    setEditingId(null);
    setDisplayName('');
    setProviderType('openai');
    setApiKey('');
    setBaseUrl('');
    setModelId('');
    setTemperature(0.7);
    setMaxTokens(4096);
    setIsDefault(false);
    setTestResult(null);
  };

  const startEdit = (provider: AIProviderConfig): void => {
    setEditingId(provider.id);
    setDisplayName(provider.display_name);
    setProviderType(provider.provider_type);
    setApiKey(provider.api_key);
    setBaseUrl(provider.base_url);
    setModelId(provider.model_id);
    setTemperature(provider.temperature);
    setMaxTokens(provider.max_tokens);
    setIsDefault(provider.is_default === 1);
    setTestResult(null);
  };

  const handleSave = async (): Promise<void> => {
    try {
      const input = {
        id: editingId() ?? undefined,
        display_name: displayName(),
        provider_type: providerType(),
        api_key: apiKey(),
        base_url: baseUrl(),
        model_id: modelId(),
        temperature: temperature(),
        max_tokens: maxTokens(),
        is_default: isDefault(),
      };
      await window.electronAPI.settings.saveProvider(input);
      await loadProviders();
      resetForm();
    } catch (err) {
      console.error('Failed to save provider:', err);
      alert(
        '保存失败: ' +
          (err instanceof Error ? err.message : String(err))
      );
    }
  };

  const handleDelete = async (id: number): Promise<void> => {
    if (!confirm('确定要删除此提供商吗？')) return;
    try {
      await window.electronAPI.settings.deleteProvider(id);
      await loadProviders();
      if (editingId() === id) resetForm();
    } catch (err) {
      console.error('Failed to delete provider:', err);
    }
  };

  const handleTest = async (): Promise<void> => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const config: AIProviderConfig = {
        id: editingId() ?? 0,
        display_name: displayName(),
        provider_type: providerType(),
        api_key: apiKey(),
        base_url: baseUrl(),
        model_id: modelId(),
        temperature: temperature(),
        max_tokens: maxTokens(),
        is_default: isDefault() ? 1 : 0,
        created_at: new Date().toISOString(),
      };
      const result = (await window.electronAPI.ai.testProvider(config)) as {
        success: boolean;
        result?: string;
        error?: string;
      };
      if (result.success) {
        setTestResult({
          success: true,
          message: '连接成功: ' + (result.result ?? 'OK'),
        });
      } else {
        setTestResult({
          success: false,
          message: '连接失败: ' + (result.error ?? 'Unknown error'),
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message:
          '连接失败: ' +
          (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div class="provider-settings">
      {/* Provider list */}
      <div class="provider-list">
        <For each={providers()}>
          {(provider) => (
            <div
              class="provider-card"
              classList={{ active: editingId() === provider.id }}
              onClick={() => startEdit(provider)}
            >
              <div class="provider-card-header">
                <span class="provider-name">{provider.display_name}</span>
                {provider.is_default === 1 && (
                  <span class="provider-default-badge">默认</span>
                )}
              </div>
              <div class="provider-meta">
                {provider.provider_type} · {provider.model_id}
              </div>
              <button
                class="provider-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(provider.id);
                }}
              >
                删除
              </button>
            </div>
          )}
        </For>
        <button class="btn btn-secondary" onClick={resetForm}>
          + 新增提供商
        </button>
      </div>

      {/* Form */}
      <div class="provider-form">
        <div class="form-group">
          <label>显示名称</label>
          <input
            class="form-input"
            type="text"
            value={displayName()}
            onInput={(e) => setDisplayName(e.target.value)}
            placeholder="例如：OpenAI GPT-4"
          />
        </div>

        <div class="form-group">
          <label>提供商类型</label>
          <select
            class="form-input"
            value={providerType()}
            onChange={(e) =>
              setProviderType(e.currentTarget.value as AIProviderType)
            }
          >
            <For each={providerTypeOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </div>

        <div class="form-group">
          <label>API Key</label>
          <input
            class="form-input"
            type="password"
            value={apiKey()}
            onInput={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </div>

        <div class="form-group">
          <label>Base URL（可选）</label>
          <input
            class="form-input"
            type="text"
            value={baseUrl()}
            onInput={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </div>

        <div class="form-group">
          <label>模型 ID</label>
          <input
            class="form-input"
            type="text"
            value={modelId()}
            onInput={(e) => setModelId(e.target.value)}
            placeholder="gpt-4"
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>温度 (Temperature)</label>
            <input
              class="form-input"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature()}
              onInput={(e) => setTemperature(parseFloat(e.currentTarget.value))}
            />
          </div>
          <div class="form-group">
            <label>最大 Token</label>
            <input
              class="form-input"
              type="number"
              min="1"
              value={maxTokens()}
              onInput={(e) => setMaxTokens(parseInt(e.currentTarget.value, 10))}
            />
          </div>
        </div>

        <div class="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={isDefault()}
              onChange={(e) => setIsDefault(e.currentTarget.checked)}
            />
            设为默认提供商
          </label>
        </div>

        {testResult() && (
          <div
            class="test-result"
            classList={{
              success: testResult()!.success,
              error: !testResult()!.success,
            }}
          >
            {testResult()!.message}
          </div>
        )}

        <div class="provider-form-actions">
          <button
            class="btn btn-secondary"
            onClick={handleTest}
            disabled={isTesting()}
          >
            {isTesting() ? '测试中...' : '测试连接'}
          </button>
          <button class="btn btn-primary" onClick={handleSave}>
            {editingId() ? '保存修改' : '添加提供商'}
          </button>
        </div>
      </div>
    </div>
  );
}
