# StudyLens

A local, single-user study workspace built with Next.js App Router, TypeScript, Tailwind CSS, SQLite, and the official OpenAI SDK. The interface uses a Catppuccin Mocha-inspired palette.

## Run in WSL

Use the Linux checkout and Linux Node installation, not Windows Node or a copied Windows `node_modules` directory.

```bash
nvm install 24
nvm use 24
npm ci --include=optional
cp .env.example .env.local
# Edit .env.local and set OPENROUTER_API_KEY.
npm run dev
```

Open **http://localhost:3000**. The dev and production scripts bind to `127.0.0.1`. Node 24 is required for built-in `node:sqlite`; `.nvmrc` pins the major version. The app uses system fonts and needs no font downloads at build time. Development and production builds use Next.js’s supported `--webpack` option because Turbopack’s CSS subprocess failed to bind its worker port in this environment; Tailwind itself loads correctly.

Without an AI provider, uploading, organizing, and reading resources work. AI controls display a setup state until `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, or a non-OpenAI `OPENAI_BASE_URL` is configured and the server restarted. There is no preloaded or unlabeled demo content.

### Tailwind native dependency troubleshooting

The original `@tailwindcss/oxide-linux-x64-gnu` issue was already resolved in this checkout. Verification succeeded with:

```bash
node -v
which node
npm ls @tailwindcss/oxide-linux-x64-gnu
node -e "require('@tailwindcss/oxide'); console.log('Tailwind oxide OK')"
```

If it recurs, confirm Node comes from WSL's `~/.nvm`, and run `npm ci --include=optional` inside WSL. Do not use `--omit=optional`. If the lockfile genuinely lacks the platform dependency, back it up before regeneration:

```bash
cp package-lock.json package-lock.json.before-regeneration
# Only if npm ci could not repair the missing optional dependency:
rm -rf node_modules
rm package-lock.json
npm install --include=optional
```

This implementation did not regenerate the lockfile; it updated it through normal dependency installation. The existing backup was preserved.

## Configuration

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Recommended for this MVP. Server-side OpenRouter key. Never prefix with `NEXT_PUBLIC_`. |
| `OPENROUTER_MODEL` | OpenRouter model slug. Defaults to `openrouter/free`, OpenRouter's free router that selects free models matching request capabilities. |
| `OPENROUTER_BASE_URL` | Usually `https://openrouter.ai/api/v1`. |
| `OPENROUTER_APP_TITLE` / `OPENROUTER_HTTP_REFERER` | Optional OpenRouter attribution headers. |
| `OPENAI_API_KEY` | Server-side API key for OpenAI. Leave empty only when `OPENAI_BASE_URL` points to a local/non-OpenAI-compatible endpoint. Never prefix with `NEXT_PUBLIC_`. |
| `OPENAI_MODEL` | Responses API model with Structured Outputs support. Defaults to `gpt-4.1-mini`; choose a model available to your account or local provider. |
| `STUDYLENS_DATA_DIR` | Optional absolute storage directory. Defaults to `db/local/`, outside `public/`. Must be writable. |
| `OPENAI_BASE_URL` | Optional endpoint override for an OpenAI-compatible Responses API. Leave unset for OpenAI. Set to a local endpoint, for example `http://127.0.0.1:1234/v1`, to run without an API key. Browser tests use a local mock endpoint. |

SQLite metadata, extracted passages, generated responses, and chat history live in `db/local/studylens.sqlite`; original files live in `db/local/files/` under random identifiers. Both are ignored by Git and never served as public assets. Stop the app before backing up the complete data directory, including SQLite WAL files if present. Keep the directory on persistent local storage across restarts. Files are not encrypted at rest.

AI requests send selected or retrieved text to the configured provider. OpenRouter uses its OpenAI-compatible Chat Completions API with structured JSON output. Hosted OpenAI uses the Responses API with `store: false`; this is not a promise of zero provider retention. Local/OpenAI-compatible providers have their own behavior and must support `POST /v1/responses` with structured JSON output. Keep API keys out of source control.

## Study flow

1. Create, rename, switch, or delete a study set in the top bar. Resources and last activity persist in SQLite.
2. Drag files into the upload dialog, choose files, or paste text. Upload progress, indexing status, errors, and OCR warnings are shown. Select ready resources in the sidebar.
3. Generate a short or detailed summary with an overview, key concepts, definitions, and a revision checklist. Copy or download Markdown, including references.
4. Open a resource, select a passage, and choose Explain; or type a question. Explanations support simple, standard, and detailed depth.
5. Ask questions in Chat. Answers cite stored document/page/section passages. Open citation buttons to inspect evidence. Chat history remains available after refresh and restart.
6. Create a **slide lesson** with previous/next controls, per-slide transcript, source references, and browser speech synthesis. Narration is optional; unsupported browsers keep the transcript available.

Deleting a resource clears generated material and chat history for that set so references do not retain deleted content. Deleting a set removes its resources, passages, and generated history permanently.

## Supported material and limits

- Text-based PDF: up to **10 MB**, **300 pages**, and **500,000 extracted characters**. Page numbers are retained. Scanned PDFs require external OCR. Empty pages in mixed PDFs produce a warning. Password-protected/damaged PDFs get an actionable error.
- TXT and Markdown (`.txt`, `.md`, `.markdown`): UTF-8 text, up to **10 MB** and **500,000 characters**. Markdown headings become section references; plain text uses a section label and numbered passages.
- Pasted text is stored as a Markdown resource.
- Up to **30 resources per set**, **10 files per upload batch**. Files upload sequentially; a failure stops the batch and preserves earlier successes.
- Summaries and lessons use all selected passages up to **100,000 extracted characters**. Larger selections are rejected with guidance to select fewer resources; text is not silently truncated.
- Chat and Explain retrieve at most **10 passages** using SQLite FTS5/BM25 with stemming. They do not send every uploaded document. Up to four recent chat turns provide conversational context.

## Architecture

- `src/app/api/[...path]/route.ts`: Node runtime route handlers.
- `src/server/http.ts`: bounded request reading, input validation, local-origin checks, API dispatch, safe errors.
- `src/server/db/`: SQLite schema, persistence, FTS5 retrieval, resource lifecycle.
- `src/server/storage/`: private original file storage.
- `src/server/documents/`: PDF/text extraction, validation, section-preserving chunking.
- `src/server/ai/`: OpenRouter/OpenAI integration, structured output validation, bounded context, verified passage IDs, generation persistence.
- `src/components/`: interactive study workspace, resource uploader, Markdown and citation display, slide lesson player.

All database, storage, parsing, and AI modules are marked `server-only`. Uploaded instructions are explicitly treated as untrusted content. Generated citation IDs, including inline and slide references, must match passages supplied in that request. Invalid references reject the response. Sources are checked again before saving to avoid retaining evidence deleted during generation. Markdown does not render raw HTML or remote images.

The integration follows the official OpenAI [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs), uses `responses.parse` for OpenAI/local Responses providers, and uses `chat.completions.parse` with OpenRouter because OpenRouter's quickstart documents Chat Completions as the compatible endpoint.

## Commands and verification

```bash
npm run dev          # localhost development server
npm run lint         # ESLint
npm run typecheck    # Next route types and TypeScript
npm test             # Node unit/integration tests, mocked AI
npm run build        # production compilation
npm start            # localhost production server
npx playwright install chromium
npm run test:e2e      # requires production build first
```

Core tests use real PDF parsing, isolated SQLite storage, and injected mock model responses. They cover file validation, OCR detection, page/heading preservation, chunk coverage, citation rejection, cross-set retrieval isolation, upload-to-study API operations, missing credentials, cross-origin restrictions, deletion, and persistence visible to a separate Node process.

Browser tests start an isolated production server on port **3100** and a local mock OpenAI Responses endpoint on **4319**. They exercise the real SDK and browser upload-to-study flow without billing an API account. Tests cover summaries, citations, explanations, persisted chat, insufficient evidence, slide navigation, clipboard/download, PDF uploads, set/resource management, invalid uploads, keyboard dialogs, responsive layouts, and unavailable narration. Test files/data are isolated from your personal library; traces and screenshots go to `test-results/`.

**Mocked tests are not live API verification.** No live OpenAI request has been verified without credentials.

## Current limitations

- Local single-user MVP: no authentication, accounts, hosted deployment, or multi-process job coordination. Do not expose it to a public network. Local host/origin checks and loopback binding are intended for this setup.
- Parsing runs in the upload request. Interrupted jobs become actionable errors after 15 minutes; delete and upload again. There is no durable background queue or automatic retry.
- Extraction handles text, not images, handwritten notes, complex diagrams, or guaranteed table/math layout. OCR is not included.
- Retrieval is lexical, not embedding-based. Questions using very different wording may miss relevant passages. Ask with terms in the material or select a passage directly.
- Citation validation proves a passage exists and was supplied, not that every AI claim is correct. Inspect supporting passages. Prompt instructions reduce, but cannot eliminate, prompt injection or hallucinations.
- Generated content is not streamed. The latest summary, explanation, and lesson are displayed; previous generations are retained in SQLite. Chat history is fully displayed.
- Narration depends on browser/OS voices and user playback permissions. It reads one slide at a time; no audio files or videos are generated.
