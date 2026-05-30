import { getDb } from './index';
import type {
  Mindmap,
  CreateMindmapInput,
  UpdateMindmapInput,
} from '../../src/types';

function toISOString(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function rowToMindmap(row: Record<string, unknown>): Mindmap {
  return {
    id: row.id as number,
    title: row.title as string,
    description: (row.description as string) ?? '',
    visibility: (row.visibility as 'public' | 'private') ?? 'private',
    layout_mode:
      (row.layout_mode as 'hierarchical' | 'radial' | 'force') ??
      'hierarchical',
    view_state: (row.view_state as string) ?? '{"zoom":1,"panX":0,"panY":0}',
    created_at: toISOString(row.created_at as number),
    updated_at: toISOString(row.updated_at as number),
    version: (row.version as number) ?? 1,
  };
}

export function listMindmaps(): Mindmap[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM mindmaps ORDER BY updated_at DESC')
    .all() as Record<string, unknown>[];
  return rows.map(rowToMindmap);
}

export function getMindmap(id: number): Mindmap | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM mindmaps WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToMindmap(row);
}

export function createMindmap(input: CreateMindmapInput): Mindmap {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .prepare(
      `INSERT INTO mindmaps (
        title, description, visibility, layout_mode, view_state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.title,
      input.description ?? '',
      input.visibility ?? 'private',
      input.layout_mode ?? 'hierarchical',
      JSON.stringify({ zoom: 1, panX: 0, panY: 0 }),
      now,
      now
    );

  return getMindmap(result.lastInsertRowid as number)!;
}

export function updateMindmap(input: UpdateMindmapInput): Mindmap {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) {
    fields.push('title = ?');
    values.push(input.title);
  }
  if (input.description !== undefined) {
    fields.push('description = ?');
    values.push(input.description);
  }
  if (input.visibility !== undefined) {
    fields.push('visibility = ?');
    values.push(input.visibility);
  }
  if (input.layout_mode !== undefined) {
    fields.push('layout_mode = ?');
    values.push(input.layout_mode);
  }
  if (input.view_state !== undefined) {
    fields.push('view_state = ?');
    values.push(JSON.stringify(input.view_state));
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(input.id);

  db.prepare(`UPDATE mindmaps SET ${fields.join(', ')} WHERE id = ?`).run(
    ...values
  );
  return getMindmap(input.id)!;
}

export function deleteMindmap(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM mindmaps WHERE id = ?').run(id);
}
