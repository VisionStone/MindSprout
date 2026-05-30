import { getDb } from './index';
import type { Edge, CreateEdgeInput } from '../../src/types';

function toISOString(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function rowToEdge(row: Record<string, unknown>): Edge {
  return {
    id: row.id as number,
    mindmap_id: row.mindmap_id as number,
    source_node_id: row.source_node_id as number,
    target_node_id: row.target_node_id as number,
    edge_type:
      (row.edge_type as 'parent_child' | 'cross_link') ?? 'parent_child',
    style: (row.style as string) ?? '{}',
    created_at: toISOString(row.created_at as number),
  };
}

export function getEdges(mindmapId: number): Edge[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM edges WHERE mindmap_id = ?')
    .all(mindmapId) as Record<string, unknown>[];
  return rows.map(rowToEdge);
}

export function createEdge(input: CreateEdgeInput): Edge {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .prepare(
      `INSERT INTO edges (
        mindmap_id, source_node_id, target_node_id, edge_type, style, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.mindmap_id,
      input.source_node_id,
      input.target_node_id,
      input.edge_type ?? 'parent_child',
      JSON.stringify(input.style ?? {}),
      now
    );

  const edge = db
    .prepare('SELECT * FROM edges WHERE id = ?')
    .get(result.lastInsertRowid) as Record<string, unknown>;
  return rowToEdge(edge);
}

export function deleteEdge(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM edges WHERE id = ?').run(id);
}

export function deleteEdgesByMindmap(mindmapId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM edges WHERE mindmap_id = ?').run(mindmapId);
}
