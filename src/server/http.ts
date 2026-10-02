import 'server-only';
import { z } from 'zod';
import { AppError } from './errors';
import { createSet, deleteResource, deleteSet, entries, listPassages, listResources, listSets, renameSet, requireSet } from './db';
import { ingest, MAX_FILE_SIZE } from './documents/process';
import { aiConfigured, study, type Generate } from './ai/study';

const nameSchema = z.string().trim().min(1, 'Enter a study set name.').max(80, 'Use 80 characters or fewer.');
async function boundedBody(request: Request, max: number) {
  if (Number(request.headers.get('content-length')) > max) throw new AppError('This request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('Request body is missing.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length;
    if (length > max) { await reader.cancel(); throw new AppError('This request is too large.', 413); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function json(request: Request) {
  try { return JSON.parse((await boundedBody(request, 24_000)).toString('utf8')); }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError('Invalid JSON request.'); }
}
function validId(id: string) { if (!z.string().uuid().safeParse(id).success) throw new AppError('Invalid identifier.', 400); return id; }
export async function handle(request: Request, path: string[], model?: Generate) {
  try {
    const url = new URL(request.url);
    // Next can normalize request.url to its listening hostname. The validated Host
    // header retains the browser's actual localhost/127.0.0.1 origin and port.
    const host = request.headers.get('host') || url.host;
    let hostUrl: URL;
    try { hostUrl = new URL(`${url.protocol}//${host}`); }
    catch { throw new AppError('Invalid local host.', 403); }
    if (hostUrl.host !== host || !['localhost', '127.0.0.1', '[::1]'].includes(hostUrl.hostname)) throw new AppError('StudyLens is a local-only application. Open it on localhost.', 403);
    const origin = request.headers.get('origin');
    if ((origin && origin !== hostUrl.origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError('Cross-site requests are not allowed.', 403);
    const [root, id, action, resourceId] = path;
    const method = request.method;
    let result: unknown;
    if (root === 'sets' && !id && method === 'GET') result = { sets: listSets(), aiConfigured: aiConfigured() };
    else if (root === 'sets' && !id && method === 'POST') { const body = await json(request); result = { id: createSet(nameSchema.parse(body.name)) }; }
    else if (root === 'sets' && id) {
      validId(id); requireSet(id);
      if (!action && method === 'GET') result = { resources: listResources(id), entries: entries(id) };
      else if (!action && method === 'PATCH') { const body = await json(request); renameSet(id, nameSchema.parse(body.name)); result = { ok: true }; }
      else if (!action && method === 'DELETE') { deleteSet(id); result = { ok: true }; }
      else if (action === 'resources' && !resourceId && method === 'POST') {
        const bytes = await boundedBody(request, MAX_FILE_SIZE + 64_000);
        let form: FormData;
        try { form = await new Response(bytes, { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData(); }
        catch { throw new AppError('Invalid upload. Choose a file and try again.'); }
        const file = form.get('file');
        if (!(file instanceof File)) throw new AppError('Choose a file to upload.');
        result = { id: await ingest(id, file.name, new Uint8Array(await file.arrayBuffer())) };
      } else if (action === 'resources' && resourceId && method === 'DELETE') { deleteResource(id, validId(resourceId)); result = { ok: true }; }
      else if (action === 'passages' && resourceId && method === 'GET') result = { passages: listPassages(id, [validId(resourceId)]) };
      else if (action === 'study' && method === 'POST') result = await study(id, await json(request), model);
      else throw new AppError('Endpoint not found.', 404);
    } else throw new AppError('Endpoint not found.', 404);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof AppError ? error.status : error instanceof z.ZodError ? 400 : 500;
    const message = error instanceof AppError ? error.message : error instanceof z.ZodError ? error.issues[0].message : 'Something went wrong. Please try again.';
    if (status === 500) console.error('StudyLens request failed:', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
