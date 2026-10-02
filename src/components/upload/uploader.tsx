'use client';
import { useRef, useState } from 'react';
import { FileUp, ClipboardPaste, Upload } from 'lucide-react';
import { Modal } from '../study/primitives';

export default function Uploader({ setId, onClose, onDone }: { setId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [text, setText] = useState(''); const [name, setName] = useState('Pasted notes');
  const [drag, setDrag] = useState(false); const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0); const [status, setStatus] = useState('');
  const [error, setError] = useState(''); const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function upload(files: File[]) {
    if (busy || !files.length) return;
    setError(''); setDone(false); setBusy(true);
    try {
      if (files.length > 10) throw new Error('Upload up to 10 files at a time.');
      for (const file of files) {
        if (!/\.(pdf|txt|md|markdown)$/i.test(file.name)) throw new Error(`${file.name}: choose PDF, TXT, or Markdown.`);
        if (file.size > 10 * 1024 * 1024 || !file.size) throw new Error(`${file.name}: files must be nonempty and 10 MB or smaller.`);
      }
      for (let i = 0; i < files.length; i++) {
        const file = files[i]; setProgress(0); setStatus(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
        const form = new FormData(); form.append('file', file);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest(); xhr.open('POST', `/api/sets/${setId}/resources`); xhr.timeout = 180_000;
          xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
          xhr.upload.onload = () => setStatus(`Extracting and indexing ${file.name}…`);
          xhr.onload = () => {
            let data; try { data = JSON.parse(xhr.responseText); } catch { reject(new Error('The server returned an unreadable response. Try again.')); return; }
            if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(data.error || 'Upload failed.'));
          };
          xhr.onerror = () => reject(new Error('Connection lost. Check your connection and try again.'));
          xhr.ontimeout = () => reject(new Error('Processing timed out. Refresh the resource list before trying again.'));
          xhr.send(form);
        });
      }
      setDone(true); setStatus(`${files.length} resource${files.length > 1 ? 's' : ''} ready to study.`); setText('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed.'); }
    finally { setBusy(false); await onDone(); }
  }
  return <Modal title="Add learning resources" onClose={() => { if (!busy) onClose(); }}>
    <p className="muted">Bring your notes, readings, and lecture material together.</p>
    <div className="segmented"><button disabled={busy} className={mode === 'file' ? 'chosen' : ''} onClick={() => setMode('file')}><FileUp size={16} /> Upload files</button><button disabled={busy} className={mode === 'text' ? 'chosen' : ''} onClick={() => setMode('text')}><ClipboardPaste size={16} /> Paste text</button></div>
    {mode === 'file' ? <div className={`drop-zone ${drag ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={event => { event.preventDefault(); setDrag(false); void upload(Array.from(event.dataTransfer.files)); }}>
      <div className="round-icon"><Upload size={26} /></div><h3>Drop your resources here</h3><p>PDF, TXT, or Markdown · up to 10 MB each</p><button className="primary" disabled={busy} onClick={() => input.current?.click()}>Choose files</button><input ref={input} type="file" accept=".pdf,.txt,.md,.markdown" multiple hidden aria-label="Upload resources" onChange={event => { void upload(Array.from(event.target.files || [])); event.target.value = ''; }} />
    </div> : <form onSubmit={event => { event.preventDefault(); void upload([new File([text], `${name.trim() || 'Pasted notes'}.md`, { type: 'text/markdown' })]); }}>
      <label>Resource name<input value={name} onChange={event => setName(event.target.value)} maxLength={100} disabled={busy} required /></label><label>Your notes<textarea value={text} onChange={event => setText(event.target.value)} placeholder="Paste a passage, lecture notes, or a chapter…" rows={8} maxLength={500000} disabled={busy} required /></label><button className="primary" disabled={busy || !text.trim()}>Save text as a resource</button>
    </form>}
    <p className="small muted">Text-based PDFs only. Scanned PDFs need OCR before upload. Files stay on this device; selected text is sent to the AI provider when you generate a response.</p>
    {busy && <progress value={progress} max={100} aria-label="Upload progress" />}
    {status && <p role="status" className={done ? 'success' : 'muted'}>{status}</p>}{error && <p role="alert" className="error">{error}</p>}
    <footer><button onClick={onClose} disabled={busy}>{done ? 'Start studying' : 'Close'}</button></footer>
  </Modal>;
}
