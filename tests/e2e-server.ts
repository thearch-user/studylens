// Browser tests exercise the real SDK against this local mock Responses API.
// This fixture is never imported by application code.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dataDir = mkdtempSync(join(tmpdir(), 'studylens-browser-'));
const mock = createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  const request = JSON.parse(body);
  const input = JSON.parse(request.input);
  const id = input.passages[0].id;
  const unsupported = String(input.question).includes('galaxies');
  const answer = { supported: !unsupported, markdown: `## Overview\nPhotosynthesis converts light into chemical energy. [[${id}]]\n\n## Key concepts\n- Chlorophyll captures light. [[${id}]]\n\n## Definitions\n**Photosynthesis**: storing light energy in sugars. [[${id}]]\n\n## Revision checklist\n- Explain the role of light.`, citationIds: [id], slides: input.task === 'lesson' ? [1, 2, 3].map(n => ({ title: `Light and life ${n}`, bullets: ['Plants capture light energy.', 'Energy is stored in sugars.'], transcript: 'Plants capture light. Photosynthesis stores that energy in sugars.', citationIds: [id] })) : [] };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ id: 'resp_mock', object: 'response', created_at: Date.now() / 1000, status: 'completed', model: 'mock-test-only', output: [{ id: 'msg_mock', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(answer), annotations: [] }] }] }));
});
mock.listen(4319, '127.0.0.1', () => {
  const env: NodeJS.ProcessEnv = { ...process.env, STUDYLENS_DATA_DIR: dataDir, OPENAI_MODEL: 'mock-test-only', OPENAI_BASE_URL: 'http://127.0.0.1:4319/v1' };
  delete env.OPENAI_API_KEY;
  env.OPENROUTER_API_KEY = '';
  env.OPENROUTER_MODEL = '';
  env.OPENROUTER_BASE_URL = '';
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3100'], { stdio: 'inherit', env });
  const cleanup = () => { child.kill('SIGTERM'); mock.close(); rmSync(dataDir, { recursive: true, force: true }); };
  process.on('SIGTERM', cleanup); process.on('SIGINT', cleanup);
  child.on('exit', code => { mock.close(); rmSync(dataDir, { recursive: true, force: true }); process.exit(code || 0); });
});
