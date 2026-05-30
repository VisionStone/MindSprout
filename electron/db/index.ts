import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import log from 'electron-log';
import { SCHEMA_SQL } from './schema';

let db: Database.Database | null = null;

function runMigrations(db: Database.Database): void {
  const nodeColumns = db
    .prepare("PRAGMA table_info('nodes')")
    .all() as { name: string }[];
  if (!nodeColumns.some(c => c.name === 'source_doc')) {
    db.exec("ALTER TABLE nodes ADD COLUMN source_doc TEXT DEFAULT ''");
    db.exec("ALTER TABLE nodes ADD COLUMN source_chunk TEXT DEFAULT ''");
    log.info('[DB] Migration: added source_doc/source_chunk to nodes');
  }

  const docColumns = db
    .prepare("PRAGMA table_info('documents')")
    .all() as { name: string }[];
  if (!docColumns.some(c => c.name === 'filepath')) {
    db.exec("ALTER TABLE documents ADD COLUMN filepath TEXT NOT NULL DEFAULT ''");
    log.info('[DB] Migration: added filepath column to documents');
  }
}

export function getDb(): Database.Database {
  if (!db) {
    const userDataPath = app.getPath('userData');
    const dbPath = join(userDataPath, 'mindsprout.db');
    log.info('[DB] Opening database at:', dbPath);

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = OFF');
    db.exec(SCHEMA_SQL);
    runMigrations(db);

    log.info('[DB] Schema initialized, WAL mode enabled');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    log.info('[DB] Closing database');
    db.close();
    db = null;
  }
}
