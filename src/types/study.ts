export type StudySet = { id: string; name: string; updatedAt: string; resourceCount: number };
export type Resource = { id: string; setId: string; name: string; size: number; status: 'processing' | 'ready' | 'error'; error: string | null; warning: string | null; createdAt: string; passageCount: number };
export type Passage = { id: string; resourceId: string; name: string; location: string; text: string; ordinal: number };
export type Citation = Passage;
export type StudyResult = { markdown: string; citations: Citation[]; slides: { title: string; bullets: string[]; transcript: string; citationIds: string[] }[]; supported: boolean };
export type Mode = 'summary' | 'explain' | 'chat' | 'lesson';
export type Entry = { id: string; mode: Mode; prompt: string; result: StudyResult; createdAt: string };
export type SetDetail = { resources: Resource[]; entries: Entry[] };
