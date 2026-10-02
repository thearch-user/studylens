'use client';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Volume2, Square, Presentation } from 'lucide-react';
import type { Citation, StudyResult } from '@/types/study';
import { Markdown, Sources } from './primitives';
export default function Lesson({ result, onSource }: { result: StudyResult; onSource: (source: Citation) => void }) {
  const [index, setIndex] = useState(0); const [speaking, setSpeaking] = useState(false); const [error, setError] = useState('');
  const [supported] = useState(() => typeof window !== 'undefined' && typeof window.speechSynthesis?.speak === 'function');
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);
  const slide = result.slides[index];
  if (!slide) return <Markdown text={result.markdown} citations={result.citations} onSource={onSource} />;
  function stop() { if (supported) window.speechSynthesis.cancel(); setSpeaking(false); }
  function narrate() {
    stop(); setError('');
    const speech = new SpeechSynthesisUtterance(slide.transcript.replace(/\[\[[^\]]+\]\]/g, ''));
    speech.rate = 0.95; speech.onend = () => setSpeaking(false); speech.onerror = event => { setSpeaking(false); if (event.error !== 'interrupted' && event.error !== 'canceled') setError('Narration could not play. You can read the transcript below.'); };
    setSpeaking(true); window.speechSynthesis.speak(speech);
  }
  return <div><div className="slide"><p className="eyebrow"><Presentation size={15} /> Slide lesson · {index + 1} / {result.slides.length}</p><h2>{slide.title}</h2><ul>{slide.bullets.map((bullet, i) => <li key={i}><Markdown text={bullet} citations={result.citations} onSource={onSource} /></li>)}</ul></div>
    <div className="lesson-controls"><button disabled={index === 0} onClick={() => { stop(); setIndex(index - 1); }}><ChevronLeft size={17} /> Previous</button><button disabled={!supported} onClick={speaking ? stop : narrate}>{speaking ? <Square size={16} /> : <Volume2 size={17} />}{speaking ? 'Stop' : 'Narrate slide'}</button><button disabled={index === result.slides.length - 1} onClick={() => { stop(); setIndex(index + 1); }}>Next <ChevronRight size={17} /></button></div>
    {!supported && <p className="notice">Narration is not supported in this browser. The full transcript is available below.</p>}{error && <p role="alert" className="error">{error}</p>}
    <div className="transcript"><p className="eyebrow">Transcript</p><Markdown text={slide.transcript} citations={result.citations} onSource={onSource} /></div><Sources result={{ ...result, citations: result.citations.filter(c => slide.citationIds.includes(c.id)) }} onSource={onSource} />
  </div>;
}
