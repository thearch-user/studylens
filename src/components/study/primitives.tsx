'use client';
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { X } from 'lucide-react';
import type { Citation, StudyResult } from '@/types/study';

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed. Please try again.');
  return data;
}
export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} onCancel={onClose} aria-label={title} className="modal"><header><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></header>{children}</dialog>;
}
export function Markdown({ text, citations, onSource }: { text: string; citations: Citation[]; onSource: (source: Citation) => void }) {
  const value = text.replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => { const index = citations.findIndex(c => c.id === id); return index < 0 ? '' : `[${index + 1}](#source-${id})`; });
  return <div className="prose"><ReactMarkdown components={{ a: ({ href, children }) => {
    const source = citations.find(c => href === `#source-${c.id}`);
    return source ? <button className="inline-citation" onClick={() => onSource(source)} aria-label={`Source: ${source.name}, ${source.location}`}>{children}</button> : <span>{children}</span>;
  }, img: () => null }}>{value}</ReactMarkdown></div>;
}
export function Sources({ result, onSource }: { result: StudyResult; onSource: (source: Citation) => void }) {
  if (!result.citations.length) return null;
  return <div className="sources"><p className="eyebrow">Supporting passages</p><div className="source-chips">{result.citations.map((c, i) => <button key={c.id} onClick={() => onSource(c)}><span>{i + 1}</span>{c.name}<small>{c.location}</small></button>)}</div></div>;
}
export function exportMarkdown(result: StudyResult) {
  const markdown = result.markdown.replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => { const index = result.citations.findIndex(c => c.id === id); return index >= 0 ? `[${index + 1}]` : ''; });
  return markdown + '\n\n## Sources\n' + result.citations.map((c, i) => `${i + 1}. ${c.name} — ${c.location}\n\n> ${c.text.replace(/\n/g, '\n> ')}`).join('\n\n');
}
