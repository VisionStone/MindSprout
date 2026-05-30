// ============================================================
// MindSprout — Sample mindmap data for testing
// ============================================================

import type { Mindmap, Node, Edge } from '@/types';

/* -------------------------------------------------------------------------- */
//  Helpers
/* -------------------------------------------------------------------------- */

const now = new Date().toISOString();

function createMindmap(id: number): Mindmap {
  return {
    id,
    title: 'AI 技术发展',
    description: 'AI 技术发展的思维导图',
    visibility: 'private',
    layout_mode: 'hierarchical',
    view_state: JSON.stringify({ zoom: 1, panX: 0, panY: 0 }),
    created_at: now,
    updated_at: now,
    version: 1,
  };
}

function createNode(
  id: number,
  mindmapId: number,
  parentId: number | null,
  title: string,
  level: number,
  nodeType: 'root' | 'branch' | 'leaf',
  sortOrder: number
): Node {
  return {
    id,
    mindmap_id: mindmapId,
    parent_id: parentId,
    node_type: nodeType,
    title,
    content: '',
    description: '',
    source_doc: '',
    source_chunk: '',
    style: '{}',
    pos_x: 0,
    pos_y: 0,
    level,
    sort_order: sortOrder,
    collapsed: 0,
    created_at: now,
    updated_at: now,
  };
}

function createEdge(
  id: number,
  mindmapId: number,
  sourceNodeId: number,
  targetNodeId: number
): Edge {
  return {
    id,
    mindmap_id: mindmapId,
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    edge_type: 'parent_child',
    style: '{}',
    created_at: now,
  };
}

/* -------------------------------------------------------------------------- */
//  createSampleMindmap
/* -------------------------------------------------------------------------- */

export interface SampleMindmapResult {
  mindmap: Mindmap;
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
}

const LONG_DESCRIPTION = `# AI 技术发展概述

人工智能（AI）的发展经历了多个重要阶段，从早期的符号主义到现代的深度学习，每一次突破都深刻改变了技术格局。

## 关键里程碑

- **1956年**：达特茅斯会议，AI 作为独立学科诞生
- **1997年**：IBM 深蓝击败国际象棋世界冠军
- **2012年**：AlexNet 在 ImageNet 竞赛中获胜，引发深度学习革命
- **2017年**：Transformer 架构提出，奠定了大语言模型的基础
- **2022年**：ChatGPT 发布，标志着大模型时代的全面来临

## 核心技术栈

现代 AI 系统通常包含以下核心组件：

\`\`\`python
def train_model(data, epochs=10):
    model = build_neural_network()
    for epoch in range(epochs):
        loss = model.fit(data)
        print(f"Epoch {epoch}: loss={loss:.4f}")
    return model
\`\`\`

## 未来展望

> 未来十年，AI 将从工具演变为基础设施的一部分，深度融入教育、医疗、科研等各个领域。

随着算力的持续增长和算法的不断演进，通用人工智能（AGI）的探索正在加速。我们正站在一个历史性转折点上。
`;

export function createSampleMindmap(): SampleMindmapResult {
  const mindmapId = 1;
  const mindmap = createMindmap(mindmapId);

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Root
  const rootId = 1;
  const rootNode = createNode(rootId, mindmapId, null, 'AI 技术发展', 0, 'root', 0);
  rootNode.description = LONG_DESCRIPTION;
  nodes.push(rootNode);

  // Branch children
  const branches = [
    { id: 2, title: '机器学习' },
    { id: 3, title: '深度学习', desc: '深度学习是机器学习的一个分支，基于人工神经网络的多层表示学习。它通过构建具有多个隐藏层的神经网络，能够从原始数据中自动学习层次化的特征表示。' },
    { id: 4, title: '自然语言处理' },
    { id: 5, title: '计算机视觉' },
  ];

  for (const branch of branches) {
    const n = createNode(branch.id, mindmapId, rootId, branch.title, 1, 'branch', branch.id);
    if ((branch as { desc?: string }).desc) {
      n.description = (branch as { desc?: string }).desc!;
    }
    nodes.push(n);
    edges.push(createEdge(branch.id * 10, mindmapId, rootId, branch.id));
  }

  // Leaf grandchildren (10 leaves)
  const leaves = [
    { id: 6, parentId: 2, title: '监督学习', sortOrder: 0 },
    { id: 7, parentId: 2, title: '无监督学习', sortOrder: 1 },
    { id: 8, parentId: 2, title: '强化学习', sortOrder: 2 },
    { id: 9, parentId: 3, title: '神经网络', sortOrder: 0 },
    { id: 10, parentId: 3, title: 'CNN', sortOrder: 1 },
    { id: 11, parentId: 3, title: 'RNN', sortOrder: 2 },
    { id: 12, parentId: 4, title: 'Transformer', sortOrder: 0 },
    { id: 13, parentId: 4, title: '词嵌入', sortOrder: 1 },
    { id: 14, parentId: 5, title: '目标检测', sortOrder: 0 },
    { id: 15, parentId: 5, title: '图像分割', sortOrder: 1 },
  ];

  for (const leaf of leaves) {
    nodes.push(createNode(leaf.id, mindmapId, leaf.parentId, leaf.title, 2, 'leaf', leaf.sortOrder));
    edges.push(createEdge(leaf.id * 10 + 1, mindmapId, leaf.parentId, leaf.id));
  }

  const nodeMap = new Map<string, Node>();
  for (const node of nodes) {
    nodeMap.set(String(node.id), node);
  }

  const edgeMap = new Map<string, Edge>();
  for (const edge of edges) {
    edgeMap.set(String(edge.id), edge);
  }

  return { mindmap, nodes: nodeMap, edges: edgeMap };
}
