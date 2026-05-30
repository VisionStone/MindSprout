import { createSignal } from 'solid-js';
import type { AIProviderType } from '@/types';

/* -------------------------------------------------------------------------- */
//  FirstTimeWizard
/* -------------------------------------------------------------------------- */

interface FirstTimeWizardProps {
  onComplete: () => void;
}

export default function FirstTimeWizard(props: FirstTimeWizardProps) {
  const [step, setStep] = createSignal(0);
  const [displayName, setDisplayName] = createSignal('');
  const [providerType, setProviderType] = createSignal<AIProviderType>('openai');
  const [apiKey, setApiKey] = createSignal('');
  const [baseUrl, setBaseUrl] = createSignal('');
  const [modelId, setModelId] = createSignal('');
  const [isSaving, setIsSaving] = createSignal(false);

  const providerOptions: { value: AIProviderType; label: string }[] = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google' },
    { value: 'local', label: 'Local / Ollama' },
    { value: 'custom', label: 'Custom' },
  ];

  const canProceed = (): boolean => {
    if (step() === 1) {
      return displayName().trim() !== '' && modelId().trim() !== '';
    }
    return true;
  };

  const handleNext = async (): Promise<void> => {
    if (step() === 1) {
      setIsSaving(true);
      try {
        await window.electronAPI.settings.saveProvider({
          display_name: displayName().trim(),
          provider_type: providerType(),
          api_key: apiKey(),
          base_url: baseUrl().trim() || undefined,
          model_id: modelId().trim(),
          is_default: true,
        });
        await window.electronAPI.settings.setSetting('firstTimeComplete', true);
      } catch (err) {
        console.error('Failed to save provider:', err);
        alert('保存失败: ' + (err instanceof Error ? err.message : String(err)));
        setIsSaving(false);
        return; // Do not proceed if save failed
      }
      setIsSaving(false);
    }

    if (step() < 2) {
      setStep(step() + 1);
    } else {
      props.onComplete();
    }
  };

  const handlePrev = (): void => {
    if (step() > 0) {
      setStep(step() - 1);
    }
  };

  return (
    <div class="wizard-overlay">
      <div class="wizard-card">
        {/* Progress dots */}
        <div class="wizard-progress">
          {[0, 1, 2].map((i) => (
            <div
              class="wizard-dot"
              classList={{ active: i === step(), completed: i < step() }}
            />
          ))}
        </div>

        {/* Step content */}
        <div class="wizard-content">
          {step() === 0 && (
            <>
              <h2>欢迎使用 MindSprout</h2>
              <p>
                MindSprout 是一款 AI 驱动的思维导图工具，帮助您快速整理思路、
                生成创意并可视化知识。
              </p>
              <p>让我们花一分钟完成初始配置。</p>
            </>
          )}

          {step() === 1 && (
            <>
              <h2>配置 AI 提供商</h2>
              <p>设置您偏好的 AI 服务，用于思维导图的智能生成与扩展。</p>

              <div class="form-group">
                <label>显示名称</label>
                <input
                  class="form-input"
                  type="text"
                  placeholder="例如：我的 OpenAI"
                  value={displayName()}
                  onInput={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div class="form-group">
                <label>提供商类型</label>
                <select
                  class="form-input"
                  value={providerType()}
                  onChange={(e) => setProviderType(e.currentTarget.value as AIProviderType)}
                >
                  {providerOptions.map((opt) => (
                    <option value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div class="form-group">
                <label>API Key</label>
                <input
                  class="form-input"
                  type="password"
                  placeholder="sk-..."
                  value={apiKey()}
                  onInput={(e) => setApiKey(e.target.value)}
                />
              </div>

              <div class="form-group">
                <label>Base URL（可选）</label>
                <input
                  class="form-input"
                  type="text"
                  placeholder="https://api.openai.com/v1"
                  value={baseUrl()}
                  onInput={(e) => setBaseUrl(e.target.value)}
                />
              </div>

              <div class="form-group">
                <label>模型 ID</label>
                <input
                  class="form-input"
                  type="text"
                  placeholder="gpt-4o"
                  value={modelId()}
                  onInput={(e) => setModelId(e.target.value)}
                />
              </div>
            </>
          )}

          {step() === 2 && (
            <>
              <h2>准备就绪</h2>
              <p>
                配置完成！您可以开始创建思维导图了。
              </p>
              <p>
                快捷键提示：
              </p>
              <ul style={{ 'padding-left': '20px', 'margin-top': '8px' }}>
                <li>双击节点编辑内容</li>
                <li>Space 打开/关闭描述面板</li>
                <li>+ / - 折叠或展开节点</li>
                <li>方向键在节点间导航</li>
                <li>Delete 删除选中节点</li>
              </ul>
            </>
          )}
        </div>

        {/* Actions */}
        <div class="wizard-actions">
          {step() > 0 && (
            <button class="btn btn-secondary" onClick={handlePrev} disabled={isSaving()}>
              上一步
            </button>
          )}
          <button
            class="btn btn-primary"
            onClick={handleNext}
            disabled={!canProceed() || isSaving()}
            style={{ 'margin-left': 'auto' }}
          >
            {isSaving() ? '保存中...' : step() === 2 ? '开始使用' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  );
}
