import { useState } from 'react';
import { api, type AskResult } from '../api.ts';
import { formatTs, useRoute } from '../util.tsx';

const SUGGESTIONS = ['What did we decide about pricing?', 'What does Acme need before rollout?', 'Why is live transcription slow?'];

interface Turn {
  question: string;
  result?: AskResult;
  error?: string;
}

/** Renders "[2]" markers as links to the cited moment. */
function Answer({ result }: { result: AskResult }) {
  const byN = new Map(result.sources.map((s) => [s.n, s]));
  return (
    <p className="answer">
      {result.answer.split(/(\[\d+\])/).map((part, i) => {
        const s = byN.get(Number(part.slice(1, -1)));
        return s ? (
          <a key={i} className="cite" href={`#/m/${s.meeting_id}?t=${s.start_ms}`} title={`${s.meeting_title} · ${formatTs(s.start_ms)}`}>
            {s.n}
          </a>
        ) : (
          part
        );
      })}
    </p>
  );
}

export function Ask() {
  const initial = useRoute().params.get('q') ?? '';
  const [question, setQuestion] = useState(initial);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    setBusy(true);
    setQuestion('');
    setTurns((t) => [{ question: q }, ...t]);
    const update = (patch: Partial<Turn>) => setTurns((t) => [{ ...t[0], ...patch }, ...t.slice(1)]);
    try {
      update({ result: await api.ask(q) });
    } catch (e) {
      update({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page ask">
      <h1 className="page-title">Ask your meetings</h1>
      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
          placeholder="e.g. What did we promise Acme?"
          maxLength={500}
          rows={2}
          autoFocus
        />
        <button className="btn primary" disabled={busy || !question.trim()}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      {!turns.length && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip button" onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {turns.map((t, i) => (
        <div key={turns.length - i} className="turn">
          <p className="question">{t.question}</p>
          {t.error && <p className="error-text">{t.error}</p>}
          {!t.result && !t.error && (
            <p className="muted">
              <span className="spinner" /> Reading your transcripts…
            </p>
          )}
          {t.result && (
            <>
              <Answer result={t.result} />
              {t.result.sources.length > 0 && (
                <ol className="sources">
                  {t.result.sources.map((s) => (
                    <li key={s.n}>
                      <a href={`#/m/${s.meeting_id}?t=${s.start_ms}`}>
                        <span className="cite">{s.n}</span>
                        <span>
                          <b>{s.meeting_title}</b> <span className="muted">· {formatTs(s.start_ms)}</span>
                          <br />“{s.text}”
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  );
}
