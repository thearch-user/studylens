'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, Check, ChevronRight, Copy, Download, FileText, Lightbulb, LoaderCircle, MessageCircle, Plus, Presentation, Sparkles, Trash2, Upload } from 'lucide-react';
import type { Citation, Entry, Mode, Passage, SetDetail, StudySet } from '@/types/study';
import Uploader from '../upload/uploader';
import Lesson from './lesson';
import { api, exportMarkdown, Markdown, Modal, Sources } from './primitives';

const tabs = [{ id: 'summary', label: 'Summary', icon: FileText }, { id: 'explain', label: 'Explain', icon: Lightbulb }, { id: 'chat', label: 'Chat', icon: MessageCircle }, { id: 'lesson', label: 'Lesson', icon: Presentation }] as const;
const descriptions = {
  summary: ['The big picture, made clear.', 'Turn your resources into an overview, key concepts, definitions, and a revision checklist.'],
  explain: ['Make the difficult click.', 'Ask about a concept or select a passage from a resource. Choose how deep you want to go.'],
  chat: ['A conversation with your material.', 'Ask questions, connect ideas, and follow every answer back to its source.'],
  lesson: ['One idea at a time.', 'Create a slide lesson with a spoken transcript to work through at your own pace.'],
};
export default function Workspace({ set, aiConfigured, onActivity }: { set: StudySet; aiConfigured: boolean; onActivity: () => Promise<void> }) {
  const [detail, setDetail] = useState<SetDetail | null>(null); const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState<Mode>('summary'); const [depth, setDepth] = useState('short'); const [prompt, setPrompt] = useState('');
  const [upload, setUpload] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [source, setSource] = useState<Citation | null>(null); const [preview, setPreview] = useState<{ name: string; passages: Passage[] } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const refresh = useCallback(async (selectAll = false) => {
    try {
      const data = await api<SetDetail>(`/api/sets/${set.id}`); setDetail(data);
      setSelected(previous => selectAll ? data.resources.filter(r => r.status === 'ready').map(r => r.id) : previous.filter(id => data.resources.some(r => r.id === id && r.status === 'ready')));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load resources.'); }
  }, [set.id]);
  useEffect(() => {
    let live = true;
    api<SetDetail>(`/api/sets/${set.id}`).then(data => {
      if (!live) return;
      setDetail(data); setSelected(data.resources.filter(r => r.status === 'ready').map(r => r.id));
    }).catch(err => { if (live) setError(err instanceof Error ? err.message : 'Could not load resources.'); });
    return () => { live = false; };
  }, [set.id]);
  useEffect(() => {
    if (!detail?.resources.some(r => r.status === 'processing')) return;
    const timer = setInterval(() => { void refresh(true); }, 3000); return () => clearInterval(timer);
  }, [detail, refresh]);
  const history = detail?.entries.filter(e => e.mode === tab) || [];
  const latest = history.at(-1);
  const ready = detail?.resources.filter(r => r.status === 'ready').length || 0;
  async function run() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const entry = await api<Entry>(`/api/sets/${set.id}/study`, { method: 'POST', body: JSON.stringify({ mode: tab, depth, prompt, resourceIds: selected }) });
      setDetail(previous => previous ? { ...previous, entries: [...previous.entries, entry] } : previous);
      if (tab === 'chat') setPrompt('');
      setNotice('Saved to this study set.'); await onActivity();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not generate a response.'); }
    finally { setBusy(false); }
  }
  async function viewResource(id: string, name: string) {
    try { const data = await api<{ passages: Passage[] }>(`/api/sets/${set.id}/passages/${id}`); setPreview({ name, passages: data.passages }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not open resource.'); }
  }
  function switchTab(mode: Mode) { if (busy) return; setTab(mode); setDepth(mode === 'summary' ? 'short' : 'standard'); setError(''); setNotice(''); }
  function explainSelection(text: string) { setPrompt(text.slice(0, 4000)); switchTab('explain'); setSource(null); setPreview(null); }
  async function copy() {
    try { if (latest) { await navigator.clipboard.writeText(exportMarkdown(latest.result)); setNotice('Summary copied as Markdown.'); } }
    catch { setError('Clipboard access is unavailable. Use Download instead.'); }
  }
  function download() {
    if (!latest) return;
    const url = URL.createObjectURL(new Blob([exportMarkdown(latest.result)], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'studylens-summary.md'; a.click(); URL.revokeObjectURL(url);
    setNotice('Markdown download started.');
  }
  return <div className="workspace-layout">
    <aside className="resource-panel" aria-label="Resources"><div className="resource-heading"><div><p className="eyebrow">Your material</p><h2>Resources <span className="count">{detail?.resources.length || 0}</span></h2></div><button className="icon-button" aria-label="Add resources" onClick={() => setUpload(true)}><Plus size={20} /></button></div>
      <button className="upload-button" onClick={() => setUpload(true)}><Upload size={17} /> Add resources</button>
      <p className="small muted selection-note">Select what you want to study.</p>
      {ready > 0 && <button className="text-button" disabled={busy} onClick={() => setSelected(selected.length === ready ? [] : detail!.resources.filter(r => r.status === 'ready').map(r => r.id))}>{selected.length === ready ? 'Deselect all' : 'Select all'} · {selected.length} selected</button>}
      {!detail ? <p className="muted" role="status">Loading resources…</p> : !detail.resources.length ? <div className="resource-empty"><BookOpen size={30} /><h3>A home for your notes</h3><p>Add your first resource to get started.</p></div> : <div className="resource-list">{detail.resources.map(resource => <div className={`resource-card ${selected.includes(resource.id) ? 'selected' : ''}`} key={resource.id}>
        <div className="resource-row"><input type="checkbox" aria-label={`Select ${resource.name}`} checked={selected.includes(resource.id)} disabled={resource.status !== 'ready' || busy} onChange={event => setSelected(ids => event.target.checked ? [...ids, resource.id] : ids.filter(id => id !== resource.id))} /><FileText size={19} /><button className="resource-name" disabled={resource.status !== 'ready'} onClick={() => void viewResource(resource.id, resource.name)}>{resource.name}</button><button className="icon-button delete-resource" aria-label={`Delete ${resource.name}`} disabled={busy} onClick={() => setDeleting(resource.id)}><Trash2 size={14} /></button></div>
        <div className="resource-meta"><span className={`status ${resource.status}`}>{resource.status === 'ready' ? <Check size={12} /> : resource.status === 'processing' ? <LoaderCircle size={12} className="spin" /> : null}{resource.status}</span><span>{Math.max(1, Math.round(resource.size / 1024))} KB</span></div>
        {resource.error && <p className="small error">{resource.error}</p>}{resource.warning && <p className="small warning">{resource.warning}</p>}
      </div>)}</div>}
      <div className="resource-footer"><span className="status-dot" /> Saved on this device<p>Open a resource to read its passages.</p></div>
    </aside>
    <main className="study-workspace" id="workspace"><header className="workspace-header"><div><p className="eyebrow">Your study workspace</p><h1>{set.name}</h1><p className="muted">A little clarity. A lot of possibility.</p></div><span className="local-badge"><span className="status-dot" /> Personal workspace</span></header>
      <nav className="tabs" aria-label="Study tools">{tabs.map(item => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} className={tab === item.id ? 'active' : ''} disabled={busy} onClick={() => switchTab(item.id)}><item.icon size={18} />{item.label}</button>)}</nav>
      <div className="workspace-content">
        {!aiConfigured && <div className="setup-notice"><Sparkles size={20} /><div><strong>Connect an AI provider to start studying</strong><p>Add <code>OPENROUTER_API_KEY</code> for OpenRouter’s free model router, use <code>OPENAI_API_KEY</code> for OpenAI, or set <code>OPENAI_BASE_URL</code> to a local compatible endpoint. Restart after changing <code>.env.local</code>.</p></div><span className="pill">Setup needed</span></div>}
        {error && <div className="error-banner" role="alert">{error}<button className="text-button" onClick={() => { setError(''); void refresh(); }}>Refresh resources</button></div>}
        <div role="status" className="save-notice">{notice}</div>
        <div className="study-title"><div><p className="eyebrow">{tab === 'lesson' ? 'Narrated slide lessons' : `Your ${tab}`}</p><h2>{descriptions[tab][0]}</h2><p className="muted">{descriptions[tab][1]}</p></div>{tab === 'summary' && latest && <div className="export-actions"><button onClick={() => void copy()} aria-label="Copy summary"><Copy size={16} /> Copy</button><button onClick={download} aria-label="Download summary"><Download size={16} /> Markdown</button></div>}</div>
        {!detail ? <div className="empty-study" role="status"><LoaderCircle className="spin" />Loading your workspace…</div> : !ready ? <div className="empty-study"><div className="empty-art"><div className="art-orbit" /><BookOpen size={48} /><span><Sparkles size={21} /></span></div><h2>Good learning starts with your material.</h2><p>Upload a reading, drop in your lecture notes, or paste a passage.<br />We’ll help you turn it into understanding.</p><button className="primary" onClick={() => setUpload(true)}><Plus size={17} /> Add your first resource</button><div className="file-tags"><span>PDF</span><span>TXT</span><span>Markdown</span><span>Pasted text</span></div></div> : <>
          {(tab === 'summary' || tab === 'lesson') && <div className="generation-toolbar"><div className="toolbar-options">{tab === 'summary' && <label className="inline-label">Detail<select aria-label="Summary length" value={depth} disabled={busy} onChange={e => setDepth(e.target.value)}><option value="short">Short & focused</option><option value="detailed">Detailed</option></select></label>}<span className="small muted">{selected.length} resource{selected.length === 1 ? '' : 's'} selected</span></div><button className="primary" disabled={busy || !selected.length || !aiConfigured} onClick={() => void run()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{busy ? 'Creating…' : tab === 'summary' ? latest ? 'Regenerate summary' : 'Generate summary' : latest ? 'Regenerate slide lesson' : 'Create slide lesson'}</button></div>}
          {tab === 'explain' && <form className="question-form" onSubmit={e => { e.preventDefault(); void run(); }}><label>What would you like to understand?<textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={4000} rows={3} placeholder="Ask a question or paste a tricky passage…" required disabled={busy} /></label><div className="form-bottom"><label className="inline-label">Depth<select value={depth} onChange={e => setDepth(e.target.value)} disabled={busy}><option value="simple">Simple</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select></label><button className="primary" disabled={busy || !prompt.trim() || !selected.length || !aiConfigured}><Lightbulb size={17} />{busy ? 'Explaining…' : 'Explain concept'}</button></div></form>}
          {tab === 'chat' ? <><div className="chat-history" aria-live="polite">{history.length ? history.map(entry => <div key={entry.id} className="chat-turn"><div className="user-message"><span className="eyebrow">You</span><p>{entry.prompt}</p></div><div className="assistant-message"><span className="eyebrow"><Sparkles size={14} /> StudyLens</span><Markdown text={entry.result.markdown} citations={entry.result.citations} onSource={setSource} /><Sources result={entry.result} onSource={setSource} /></div></div>) : <div className="chat-empty"><MessageCircle size={34} /><h3>Follow your curiosity.</h3><p>Start with a question about your selected resources.</p><button onClick={() => setPrompt('What are the main ideas in this material?')}>What are the main ideas? <ArrowUpRight size={15} /></button></div>}{busy && <p className="thinking" role="status"><LoaderCircle className="spin" size={17} /> Finding supporting passages…</p>}</div><form className="chat-composer" onSubmit={e => { e.preventDefault(); void run(); }}><label className="sr-only" htmlFor="chat-question">Ask your material</label><textarea id="chat-question" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={4000} rows={2} placeholder="Ask your material a question…" required disabled={busy} /><button className="primary" aria-label="Send question" disabled={busy || !prompt.trim() || !selected.length || !aiConfigured}><ArrowUpRight size={21} /></button></form><p className="small muted">Answers use your selected resources. Always check supporting passages.</p></> : latest ? <article className="result-card">{tab === 'lesson' ? <Lesson key={latest.id} result={latest.result} onSource={setSource} /> : <><Markdown text={latest.result.markdown} citations={latest.result.citations} onSource={setSource} /><Sources result={latest.result} onSource={setSource} /></>}<p className="result-date">Saved {new Date(latest.createdAt).toLocaleString()} · AI-generated · Check the sources</p></article> : <div className="waiting-card"><Sparkles size={27} /><h3>{tab === 'explain' ? 'Understanding is a question away.' : 'Your material, thoughtfully connected.'}</h3><p>{!selected.length ? 'Select at least one ready resource in the sidebar.' : 'Your generated study material will appear here and stay saved with this set.'}</p></div>}
          {busy && tab !== 'chat' && <p className="thinking" role="status"><LoaderCircle className="spin" size={17} /> Reading selected passages and preparing your {tab === 'lesson' ? 'slide lesson' : tab}…</p>}
        </>}
        <div className="workspace-footnote"><BookOpen size={14} /> Grounded in your resources. Designed for understanding.</div>
      </div>
    </main>
    {upload && <Uploader setId={set.id} onClose={() => setUpload(false)} onDone={async () => { await refresh(true); await onActivity(); }} />}
    {source && <Modal title={`${source.name} · ${source.location}`} onClose={() => setSource(null)}><p className="eyebrow">Supporting passage</p><p className="passage-text">{source.text}</p><button className="primary" disabled={busy} onClick={() => explainSelection(window.getSelection()?.toString().trim() || source.text)}><Lightbulb size={17} /> Explain selected text or passage</button></Modal>}
    {preview && <Modal title={preview.name} onClose={() => setPreview(null)}><p className="small muted">Select text in a passage, then choose Explain. Page and section labels come from the original resource.</p><div className="passage-list">{preview.passages.map(passage => <article key={passage.id}><p className="eyebrow">{passage.location} · Passage {passage.ordinal + 1}</p><p className="passage-text">{passage.text}</p><button disabled={busy} onClick={() => explainSelection(window.getSelection()?.toString().trim() || passage.text)}>Explain this passage <ChevronRight size={15} /></button></article>)}</div></Modal>}
    {deleting && <Modal title="Delete resource?" onClose={() => setDeleting(null)}><p>This permanently deletes the resource and clears generated study material and chat history in this set, so no references point to deleted content.</p><footer><button onClick={() => setDeleting(null)}>Keep resource</button><button className="danger" onClick={async () => { try { await api(`/api/sets/${set.id}/resources/${deleting}`, { method: 'DELETE' }); setDeleting(null); await refresh(); await onActivity(); } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed.'); setDeleting(null); } }}>Delete resource</button></footer></Modal>}
  </div>;
}
