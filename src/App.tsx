import { createSignal, onMount } from 'solid-js';
import EditorPage from '@/pages/EditorPage';
import MindMapListPage from '@/pages/MindMapListPage';
import SettingsPage from '@/pages/SettingsPage';
import KnowledgeBasePage from '@/pages/KnowledgeBasePage';
import FirstTimeWizard from '@/components/FirstTimeWizard';
import TitleBar from '@/components/TitleBar';
import NotificationCenter from '@/components/NotificationCenter';
import { state, toggleNotification } from '@/stores';
import type { Mindmap } from '@/types';
import '@/styles/global.css';

type Page = 'list' | 'editor' | 'settings' | 'knowledge-base';

export default function App() {
  const [page, setPage] = createSignal<Page>('list');
  const [selectedMindmap, setSelectedMindmap] = createSignal<Mindmap | null>(null);
  const [showWizard, setShowWizard] = createSignal(false);
  const [isReady, setIsReady] = createSignal(false);

  onMount(async () => {
    try {
      const completed = await window.electronAPI.settings.getSetting<boolean>('firstTimeComplete');
      setShowWizard(!completed);
    } catch (err) {
      console.error('Failed to check first-time status:', err);
      setShowWizard(true);
    } finally {
      setIsReady(true);
    }
  });

  const handleWizardComplete = (): void => {
    setShowWizard(false);
  };

  const handleSelectMindmap = (mindmap: Mindmap): void => {
    setSelectedMindmap(mindmap);
    setPage('editor');
  };

  const handleNavigate = (target: Page): void => {
    setPage(target);
  };

  return (
    <>
      <TitleBar
        page={page()}
        onNavigate={handleNavigate}
        currentMindmapTitle={selectedMindmap()?.title}
      />
      {isReady() && showWizard() && (
        <FirstTimeWizard onComplete={handleWizardComplete} />
      )}
      {isReady() && !showWizard() && (
        <>
          {page() === 'list' && (
            <MindMapListPage
              onSelect={handleSelectMindmap}
            />
          )}
          {page() === 'editor' && (
            <EditorPage
              initialMindmap={selectedMindmap()}
            />
          )}
          {page() === 'settings' && (
            <SettingsPage />
          )}
          {page() === 'knowledge-base' && (
            <KnowledgeBasePage />
          )}
        </>
      )}
      {state.showNotification && (
        <NotificationCenter onClose={toggleNotification} />
      )}
    </>
  );
}
