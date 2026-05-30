import { getDb } from './index';
import type { Node, CreateNodeInput, UpdateNodeInput } from '../../src/types';

function toISOString(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function rowToNode(row: Record<string, unknown>): Node {
  return {
    id: row.id as number,
    mindmap_id: row.mindmap_id as number,
    parent_id: (row.parent_id as number | null) ?? null,
    node_type: (row.node_type as 'root' | 'branch' | 'leaf') ?? 'branch',
    title: (row.title as string) ?? '',
    content: (row.content as string) ?? '',
    description: (row.description as string) ?? '',
    source_doc: (row.source_doc as string) ?? '',
    source_chunk: (row.source_chunk as string) ?? '',
    style: (row.style as string) ?? '{}',
    pos_x: (row.pos_x as number) ?? 0,
    pos_y: (row.pos_y as number) ?? 0,
    level: (row.level as number) ?? 0,
    sort_order: (row.sort_order as number) ?? 0,
    collapsed: (row.collapsed as number) ?? 0,
    created_at: toISOString(row.created_at as number),
    updated_at: toISOString(row.updated_at as number),
  };
}

export function getNodes(mindmapId: number): Node[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT * FROM nodes WHERE mindmap_id = ? ORDER BY sort_order, id'
    )
    .all(mindmapId) as Record<string, unknown>[];
  return rows.map(rowToNode);
}

export function createNode(input: CreateNodeInput): Node {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .prepare(
      `INSERT INTO nodes (
        mindmap_id, parent_id, node_type, title, content, description,
        source_doc, source_chunk,
        style, pos_x, pos_y, level, sort_order, collapsed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.mindmap_id,
      input.parent_id ?? null,
      input.node_type ?? 'branch',
      input.title,
      input.content ?? '',
      input.description ?? '',
      input.source_doc ?? '',
      input.source_chunk ?? '',
      JSON.stringify(input.style ?? {}),
      input.pos_x ?? 0,
      input.pos_y ?? 0,
      input.level ?? 0,
      input.sort_order ?? 0,
      input.collapsed ? 1 : 0,
      now,
      now
    );

  const node = db
    .prepare('SELECT * FROM nodes WHERE id = ?')
    .get(result.lastInsertRowid) as Record<string, unknown>;
  return rowToNode(node);
}

export function updateNode(input: UpdateNodeInput): Node {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.parent_id !== undefined) {
    fields.push('parent_id = ?');
    values.push(input.parent_id);
  }
  if (input.node_type !== undefined) {
    fields.push('node_type = ?');
    values.push(input.node_type);
  }
  if (input.title !== undefined) {
    fields.push('title = ?');
    values.push(input.title);
  }
  if (input.content !== undefined) {
    fields.push('content = ?');
    values.push(input.content);
  }
  if (input.description !== undefined) {
    fields.push('description = ?');
    values.push(input.description);
  }
  if (input.source_doc !== undefined) {
    fields.push('source_doc = ?');
    values.push(input.source_doc);
  }
  if (input.source_chunk !== undefined) {
    fields.push('source_chunk = ?');
    values.push(input.source_chunk);
  }
  if (input.style !== undefined) {
    fields.push('style = ?');
    values.push(JSON.stringify(input.style));
  }
  if (input.pos_x !== undefined) {
    fields.push('pos_x = ?');
    values.push(input.pos_x);
  }
  if (input.pos_y !== undefined) {
    fields.push('pos_y = ?');
    values.push(input.pos_y);
  }
  if (input.level !== undefined) {
    fields.push('level = ?');
    values.push(input.level);
  }
  if (input.sort_order !== undefined) {
    fields.push('sort_order = ?');
    values.push(input.sort_order);
  }
  if (input.collapsed !== undefined) {
    fields.push('collapsed = ?');
    values.push(input.collapsed ? 1 : 0);
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(input.id);

  db.prepare(`UPDATE nodes SET ${fields.join(', ')} WHERE id = ?`).run(
    ...values
  );

  const node = db
    .prepare('SELECT * FROM nodes WHERE id = ?')
    .get(input.id) as Record<string, unknown>;
  return rowToNode(node);
}

function collectChildIds(parentId: number): number[] {
  const db = getDb();
  const children = db
    .prepare('SELECT id FROM nodes WHERE parent_id = ?')
    .all(parentId) as { id: number }[];

  let ids: number[] = children.map((c) => c.id);
  for (const child of children) {
    ids = ids.concat(collectChildIds(child.id));
  }
  return ids;
}

export function deleteNode(id: number): void {
  const db = getDb();

  // Recursively collect all descendant node IDs
  const idsToDelete = [id, ...collectChildIds(id)];
  const placeholders = idsToDelete.map(() => '?').join(',');

  // Delete edges connected to any of these nodes
  db.prepare(
    `DELETE FROM edges WHERE source_node_id IN (${placeholders}) OR target_node_id IN (${placeholders})`
  ).run(...idsToDelete, ...idsToDelete);

  // Delete nodes
  db.prepare(`DELETE FROM nodes WHERE id IN (${placeholders})`).run(
    ...idsToDelete
  );
}
