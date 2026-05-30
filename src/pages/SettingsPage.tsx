import AIProviderForm from '@/components/AIProviderForm';

/* -------------------------------------------------------------------------- */
//  SettingsPage
/* -------------------------------------------------------------------------- */

interface SettingsPageProps {
  // no props needed — navigation handled by global TitleBar
}

async function exportData() {
  try {
    const mindmaps = (await window.electronAPI.db.listMindmaps()) as Array<{
      id: number;
      title: string;
      description: string;
      visibility: string;
      layout_mode: string;
      view_state: string;
      created_at: string;
      updated_at: string;
      version: number;
    }>;

    const exportData: {
      version: number;
      exportedAt: number;
      mindmaps: Array<Record<string, unknown>>;
    } = { version: 1, exportedAt: Date.now(), mindmaps: [] };

    for (const mindmap of mindmaps) {
      const nodes = (await window.electronAPI.db.getNodes(mindmap.id)) as unknown[];
      const edges = (await window.electronAPI.db.getEdges(mindmap.id)) as unknown[];
      exportData.mindmaps.push({ ...mindmap, nodes, edges });
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindsprout-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to export data:', err);
    alert('导出失败: ' + (err instanceof Error ? err.message : String(err)));
  }
}

async function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.mindmaps || !Array.isArray(data.mindmaps)) {
        alert('无效的备份文件');
        return;
      }

      let importCount = 0;

      for (const mindmap of data.mindmaps) {
        const { id: _oldMindmapId, nodes: oldNodes, edges: oldEdges, ...mindmapData } = mindmap;
        const createdMindmap = (await window.electronAPI.db.createMindmap({
          title: mindmapData.title || 'Imported Mindmap',
          description: mindmapData.description || '',
          visibility: (mindmapData.visibility as 'public' | 'private') || 'private',
          layout_mode: (mindmapData.layout_mode as 'hierarchical' | 'radial' | 'force') || 'hierarchical',
        })) as { id: number };

        const nodeIdMap = new Map<number | string, number>();
        const nodesToCreate = [...(oldNodes || [])].sort(
          (a: any, b: any) => (a.level ?? 0) - (b.level ?? 0)
        );

        for (const node of nodesToCreate) {
          const { id: oldId, mindmap_id: _mindmapId, ...nodeData } = node;
          const createdNode = (await window.electronAPI.db.createNode({
            mindmap_id: createdMindmap.id,
            parent_id:
              nodeData.parent_id !== undefined && nodeData.parent_id !== null
                ? nodeIdMap.get(nodeData.parent_id) ?? null
                : null,
            node_type: nodeData.node_type || 'branch',
            title: nodeData.title || '',
            content: nodeData.content || '',
            description: nodeData.description || '',
            pos_x: nodeData.pos_x ?? 0,
            pos_y: nodeData.pos_y ?? 0,
            level: nodeData.level ?? 0,
            sort_order: nodeData.sort_order ?? 0,
            collapsed: nodeData.collapsed === 1 || nodeData.collapsed === true,
          })) as { id: number };
          nodeIdMap.set(oldId, createdNode.id);
        }

        for (const edge of oldEdges || []) {
          const { id: _oldEdgeId, mindmap_id: _mindmapId, source_node_id, target_node_id, ...edgeData } = edge;
          const newSourceId = nodeIdMap.get(source_node_id);
          const newTargetId = nodeIdMap.get(target_node_id);
          if (newSourceId && newTargetId) {
            await window.electronAPI.db.createEdge({
              mindmap_id: createdMindmap.id,
              source_node_id: newSourceId,
              target_node_id: newTargetId,
              edge_type: edgeData.edge_type || 'parent_child',
            });
          }
        }

        importCount++;
      }

      alert(`成功导入 ${importCount} 张思维导图`);
    } catch (err) {
      console.error('Failed to import data:', err);
      alert('导入失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  };
  input.click();
}

export default function SettingsPage(_props: SettingsPageProps) {
  return (
    <div class="settings-page">
      <div class="settings-content">
        <section class="settings-section">
          <h2>AI 提供商</h2>
          <AIProviderForm />
        </section>

        <section class="settings-section">
          <h2>外观</h2>
          <p>调整主题、字体大小等视觉偏好。（占位）</p>
        </section>

        <section class="settings-section">
          <h2>编辑器</h2>
          <p>配置自动保存、默认布局等编辑行为。（占位）</p>
        </section>

        <section class="settings-section">
          <h2>数据</h2>
          <div class="data-actions">
            <button class="btn btn-secondary" onClick={exportData}>
              导出所有数据
            </button>
            <button class="btn btn-secondary" onClick={importData}>
              导入数据
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
