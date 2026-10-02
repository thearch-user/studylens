import 'server-only';
import { randomUUID } from 'node:crypto';
import { extname, basename } from 'node:path';
import { AppError } from '../errors';
import { db, requireSet, touch } from '../db';
import { saveFile, removeFile } from '../storage/files';

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export type ExtractedSection = { location: string; text: string };
export function validateFile(name: string, size: number) {
  if (!['.pdf', '.txt', '.md', '.markdown'].includes(extname(name).toLowerCase())) throw new AppError('Choose a PDF, TXT, or Markdown file.');
  if (size === 0) throw new AppError('This file is empty. Add some text and try again.');
  if (size > MAX_FILE_SIZE) throw new AppError('Files must be 10 MB or smaller.', 413);
}
export function splitText(text: string, markdown: boolean): ExtractedSection[] {
  text = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
  if (!text) throw new AppError('No readable text was found in this resource.');
  if (text.length > 500_000) throw new AppError('This resource is too long. Split it into files with fewer than 500,000 characters.');
  const sections: ExtractedSection[] = [];
  let location = 'Section 1';
  let lines: string[] = [];
  function flush() { if (lines.join('\n').trim()) sections.push({ location, text: lines.join('\n').trim() }); lines = []; }
  for (const line of text.split('\n')) {
    if (markdown && /^#{1,6}\s+/.test(line)) { flush(); location = line.replace(/^#+\s+/, '').slice(0, 160); }
    lines.push(line);
  }
  flush();
  return sections;
}
export function chunkSections(sections: ExtractedSection[]) {
  const chunks: ExtractedSection[] = [];
  for (const section of sections) {
    for (let offset = 0; offset < section.text.length;) {
      let end = Math.min(offset + 1600, section.text.length);
      if (end < section.text.length) {
        const boundary = section.text.lastIndexOf(' ', end);
        if (boundary > offset + 1000) end = boundary;
      }
      const text = section.text.slice(offset, end).trim();
      if (text) chunks.push({ location: section.location, text });
      if (end === section.text.length) break;
      offset = end; // No lost text; page and section boundaries never get merged.
    }
  }
  return chunks;
}
export async function extract(name: string, bytes: Uint8Array) {
  validateFile(name, bytes.length);
  if (extname(name).toLowerCase() !== '.pdf') {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new AppError('This text file is not valid UTF-8. Save it as UTF-8 and upload again.'); }
    if (text.includes('\u0000')) throw new AppError('This looks like a binary file. Upload a UTF-8 text file instead.');
    return { sections: splitText(text, /\.m(arkdown|d)$/i.test(name)), warning: null };
  }
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new AppError('This file is not a valid PDF.');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 300) throw new AppError('PDFs are limited to 300 pages. Split this PDF and try again.');
    const sections: ExtractedSection[] = [];
    const empty: number[] = [];
    let length = 0;
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
      length += text.length;
      if (length > 500_000) throw new AppError('PDF text exceeds 500,000 characters. Split the PDF and try again.');
      if (text.length < 10) empty.push(page);
      if (text) sections.push({ location: `Page ${page}`, text });
    }
    if (!sections.length || sections.every(section => section.text.length < 10)) throw new AppError('No readable text found. This PDF may be scanned. Run OCR (optical character recognition) and upload the searchable PDF again.');
    return { sections, warning: empty.length ? `${empty.length} page(s) have little or no text and may need OCR. Images and diagrams are not extracted.` : null };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Could not read this PDF. It may be damaged or password protected. Export an unlocked, text-based PDF and try again.');
  } finally { await loading.destroy(); }
}
export async function ingest(setId: string, originalName: string, bytes: Uint8Array) {
  requireSet(setId); validateFile(originalName, bytes.length);
  if (Number(db().prepare('SELECT count(*) count FROM resources WHERE setId=?').get(setId)?.count) >= 30) throw new AppError('A study set can hold up to 30 resources.');
  const id = randomUUID();
  const name = basename(originalName.replace(/\\/g, '/')).slice(0, 180);
  saveFile(id, bytes);
  try { db().prepare('INSERT INTO resources VALUES(?,?,?,?,?,?,?,?)').run(id, setId, name, bytes.length, 'processing', null, null, new Date().toISOString()); }
  catch (error) { removeFile(id); throw error; }
  touch(setId);
  try {
    const { sections, warning } = await extract(name, bytes);
    if (!db().prepare('SELECT id FROM resources WHERE id=?').get(id)) throw new AppError('The resource was deleted while processing.', 409);
    db().exec('BEGIN');
    try {
      const insert = db().prepare('INSERT INTO passages VALUES(?,?,?,?,?)');
      chunkSections(sections).forEach((chunk, ordinal) => insert.run(randomUUID(), id, chunk.location, chunk.text, ordinal));
      db().prepare("UPDATE resources SET status='ready',warning=? WHERE id=?").run(warning, id);
      touch(setId); db().exec('COMMIT');
    } catch (error) { db().exec('ROLLBACK'); throw error; }
    return id;
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'Processing failed. Delete this resource and upload it again.';
    db().prepare("UPDATE resources SET status='error',error=? WHERE id=?").run(message, id);
    removeFile(id);
    throw new AppError(message);
  }
}
