import { createStore } from 'solid-js/store';
import { createEffect } from 'solid-js';
import type { Theme } from '@/types';

/* -------------------------------------------------------------------------- */
//  AppState interface
/* -------------------------------------------------------------------------- */

interface AppState {
  theme: Theme;
  currentMindmapId: number | null;
  showNotification: boolean;
  showSettings: boolean;
}

/* -------------------------------------------------------------------------- */
//  Initial state
/* -------------------------------------------------------------------------- */

const [state, setState] = createStore<AppState>({
  theme: 'light',
  currentMindmapId: null,
  showNotification: false,
  showSettings: false,
});

/* -------------------------------------------------------------------------- */
//  Actions
/* -------------------------------------------------------------------------- */

export function toggleTheme(): void {
  const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
  setState('theme', next);
  document.documentElement.setAttribute('data-theme', next);
  window.electronAPI.settings.setSetting('theme', next);
}

export function setCurrentMindmapId(id: number | null): void {
  setState('currentMindmapId', id);
}

export function toggleNotification(): void {
  setState('showNotification', (prev) => !prev);
}

export function toggleSettings(): void {
  setState('showSettings', (prev) => !prev);
}

/* -------------------------------------------------------------------------- */
//  Load saved theme on mount
/* -------------------------------------------------------------------------- */

createEffect(() => {
  window.electronAPI.settings
    .getSetting<Theme>('theme')
    .then((saved) => {
      if (saved) {
        setState('theme', saved);
        document.documentElement.setAttribute('data-theme', saved);
      }
    })
    .catch(() => {
      // ignore errors — fallback to light theme
    });
});

/* -------------------------------------------------------------------------- */
//  Exports
/* -------------------------------------------------------------------------- */

export { state };
export type { AppState };
