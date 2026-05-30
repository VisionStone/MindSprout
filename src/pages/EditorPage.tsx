import { createSignal, onMount, onCleanup } from 'solid-js';
import {
  state,
  setCurrentMindmapId,
  setPan,
} from '@/stores';
import {
  mindmapState,
  setMindmap,
  setNodes,
  setEdges,
  addNode,
  addEdge,
  updateNode,
  removeNode,
  removeEdge,
} from '@/stores/mindmapStore';
import {
  canvasState,
  clearSelection,
  selectNode,
} from '@/stores/canvasStore';
import {
  recordEditNode,
  recordCreateNode,
  recordDeleteSubtree,
  recordToggleCollapse,
  registerUndoCallbacks,
  clearUndoHistory,
} from '@/stores/undoStore';
import { CanvasEngine } from '@/canvas/CanvasEngine';
import { InteractionManager } from '@/canvas/InteractionManager';
import { applyHierarchicalLayout, applyLayoutWithAnchor } from '@/canvas/LayoutEngine';
import { calculateNodeLayout } from '@/canvas/NodeRenderer';
import NodeEditDialog from '@/components/NodeEditDialog';
import DescriptionPanel from '@/components/DescriptionPanel';
import NodeContextMenu from '@/components/NodeContextMenu';
import { queryKnowledgeBase } from '@/stores/kbStore';
import type { Mindmap, Node, Edge, CreateNodeInput, CreateEdgeInput, Task, KnowledgeBase } from '@/types';

/* -------------------------------------------------------------------------- */
//  EditorPage
/* -------------------------------------------------------------------------- */

interface EditorPageProps {
  initialMindmap: Mindmap | null;
}

function collectDescendantIds(nodes: Map<string, Node>, parentId: string): string[] {
  const result: string[] = [];
  for (const [id, node] of nodes) {
    if (node.parent_id !== null && String(node.parent_id) === parentId) {
      result.push(id);
      result.push(...collectDescendantIds(nodes, id));
    }
  }
  return result;
}

export default function EditorPage(props: EditorPageProps) {
  let canvasContainerRef: HTMLDivElement | undefined;
  let engine: CanvasEngine | undefined;
  let interaction: InteractionManager | undefined;

  const [editingNode, setEditingNode] = createSignal<Node | null>(null);
  const [descNode, setDescNode] = createSignal<Node | null>(null);
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);

  // Search state
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchIndex, setSearchIndex] = createSignal(0);

  const searchResults = (): string[] => {
    const query = searchQuery().toLowerCase().trim();
    if (!query) return [];
    const results: string[] = [];
    for (const [nodeId, node] of mindmapState.nodes) {
      if (
        node.title.toLowerCase().includes(query) ||
        node.content.toLowerCase().includes(query) ||
        node.description.toLowerCase().includes(query)
      ) {
        results.push(nodeId);
      }
    }
    return results;
  };

  const navigateSearch = (direction: 1 | -1): void => {
    const results = searchResults();
    if (results.length === 0) return;
    const nextIndex = (searchIndex() + direction + results.length) % results.length;
    setSearchIndex(nextIndex);
    const nodeId = results[nextIndex];
    const node = mindmapState.nodes.get(nodeId);
    if (node && canvasContainerRef) {
      clearSelection();
      selectNode(nodeId);
      const layout = calculateNodeLayout(node);
      const nodeCenterX = node.pos_x + layout.width / 2;
      const nodeCenterY = node.pos_y + layout.height / 2;
      const containerW = canvasContainerRef.clientWidth;
      const containerH = canvasContainerRef.clientHeight;
      const zoom = canvasState.zoom;
      setPan(containerW / 2 - nodeCenterX * zoom, containerH / 2 - nodeCenterY * zoom);
      engine?.markDirty();
    }
  };

  const findRootNode = (nodes: Map<string, Node>): Node | undefined => {
    for (const node of nodes.values()) {
      if (node.node_type === 'root' || node.parent_id === null) {
        return node;
      }
    }
    return undefined;
  };

  const centerOnRoot = (nodes: Map<string, Node>): void => {
    const rootNode = findRootNode(nodes);
    if (rootNode && canvasContainerRef) {
      const layout = calculateNodeLayout(rootNode);
      const rootCenterX = rootNode.pos_x + layout.width / 2;
      const rootCenterY = rootNode.pos_y + layout.height / 2;
      const containerW = canvasContainerRef.clientWidth;
      const containerH = canvasContainerRef.clientHeight;
      setPan(containerW / 2 - rootCenterX, containerH / 2 - rootCenterY);
    }
  };

  const handleCollapseAll = async (): Promise<void> => {
    for (const [nodeId, node] of mindmapState.nodes) {
      if (node.node_type !== 'root' && node.collapsed !== 1) {
        try {
          await window.electronAPI.db.updateNode({ id: node.id, collapsed: true });
        } catch (err) {
          console.error('Failed to collapse node:', err);
        }
        updateNode(nodeId, { collapsed: 1 });
      }
    }
    engine?.stopLayoutAnimation();
    const laidOut = applyHierarchicalLayout(mindmapState.nodes, mindmapState.edges);
    setNodes(laidOut);
    centerOnRoot(laidOut);
    engine?.invalidateNodeLayout();
    engine?.markDirty();
  };

  const handleExpandAll = async (): Promise<void> => {
    for (const [nodeId, node] of mindmapState.nodes) {
      if (node.collapsed === 1) {
        try {
          await window.electronAPI.db.updateNode({ id: node.id, collapsed: false });
        } catch (err) {
          console.error('Failed to expand node:', err);
        }
        updateNode(nodeId, { collapsed: 0 });
      }
    }
    engine?.stopLayoutAnimation();
    const laidOut = applyHierarchicalLayout(mindmapState.nodes, mindmapState.edges);
    setNodes(laidOut);
    centerOnRoot(laidOut);
    engine?.invalidateNodeLayout();
    engine?.markDirty();
  };

  const handleLocateRoot = (): void => {
    const rootNode = findRootNode(mindmapState.nodes);
    if (rootNode && canvasContainerRef) {
      clearSelection();
      engine?.startLayoutAnimation(null);
      const layout = calculateNodeLayout(rootNode);
      const rootCenterX = rootNode.pos_x + layout.width / 2;
      const rootCenterY = rootNode.pos_y + layout.height / 2;
      const containerW = canvasContainerRef.clientWidth;
      const containerH = canvasContainerRef.clientHeight;
      setPan(containerW / 2 - rootCenterX, containerH / 2 - rootCenterY);
      engine?.markDirty();
    }
  };

  // Custom prompt dialog state (Electron does not support window.prompt)
  const [promptOpen, setPromptOpen] = createSignal(false);
  const [promptTitle, setPromptTitle] = createSignal('');
  const [promptPlaceholder, setPromptPlaceholder] = createSignal('');
  const [promptValue, setPromptValue] = createSignal('');
  const [promptKBs, setPromptKBs] = createSignal<KnowledgeBase[]>([]);
  const [promptSelectedKBId, setPromptSelectedKBId] = createSignal<number | null>(null);
  let promptResolveRef: ((value: string | null) => void) | null = null;

  const showPrompt = (title: string, placeholder: string = ''): Promise<string | null> => {
    setPromptTitle(title);
    setPromptPlaceholder(placeholder);
    setPromptValue('');
    setPromptOpen(true);
    return new Promise((resolve) => {
      promptResolveRef = resolve;
    });
  };

  const handlePromptConfirm = (): void => {
    setPromptOpen(false);
    promptResolveRef?.(promptValue() || null);
    promptResolveRef = null;
  };

  const handlePromptCancel = (): void => {
    setPromptOpen(false);
    promptResolveRef?.(null);
    promptResolveRef = null;
  };

  onMount(() => {
    const canvas = document.getElementById('main-canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      console.error('EditorPage: main-canvas element not found');
      return;
    }

    // Create engine and interaction
    engine = new CanvasEngine(canvas);
    engine.start();

    // Register undo/redo callbacks so the undo store can trigger layout updates
    registerUndoCallbacks({
      onLayout: () => {
        const laidOut = applyHierarchicalLayout(mindmapState.nodes, mindmapState.edges);
        setNodes(laidOut);
      },
      onAnchorLayout: (nodeId: string) => {
        const laidOut = applyLayoutWithAnchor(mindmapState.nodes, mindmapState.edges, nodeId, engine?.expandedNodeId ?? undefined);
        setNodes(laidOut);
      },
      onMarkDirty: () => engine?.markDirty(),
      onInvalidateNodeLayout: (nodeId: string) => engine?.invalidateNodeLayout(nodeId),
      onStopAnimation: () => engine?.stopLayoutAnimation(),
    });

    interaction = new InteractionManager(canvas, engine, {
      onNodeDoubleClick: (nodeId: string) => {
        const node = mindmapState.nodes.get(nodeId);
        if (node) {
          setEditingNode(node);
        }
      },
      onNodeContextMenu: (nodeId: string, screenX: number, screenY: number) => {
        setContextMenu({ x: screenX, y: screenY, nodeId });
      },
    });

    // Initialize mindmap data from the selected mindmap
    (async () => {
      try {
        if (props.initialMindmap) {
          await loadMindmap(props.initialMindmap);
        }
      } catch (err) {
        console.error('Failed to initialize mindmap data:', err);
      }
    })();

    // Fullscreen description listener
    const onFullscreenDescription = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { nodeId: string } | undefined;
      if (!detail) return;
      const node = mindmapState.nodes.get(detail.nodeId);
      if (node) {
        setDescNode(node);
      }
    };
    window.addEventListener('fullscreen-description', onFullscreenDescription);

    // Resize handler
    const onResize = (): void => {
      engine?.resize();
    };
    window.addEventListener('resize', onResize);

    // AI task completion handler
    const unsubTaskComplete = window.electronAPI.onTaskComplete(async (payload) => {
      try {
        const tasks = (await window.electronAPI.ai.getTasks()) as Task[];
        const task = tasks.find((t) => t.id === payload.id);
        if (!task) return;

        if (task.task_type === 'generate') {
          const parsed = payload.result as {
            nodes?: Array<{ title: string; content?: string; children?: Array<{ title: string; content?: string; children?: unknown[] }> }>;
          };
          const inputParams = JSON.parse(task.input_params) as { prompt?: string; mindmap_id?: number };
          const topic = inputParams.prompt || 'AI Generated Mindmap';

          let sourceDoc: string | undefined;
          let sourceChunk: string | undefined;
          console.log('[RAG-DEBUG] inputParams:', JSON.stringify(inputParams));
          if (inputParams.mindmap_id) {
            try {
              const storedSources = await window.electronAPI.settings.getSetting<Array<{ doc_filepath: string; doc_filename: string; chunk_content: string }>>(
                `rag_sources_${inputParams.mindmap_id}`
              );
              console.log('[RAG-DEBUG] storedSources count:', storedSources?.length ?? 0, 'first filepath:', storedSources?.[0]?.doc_filepath);
              if (storedSources && storedSources.length > 0) {
                sourceDoc = storedSources[0].doc_filepath;
                if (storedSources.length === 1) {
                  sourceChunk = storedSources[0].chunk_content;
                } else {
                  sourceChunk = storedSources
                    .map((s, i) => `### 来源 ${i + 1}（${s.doc_filename}）\n\n${s.chunk_content}`)
                    .join('\n\n---\n\n');
                }
              }
            } catch (err) {
              console.log('[RAG-DEBUG] failed to load stored sources:', err);
            }
          } else {
            console.log('[RAG-DEBUG] no mindmap_id in inputParams, skipping source lookup');
          }
          console.log('[RAG-DEBUG] final sourceDoc:', sourceDoc ?? '(empty)', 'sourceChunk length:', sourceChunk?.length ?? 0);

          const mindmap = (await window.electronAPI.db.createMindmap({
            title: topic,
            description: '',
            visibility: 'private',
          })) as Mindmap;

          const rootNode = (await window.electronAPI.db.createNode({
            mindmap_id: mindmap.id,
            parent_id: null,
            node_type: 'root',
            title: topic,
            content: '',
            description: '',
            source_doc: sourceDoc,
            source_chunk: sourceChunk,
          })) as Node;
          console.log('[RAG-DEBUG] rootNode created, id:', rootNode.id, 'source_doc:', rootNode.source_doc, 'source_chunk length:', rootNode.source_chunk?.length ?? 0);

          async function createNodesRecursive(
            items: Array<{ title: string; content?: string; children?: Array<{ title: string; content?: string; children?: unknown[] }> }>,
            parentId: number,
            level: number
          ): Promise<void> {
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              const node = (await window.electronAPI.db.createNode({
                mindmap_id: mindmap.id,
                parent_id: parentId,
                node_type: item.children?.length ? 'branch' : 'leaf',
                title: item.title,
                content: item.content || '',
                description: '',
                level,
                sort_order: i,
              })) as Node;
              console.log('[RAG-DEBUG] child node created, id:', node.id, 'title:', node.title, 'source_doc:', JSON.stringify(node.source_doc), 'source_chunk:', JSON.stringify(node.source_chunk));

              await window.electronAPI.db.createEdge({
                mindmap_id: mindmap.id,
                source_node_id: parentId,
                target_node_id: node.id,
                edge_type: 'parent_child',
              });

              if (item.children?.length) {
                await createNodesRecursive(item.children as typeof items, node.id, level + 1);
              }
            }
          }

          if (parsed.nodes?.length) {
            await createNodesRecursive(parsed.nodes, rootNode.id, 1);
          }

          // Load into canvas
          const nodesArray = (await window.electronAPI.db.getNodes(mindmap.id)) as Node[];
          const edgesArray = (await window.electronAPI.db.getEdges(mindmap.id)) as Edge[];

          const nodesMap = new Map<string, Node>();
          for (const node of nodesArray) {
            nodesMap.set(String(node.id), node);
          }

          const edgesMap = new Map<string, Edge>();
          for (const edge of edgesArray) {
            edgesMap.set(String(edge.id), edge);
          }

          const laidOutNodes = applyHierarchicalLayout(nodesMap, edgesMap);

          setMindmap(mindmap);
          setNodes(laidOutNodes);
          setEdges(edgesMap);
          setCurrentMindmapId(mindmap.id);
          engine?.markDirty();
        } else if (task.task_type === 'expand') {
          const parsed = payload.result as {
            nodes?: Array<{ title: string; content?: string; children?: Array<{ title: string; content?: string; children?: unknown[] }> }>;
          };
          const parentNode = mindmapState.nodes.get(String(task.node_id));
          if (!parentNode || !mindmapState.mindmap) return;

          async function createExpandedNodes(
            items: Array<{ title: string; content?: string; children?: Array<{ title: string; content?: string; children?: unknown[] }> }>,
            parentId: number,
            level: number
          ): Promise<void> {
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              const newNode = (await window.electronAPI.db.createNode({
                mindmap_id: mindmapState.mindmap!.id,
                parent_id: parentId,
                node_type: item.children?.length ? 'branch' : 'leaf',
                title: item.title,
                content: item.content || '',
                description: '',
                level,
                sort_order: i,
              })) as Node;

              const newEdge = (await window.electronAPI.db.createEdge({
                mindmap_id: mindmapState.mindmap!.id,
                source_node_id: parentId,
                target_node_id: newNode.id,
                edge_type: 'parent_child',
              })) as Edge;

              addNode(newNode);
              addEdge(newEdge);

              if (item.children?.length) {
                await createExpandedNodes(item.children as typeof items, newNode.id, level + 1);
              }
            }
          }

          if (parsed.nodes?.length) {
            await createExpandedNodes(parsed.nodes, parentNode.id, parentNode.level + 1);

            const laidOutNodes = applyHierarchicalLayout(mindmapState.nodes, mindmapState.edges);
            setNodes(laidOutNodes);
            engine?.markDirty();
          }
        } else if (task.task_type === 'enrich') {
          const content = String(payload.result);
          if (task.node_id) {
            await window.electronAPI.db.updateNode({
              id: task.node_id,
              description: content,
            });
            updateNode(String(task.node_id), { description: content });
            engine?.markDirty();
          }
        }
      } catch (err) {
        console.error('Failed to handle task completion:', err);
      }
    });

    onCleanup(() => {
      window.removeEventListener('fullscreen-description', onFullscreenDescription);
      window.removeEventListener('resize', onResize);
      unsubTaskComplete();
    });
  });

  onCleanup(() => {
    interaction?.cleanup();
    engine?.stop();
  });

  const loadMindmap = async (mindmap: Mindmap): Promise<void> => {
    try {
      const nodesArray = (await window.electronAPI.db.getNodes(mindmap.id)) as Node[];
      const edgesArray = (await window.electronAPI.db.getEdges(mindmap.id)) as Edge[];

      const nodesMap = new Map<string, Node>();
      for (const node of nodesArray) {
        nodesMap.set(String(node.id), node);
      }

      const edgesMap = new Map<string, Edge>();
      for (const edge of edgesArray) {
        edgesMap.set(String(edge.id), edge);
      }

      const laidOutNodes = applyHierarchicalLayout(nodesMap, edgesMap);

      // Switching mindmaps clears the undo history
      clearUndoHistory();

      // Center the root node in the viewport
      let rootNode: Node | undefined;
      for (const node of laidOutNodes.values()) {
        if (node.node_type === 'root') {
          rootNode = node;
          break;
        }
      }
      if (rootNode && canvasContainerRef) {
        const layout = calculateNodeLayout(rootNode);
        const rootCenterX = rootNode.pos_x + layout.width / 2;
        const rootCenterY = rootNode.pos_y + layout.height / 2;
        const containerW = canvasContainerRef.clientWidth;
        const containerH = canvasContainerRef.clientHeight;
        setPan(containerW / 2 - rootCenterX, containerH / 2 - rootCenterY);
      }

      setMindmap(mindmap);
      setNodes(laidOutNodes);
      setEdges(edgesMap);
      setCurrentMindmapId(mindmap.id);
      engine?.markDirty();
    } catch (err) {
      console.error('Failed to load mindmap:', err);
    }
  };

  const handleEditSave = async (updates: Partial<Node>): Promise<void> => {
    const node = editingNode();
    if (!node) return;

    // Record undo before applying changes
    const before: Partial<Node> = {};
    for (const key of Object.keys(updates) as (keyof Node)[]) {
      before[key] = node[key] as unknown as undefined;
    }

    try {
      await window.electronAPI.db.updateNode({
        id: node.id,
        ...updates,
      });
      recordEditNode(String(node.id), before, updates);
      updateNode(String(node.id), updates);
      engine?.invalidateNodeLayout(String(node.id));
      engine?.markDirty();
    } catch (err) {
      console.error('Failed to update node:', err);
    }
  };

  const handleAddChild = async (): Promise<void> => {
    const cm = contextMenu();
    if (!cm) return;

    const parent = mindmapState.nodes.get(cm.nodeId);
    if (!parent || !mindmapState.mindmap) return;

    // Compute next sort_order among siblings
    let nextSortOrder = 0;
    for (const n of mindmapState.nodes.values()) {
      if (n.parent_id !== null && String(n.parent_id) === String(parent.id)) {
        nextSortOrder = Math.max(nextSortOrder, n.sort_order + 1);
      }
    }

    const newNodeInput: CreateNodeInput = {
      mindmap_id: mindmapState.mindmap.id,
      parent_id: parent.id,
      node_type: 'branch',
      title: '新节点',
      content: '',
      description: '',
      pos_x: parent.pos_x + 200,
      pos_y: parent.pos_y + 50,
      level: parent.level + 1,
      sort_order: nextSortOrder,
      collapsed: false,
    };

    try {
      const createdNode = (await window.electronAPI.db.createNode(newNodeInput)) as Node;
      addNode(createdNode);

      const newEdgeInput: CreateEdgeInput = {
        mindmap_id: mindmapState.mindmap.id,
        source_node_id: parent.id,
        target_node_id: createdNode.id,
        edge_type: 'parent_child',
      };

      const createdEdge = (await window.electronAPI.db.createEdge(newEdgeInput)) as Edge;
      addEdge(createdEdge);

      recordCreateNode(createdNode, createdEdge, newNodeInput, newEdgeInput);

      // Re-apply hierarchical layout so new node is properly positioned
      const laidOutNodes = applyHierarchicalLayout(mindmapState.nodes, mindmapState.edges);
      setNodes(laidOutNodes);
      engine?.markDirty();
    } catch (err) {
      console.error('Failed to add child node:', err);
    }
  };

  const handleDeleteNode = async (): Promise<void> => {
    const cm = contextMenu();
    if (!cm) return;

    const node = mindmapState.nodes.get(cm.nodeId);
    if (!node) return;

    try {
      // Snapshot nodes + edges before deletion for undo
      const idsToDelete = [cm.nodeId, ...collectDescendantIds(mindmapState.nodes, cm.nodeId)];
      const idSet = new Set(idsToDelete);
      const nodesSnapshot: Node[] = [];
      const edgesSnapshot: Edge[] = [];
      for (const id of idsToDelete) {
        const n = mindmapState.nodes.get(id);
        if (n) nodesSnapshot.push(n);
      }
      for (const [edgeId, edge] of mindmapState.edges) {
        if (
          idSet.has(String(edge.source_node_id)) ||
          idSet.has(String(edge.target_node_id))
        ) {
          edgesSnapshot.push(edge);
        }
      }

      // DB handles recursive deletion
      await window.electronAPI.db.deleteNode(node.id);
      recordDeleteSubtree(nodesSnapshot, edgesSnapshot);

      // Remove from store recursively
      for (const id of idsToDelete) {
        removeNode(id);
      }

      for (const [edgeId, edge] of mindmapState.edges) {
        if (
          idSet.has(String(edge.source_node_id)) ||
          idSet.has(String(edge.target_node_id))
        ) {
          removeEdge(edgeId);
        }
      }

      // Re-apply hierarchical layout after deletion
      const laidOutNodes = applyHierarchicalLayout(mindmapState.nodes, mindmapState.edges);
      setNodes(laidOutNodes);
      engine?.markDirty();
    } catch (err) {
      console.error('Failed to delete node:', err);
    }
  };

  const handleToggleCollapse = async (): Promise<void> => {
    const cm = contextMenu();
    if (!cm) return;

    const node = mindmapState.nodes.get(cm.nodeId);
    if (!node) return;

    const nextCollapsed = node.collapsed === 0 ? 1 : 0;

    try {
      await window.electronAPI.db.updateNode({
        id: node.id,
        collapsed: nextCollapsed === 1,
      });
      recordToggleCollapse(cm.nodeId, node.collapsed);
      updateNode(cm.nodeId, { collapsed: nextCollapsed });

      // Re-apply layout so collapsed subtrees free up space, anchored on
      // the toggled node so the user's focal point doesn't jump.
      const laidOutNodes = applyLayoutWithAnchor(
        mindmapState.nodes,
        mindmapState.edges,
        cm.nodeId,
        engine?.expandedNodeId ?? undefined
      );
      setNodes(laidOutNodes);
      engine?.markDirty();
    } catch (err) {
      console.error('Failed to toggle collapse:', err);
    }
  };

  const contextMenuNode = (): Node | undefined => {
    const cm = contextMenu();
    if (!cm) return undefined;
    return mindmapState.nodes.get(cm.nodeId);
  };

  const startAITask = async (
    taskType: 'generate' | 'expand' | 'enrich',
    node?: Node
  ): Promise<void> => {
    if (!mindmapState.mindmap) {
      alert('请先创建或打开一个思维导图');
      return;
    }

    try {
      const providers = (await window.electronAPI.settings.getProviders()) as Array<{
        id: number;
        is_default: number;
      }>;
      const defaultProvider = providers.find((p) => p.is_default === 1);

      if (!defaultProvider && providers.length === 0) {
        alert('未配置 AI 提供商，请先在设置中添加');
        return;
      }

      const providerId = defaultProvider?.id ?? providers[0]?.id;

      let kbList: KnowledgeBase[] = [];
      try {
        kbList = (await window.electronAPI.kb.list()) as KnowledgeBase[];
      } catch {
        // KB list fetch is optional
      }
      const availableKBs = kbList.filter((kb) => kb.chunk_count > 0);
      setPromptKBs(availableKBs);
      setPromptSelectedKBId(null);

      let prompt: string | undefined;
      let nodeId: number | undefined;

      if (taskType === 'generate') {
        const topic = await showPrompt('请输入思维导图主题：');
        if (!topic) return;
        prompt = topic;
      } else if (node) {
        nodeId = node.id;
        const context = await showPrompt('可选：输入补充提示（直接留空使用默认）');
        if (context) {
          prompt = context;
        }
      }

      let ragContext: string | undefined;
      const selectedKBId = promptSelectedKBId();
      if (selectedKBId) {
        const query = taskType === 'generate' ? prompt! : node?.title || prompt || '';
        try {
          const ragResult = await queryKnowledgeBase(selectedKBId, query, 8);
          ragContext = ragResult.context;

          if (taskType === 'generate' && ragResult.sources && ragResult.sources.length > 0) {
            await window.electronAPI.settings.setSetting(
              `rag_sources_${mindmapState.mindmap.id}`,
              ragResult.sources
            );
          }
        } catch (err) {
          console.error('RAG query failed, proceeding without RAG:', err);
        }
      }

      await window.electronAPI.ai.startTask({
        task_type: taskType,
        mindmap_id: mindmapState.mindmap.id,
        node_id: nodeId,
        prompt,
        provider_id: providerId,
        ragContext,
      });

      if (!state.showNotification) {
        // notification will be toggled by global App layer
      }
    } catch (err) {
      console.error('Failed to start AI task:', err);
      alert('启动 AI 任务失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div class="editor-page">
      {/* Canvas container */}
      <div ref={canvasContainerRef} class="canvas-container">
        <canvas id="main-canvas" />
        {searchOpen() && (
          <div class="search-bar">
            <input
              type="text"
              class="search-input"
              placeholder="搜索节点..."
              value={searchQuery()}
              onInput={(e) => {
                setSearchQuery(e.currentTarget.value);
                setSearchIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigateSearch(1);
                if (e.key === 'Escape') setSearchOpen(false);
              }}
              autofocus
            />
            <span class="search-count">
              {searchResults().length > 0
                ? `${searchIndex() + 1} / ${searchResults().length}`
                : '0 / 0'}
            </span>
            <button class="search-nav-btn" onClick={() => navigateSearch(-1)} disabled={searchResults().length === 0}>
              <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button class="search-nav-btn" onClick={() => navigateSearch(1)} disabled={searchResults().length === 0}>
              <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button class="search-close-btn" onClick={() => setSearchOpen(false)}>
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Quick action buttons */}
      <div class="quick-actions">
        <button class="quick-action-btn" title="全部折叠" onClick={handleCollapseAll}>
          <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="5" x2="19" y2="5"/><line x1="5" y1="19" x2="19" y2="19"/></svg>
        </button>
        <button class="quick-action-btn" title="全部展开" onClick={handleExpandAll}>
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="5" x2="19" y2="5"/><line x1="5" y1="19" x2="19" y2="19"/></svg>
        </button>
        <button class="quick-action-btn" title="搜索节点" onClick={() => setSearchOpen((v) => !v)}>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <button class="quick-action-btn" title="定位到根节点" onClick={handleLocateRoot}>
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
        </button>
      </div>

      {/* Node edit dialog */}
      {editingNode() && (
        <NodeEditDialog
          node={editingNode()!}
          onSave={handleEditSave}
          onClose={() => setEditingNode(null)}
        />
      )}

      {/* Description panel */}
      {descNode() && (
        <DescriptionPanel
          node={descNode()!}
          onClose={() => setDescNode(null)}
        />
      )}

      {/* Prompt dialog */}
      {promptOpen() && (
        <div class="modal-overlay" onClick={handlePromptCancel}>
          <div class="modal prompt-dialog" onClick={(e) => e.stopPropagation()}>
            <div class="edit-dialog-header">
              <h3>{promptTitle()}</h3>
              <button class="close-btn" onClick={handlePromptCancel}>
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="edit-dialog-body">
              <input
                type="text"
                class="form-input"
                placeholder={promptPlaceholder()}
                value={promptValue()}
                onInput={(e) => setPromptValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePromptConfirm();
                  if (e.key === 'Escape') handlePromptCancel();
                }}
                autofocus
              />
              {promptKBs().length > 0 && (
                <div class="form-group" style="margin-top:12px;">
                  <label style="font-size:12px;color:var(--clr-text-secondary);margin-bottom:4px;display:block;">知识库增强（可选）</label>
                  <select
                    class="form-input"
                    style="cursor:pointer;"
                    value={promptSelectedKBId() ?? ''}
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      setPromptSelectedKBId(val ? Number(val) : null);
                    }}
                  >
                    <option value="">不使用知识库</option>
                    {promptKBs().map((kb) => (
                      <option value={kb.id}>{kb.name}（{kb.doc_count} 文档）</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div class="edit-dialog-footer">
              <button class="btn btn-secondary" onClick={handlePromptCancel}>
                取消
              </button>
              <button class="btn btn-primary" onClick={handlePromptConfirm}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Node context menu */}
      {contextMenu() && (
        <NodeContextMenu
          x={contextMenu()!.x}
          y={contextMenu()!.y}
          hasChildren={(() => {
            const node = contextMenuNode();
            if (!node) return false;
            for (const n of mindmapState.nodes.values()) {
              if (n.parent_id !== null && String(n.parent_id) === String(node.id)) {
                return true;
              }
            }
            return false;
          })()}
          isCollapsed={contextMenuNode()?.collapsed === 1}
          onEdit={() => {
            const node = contextMenuNode();
            if (node) setEditingNode(node);
          }}
          onAddChild={handleAddChild}
          onDelete={handleDeleteNode}
          onToggleCollapse={handleToggleCollapse}
          onAIExpand={() => {
            const node = contextMenuNode();
            if (node) startAITask('expand', node);
          }}
          onAIEnrich={() => {
            const node = contextMenuNode();
            if (node) startAITask('enrich', node);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
