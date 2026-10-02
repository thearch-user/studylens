import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataDirectory, removeFile } from '../storage/files';
import { AppError } from '../errors';
import type { Entry, Passage, Resource, StudyResult, StudySet, Mode } from '../../types/study';

let database: DatabaseSync | undefined;
export function db() {
  if (database) return database;
  database = new DatabaseSync(path.join(dataDirectory(), 'studylens.sqlite'));
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS study_sets (id TEXT PRIMARY KEY, name TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, setId TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
      name TEXT NOT NULL, size INTEGER NOT NULL, status TEXT NOT NULL, error TEXT, warning TEXT, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS passages (id TEXT PRIMARY KEY, resourceId TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      location TEXT NOT NULL, text TEXT NOT NULL, ordinal INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS resource_set ON resources(setId);
    CREATE INDEX IF NOT EXISTS passage_resource ON passages(resourceId);
    CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, setId TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
      mode TEXT NOT NULL, prompt TEXT NOT NULL, result TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS passage_search USING fts5(id UNINDEXED, text, tokenize='porter unicode61');
    CREATE TRIGGER IF NOT EXISTS passage_insert AFTER INSERT ON passages BEGIN INSERT INTO passage_search(id,text) VALUES(new.id,new.text); END;
    CREATE TRIGGER IF NOT EXISTS passage_delete AFTER DELETE ON passages BEGIN DELETE FROM passage_search WHERE id=old.id; END;`);
  return database;
}
export function requireSet(id: string) {
  if (!db().prepare('SELECT id FROM study_sets WHERE id=?').get(id)) throw new AppError('Study set not found.', 404);
}
export function touch(id: string) { db().prepare('UPDATE study_sets SET updatedAt=? WHERE id=?').run(new Date().toISOString(), id); }
export function listSets(): StudySet[] {
  return db().prepare('SELECT s.*, (SELECT count(*) FROM resources r WHERE r.setId=s.id) resourceCount FROM study_sets s ORDER BY updatedAt DESC').all() as StudySet[];
}
export function createSet(name: string) {
  const id = randomUUID();
  db().prepare('INSERT INTO study_sets VALUES(?,?,?)').run(id, name, new Date().toISOString());
  return id;
}
export function renameSet(id: string, name: string) { requireSet(id); db().prepare('UPDATE study_sets SET name=?,updatedAt=? WHERE id=?').run(name, new Date().toISOString(), id); }
export function deleteSet(id: string) {
  requireSet(id);
  const resources = listResources(id);
  db().prepare('DELETE FROM study_sets WHERE id=?').run(id);
  for (const resource of resources) removeFile(resource.id);
}
export function listResources(id: string): Resource[] {
  // Interrupted requests cannot remain in a perpetual processing state.
  db().prepare("UPDATE resources SET status='error',error='Processing was interrupted. Delete this resource and upload it again.' WHERE status='processing' AND createdAt < ?").run(new Date(Date.now() - 15 * 60_000).toISOString());
  return db().prepare('SELECT r.*, (SELECT count(*) FROM passages p WHERE p.resourceId=r.id) passageCount FROM resources r WHERE setId=? ORDER BY createdAt').all(id) as Resource[];
}
export function listPassages(setId: string, resourceIds: string[]): Passage[] {
  if (!resourceIds.length) return [];
  return db().prepare(`SELECT p.*,r.name FROM passages p JOIN resources r ON r.id=p.resourceId WHERE r.setId=? AND r.status='ready' AND r.id IN (${resourceIds.map(() => '?').join(',')}) ORDER BY r.createdAt,p.ordinal`).all(setId, ...resourceIds) as Passage[];
}
export function retrieve(setId: string, resourceIds: string[], query: string): Passage[] {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].slice(0, 40);
  if (!words.length || !resourceIds.length) return [];
  const match = words.map(word => '"' + word + '"').join(' OR ');
  return db().prepare(`SELECT p.*,r.name FROM passage_search f JOIN passages p ON p.id=f.id JOIN resources r ON r.id=p.resourceId
    WHERE passage_search MATCH ? AND r.setId=? AND r.status='ready' AND r.id IN (${resourceIds.map(() => '?').join(',')}) ORDER BY bm25(passage_search) LIMIT 10`).all(match, setId, ...resourceIds) as Passage[];
}
export function entries(setId: string): Entry[] {
  return (db().prepare('SELECT * FROM entries WHERE setId=? ORDER BY createdAt,rowid').all(setId) as { id: string; mode: Mode; prompt: string; result: string; createdAt: string }[]).map(row => ({ ...row, result: JSON.parse(row.result) }));
}
export function saveEntry(setId: string, mode: Mode, prompt: string, result: StudyResult) {
  requireSet(setId);
  const entry = { id: randomUUID(), mode, prompt, result, createdAt: new Date().toISOString() };
  db().prepare('INSERT INTO entries VALUES(?,?,?,?,?,?)').run(entry.id, setId, mode, prompt, JSON.stringify(result), entry.createdAt);
  touch(setId);
  return entry;
}
export function deleteResource(setId: string, id: string) {
  requireSet(setId);
  if (!db().prepare('SELECT id FROM resources WHERE id=? AND setId=?').get(id, setId)) throw new AppError('Resource not found.', 404);
  db().prepare('DELETE FROM resources WHERE id=?').run(id);
  // Generated output can reference deleted content; invalidate it together with chat history.
  db().prepare('DELETE FROM entries WHERE setId=?').run(setId);
  removeFile(id); touch(setId);
}
