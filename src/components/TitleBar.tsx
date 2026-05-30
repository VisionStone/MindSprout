import { createSignal, onMount } from 'solid-js';
import {
  state,
  toggleTheme,
  toggleNotification,
} from '@/stores';

const isMac = navigator.platform.toLowerCase().includes('mac');
const isWindows = navigator.platform.toLowerCase().includes('win');

type Page = 'list' | 'editor' | 'settings' | 'knowledge-base';

interface TitleBarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  currentMindmapTitle?: string | null;
}

export default function TitleBar(props: TitleBarProps) {
  const [isMaximized, setIsMaximized] = createSignal(false);

  onMount(() => {
    if (!isMac && window.electronAPI?.window) {
      window.electronAPI.window.isMaximized().then(setIsMaximized);
    }
  });

  const handleMinimize = () => {
    window.electronAPI?.window?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.window?.maximize();
  };

  const handleUnmaximize = () => {
    window.electronAPI?.window?.unmaximize();
  };

  const handleClose = () => {
    window.electronAPI?.window?.close();
  };

  const isActive = (target: Page) => props.page === target;

  return (
    <div
      class="title-bar"
      style={{
        'app-region': 'drag',
        '-webkit-app-region': 'drag',
      }}
    >
      {/* Left section: macOS traffic light spacer + logo */}
      <div class="title-bar-left">
        {isMac && <div class="title-bar-mac-spacer" />}
        <div
          class="title-bar-logo"
          style={{
            'app-region': 'no-drag',
            '-webkit-app-region': 'no-drag',
          }}
        >
          <svg viewBox="0 0 32 32" style="width:22px;height:22px;flex-shrink:0;">
            <defs>
              <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#8B5CF6"/>
                <stop offset="100%" stop-color="#6366F1"/>
              </linearGradient>
            </defs>
            <circle cx="16" cy="16" r="14" fill="url(#logoGrad)" opacity="0.15"/>
            <circle cx="16" cy="16" r="10" fill="none" stroke="url(#logoGrad)" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="8 4"/>
            <circle cx="16" cy="16" r="4" fill="url(#logoGrad)"/>
            <circle cx="16" cy="16" r="1.8" fill="white"/>
            <line x1="16" y1="2" x2="16" y2="7" stroke="url(#logoGrad)" stroke-width="2" stroke-linecap="round"/>
            <line x1="16" y1="25" x2="16" y2="30" stroke="url(#logoGrad)" stroke-width="2" stroke-linecap="round"/>
            <line x1="2" y1="16" x2="7" y2="16" stroke="url(#logoGrad)" stroke-width="2" stroke-linecap="round"/>
            <line x1="25" y1="16" x2="30" y2="16" stroke="url(#logoGrad)" stroke-width="2" stroke-linecap="round"/>
            <circle cx="16" cy="5" r="1.2" fill="url(#logoGrad)"/>
            <circle cx="16" cy="27" r="1.2" fill="url(#logoGrad)"/>
            <circle cx="5" cy="16" r="1.2" fill="url(#logoGrad)"/>
            <circle cx="27" cy="16" r="1.2" fill="url(#logoGrad)"/>
          </svg>
          <span class="title-bar-logo-text">MindSprout</span>
        </div>
      </div>

      {/* Center: current mindmap breadcrumb */}
      <div class="title-bar-center">
        {props.currentMindmapTitle && (
          <button
            class="title-bar-mindmap-btn"
            data-tooltip="回到思维导图"
            onClick={() => props.onNavigate('editor')}
            style={{
              'app-region': 'no-drag',
              '-webkit-app-region': 'no-drag',
            }}
          >
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
            </svg>
            <span class="title-bar-mindmap-title">{props.currentMindmapTitle}</span>
          </button>
        )}
      </div>

      {/* Right section: actions + window controls */}
      <div class="title-bar-right">
        <div
          class="title-bar-actions"
          style={{
            'app-region': 'no-drag',
            '-webkit-app-region': 'no-drag',
          }}
        >
          {/* Always-visible nav buttons */}
          <button
            class={`toolbar-btn ${isActive('list') ? 'active' : ''}`}
            data-tooltip="思维导图列表"
            onClick={() => props.onNavigate('list')}
          >
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
          <button
            class={`toolbar-btn ${isActive('knowledge-base') ? 'active' : ''}`}
            data-tooltip="知识库"
            onClick={() => props.onNavigate('knowledge-base')}
          >
            <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          </button>

          <div class="title-bar-divider" />

          {/* Common actions */}
          <button
            class="toolbar-btn"
            data-tooltip="任务中心"
            onClick={toggleNotification}
          >
            <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
          <button
            class="toolbar-btn"
            data-tooltip="切换主题"
            onClick={toggleTheme}
          >
            {state.theme === 'dark' ? (
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
            ) : (
              <svg viewBox="0 0 24 24"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446A9 9 0 1 1 12 2.992z"/></svg>
            )}
          </button>
          <button
            class={`toolbar-btn ${isActive('settings') ? 'active' : ''}`}
            data-tooltip="设置"
            onClick={() => props.onNavigate('settings')}
          >
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l-.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>

        {isWindows && (
          <div
            class="title-bar-win-controls"
            style={{
              'app-region': 'no-drag',
              '-webkit-app-region': 'no-drag',
            }}
          >
            <button class="win-control-btn minimize" onClick={handleMinimize} title="最小化">
              <svg viewBox="0 0 24 24" width="10" height="10">
                <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.5" />
              </svg>
            </button>
            <button
              class="win-control-btn maximize"
              onClick={isMaximized() ? handleUnmaximize : handleMaximize}
              title={isMaximized() ? '还原' : '最大化'}
            >
              {isMaximized() ? (
                <svg viewBox="0 0 24 24" width="10" height="10">
                  <rect x="5" y="8" width="11" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" />
                  <path d="M8 8V5h11v11h-3" fill="none" stroke="currentColor" stroke-width="1.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="10" height="10">
                  <rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" />
                </svg>
              )}
            </button>
            <button class="win-control-btn close" onClick={handleClose} title="关闭">
              <svg viewBox="0 0 24 24" width="10" height="10">
                <line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="1.5" />
                <line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="1.5" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
