import 'server-only';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

export function dataDirectory() {
  const dir = path.resolve(process.env.STUDYLENS_DATA_DIR || path.join(process.cwd(), 'db', 'local'));
  const publicDir = path.join(process.cwd(), 'public');
  if (dir === publicDir || dir.startsWith(publicDir + path.sep)) throw new Error('STUDYLENS_DATA_DIR must be outside public/.');
  mkdirSync(path.join(dir, 'files'), { recursive: true, mode: 0o700 });
  return dir;
}
function filePath(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid storage identifier');
  return path.join(dataDirectory(), 'files', id);
}
export function saveFile(id: string, bytes: Uint8Array) { writeFileSync(filePath(id), bytes, { mode: 0o600, flag: 'wx' }); }
export function removeFile(id: string) { rmSync(filePath(id), { force: true }); }
