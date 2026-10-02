'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, ChevronDown, FolderOpen, GraduationCap, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import type { StudySet } from '@/types/study';
import { api, Modal } from './primitives';
import Workspace from './workspace';
export default function StudyLens() {
  const [sets, setSets] = useState<StudySet[]>([]); const [activeId, setActiveId] = useState('');
  const [configured, setConfigured] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'create' | 'rename' | 'delete' | null>(null); const [name, setName] = useState(''); const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const active = sets.find(set => set.id === activeId);
  const refresh = useCallback(async () => {
    try {
      const data = await api<{ sets: StudySet[]; aiConfigured: boolean }>('/api/sets'); setSets(data.sets); setConfigured(data.aiConfigured); setError('');
      setActiveId(previous => data.sets.some(set => set.id === previous) ? previous : data.sets[0]?.id || '');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load study sets.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let live = true;
    api<{ sets: StudySet[]; aiConfigured: boolean }>('/api/sets').then(data => {
      if (!live) return;
      setSets(data.sets); setConfigured(data.aiConfigured); setActiveId(data.sets[0]?.id || '');
    }).catch(err => { if (live) setError(err instanceof Error ? err.message : 'Could not load study sets.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  function open(mode: 'create' | 'rename' | 'delete') { setName(mode === 'rename' ? active?.name || '' : ''); setDialogError(''); setDialog(mode); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setDialogError('');
    try {
      if (dialog === 'create') { const data = await api<{ id: string }>('/api/sets', { method: 'POST', body: JSON.stringify({ name }) }); await refresh(); setActiveId(data.id); }
      else if (dialog === 'rename' && active) { await api(`/api/sets/${active.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); await refresh(); }
      else if (dialog === 'delete' && active) { await api(`/api/sets/${active.id}`, { method: 'DELETE' }); await refresh(); }
      setDialog(null);
    } catch (err) { setDialogError(err instanceof Error ? err.message : 'Could not save changes.'); }
    finally { setSaving(false); }
  }
  return <div className="app-shell"><a href="#workspace" className="skip-link">Skip to study workspace</a>
    <header className="app-header"><Link href="/" className="brand" aria-label="StudyLens home"><span className="brand-symbol"><Search size={25} /></span>Study<span>Lens</span></Link><div className="header-center"><GraduationCap size={16} /> Your space to understand</div><span className="profile-avatar" aria-label="Local single-user profile">You</span></header>
    <div className="set-bar"><div className="set-selector"><FolderOpen size={18} /><label className="sr-only" htmlFor="study-set">Study set</label><select id="study-set" value={activeId} onChange={e => setActiveId(e.target.value)} disabled={!sets.length}>{!sets.length && <option value="">Your study sets</option>}{sets.map(set => <option key={set.id} value={set.id}>{set.name} · {set.resourceCount} resources</option>)}</select><ChevronDown size={14} /></div>
      {active && <><span className="last-activity">Last activity {new Date(active.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><button className="icon-button" aria-label="Rename study set" onClick={() => open('rename')}><Pencil size={16} /></button><button className="icon-button" aria-label="Delete study set" onClick={() => open('delete')}><Trash2 size={16} /></button></>}
      <button className="new-set-button" onClick={() => open('create')}><Plus size={16} /> New study set</button></div>
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => void refresh()}>Try again</button></div>}
    {loading ? <main className="welcome" id="workspace" role="status"><p>Opening your workspace…</p></main> : active ? <Workspace key={active.id} set={active} aiConfigured={configured} onActivity={refresh} /> : <main className="welcome" id="workspace"><div className="welcome-badge"><Sparkles size={16} /> Less overwhelm. More understanding.</div><h1>Make room for your<br /><span>next lightbulb moment.</span></h1><p>Your notes, readings, and questions. One calm place to connect the dots.<br />Create a study set to start learning with your own material.</p><button className="primary large" onClick={() => open('create')}><Plus size={18} /> Create your first study set</button><div className="feature-grid"><article><FileIcon /><h3>Bring it together</h3><p>PDFs, notes, and pasted text in one private workspace.</p></article><article><Sparkles /><h3>Find the clarity</h3><p>Focused summaries and explanations at your pace.</p></article><article><BookOpen /><h3>Go back to the source</h3><p>Answers linked to the passages that support them.</p></article></div><p className="small muted">Local single-user workspace · Your resources stay saved on this device</p></main>}
    {dialog && <Modal title={dialog === 'create' ? 'Create a study set' : dialog === 'rename' ? 'Rename study set' : 'Delete study set?'} onClose={() => { if (!saving) setDialog(null); }}><form onSubmit={save}>{dialog === 'delete' ? <p>Delete “{active?.name}” and all its resources, summaries, lessons, and chat history? This cannot be undone.</p> : <><p className="muted">A subject, a course, or something you’re curious about.</p><label>Study set name<input autoFocus required maxLength={80} placeholder="e.g. Introduction to psychology" value={name} onChange={e => setName(e.target.value)} disabled={saving} /></label></>}{dialogError && <p className="error" role="alert">{dialogError}</p>}<footer><button type="button" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className={dialog === 'delete' ? 'danger' : 'primary'} disabled={saving || (dialog !== 'delete' && !name.trim())}>{saving ? 'Saving…' : dialog === 'create' ? 'Create study set' : dialog === 'delete' ? 'Delete permanently' : 'Save name'}</button></footer></form></Modal>}
  </div>;
}
function FileIcon() { return <FolderOpen />; }
