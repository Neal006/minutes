// Demo data so the app is explorable without API keys: `npm run seed`. Safe to re-run.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseTs } from './ai.ts';
import { openDb } from './db.ts';

type Line = [ts: string, text: string];
interface SeedMeeting {
  id: string;
  title: string;
  daysAgo: number;
  summary: string;
  decisions: string[];
  items: [text: string, owner: string | null, due: string | null, ts: string][];
  lines: Line[];
}

const meetings: SeedMeeting[] = [
  {
    id: 'seed-pricing',
    title: 'Pricing page redesign sync',
    daysAgo: 1,
    summary:
      'Priya, Marcus and Lena reviewed the pricing page redesign. Trial-to-paid conversion dropped after the last change, and interviews suggest the per-seat math is confusing for small teams. The group agreed to lead with a flat Team plan and move per-seat pricing to Enterprise. Engineering flagged that the billing service needs a migration before annual plans can ship.',
    decisions: ['Lead with a flat-price Team plan; per-seat pricing moves to Enterprise only', 'Annual plans wait until the billing migration lands'],
    items: [
      ['Write the billing migration plan for annual plans', 'Marcus', 'Thursday', '02:41'],
      ['Share five customer interview clips about pricing confusion', 'Lena', null, '01:12'],
      ['Draft copy for the new Team plan card', 'Priya', 'Friday', '03:30'],
    ],
    lines: [
      ['00:04', "Okay, let's start. The goal today is to decide what the pricing page leads with."],
      ['00:18', 'Quick context: trial-to-paid conversion is down about eight percent since we changed the page in March.'],
      ['00:35', 'That lines up with the interviews. People keep asking how many seats they need before they even try it.'],
      ['01:12', "Lena, can you pull five of those interview clips? I think the team should hear it in customers' own words."],
      ['01:30', "Sure, I'll pull the clips where people talk about per-seat pricing being confusing."],
      ['01:55', 'What if we lead with a flat Team plan and move per-seat to Enterprise?'],
      ['02:10', "I like that. Small teams don't want to do math on a pricing page."],
      ['02:25', "From the engineering side, flat pricing is easy. Annual plans are the hard part, billing can't prorate yet."],
      ['02:41', "I'll write up a migration plan for the billing service so we can support annual. I can have it by Thursday."],
      ['03:02', "So decision: flat Team plan first, annual waits on Marcus's migration."],
      ['03:30', "Agreed. I'll draft the copy for the Team plan card by Friday and share it in the channel."],
      ['03:48', 'Great, that was fast. Thanks everyone.'],
    ],
  },
  {
    id: 'seed-customer',
    title: 'Acme onboarding call',
    daysAgo: 3,
    summary:
      'Onboarding call with Dana from Acme. Their team of 40 records sales calls and wants notes pushed into their CRM automatically. The main blocker is SSO, which their security team requires before rollout. Dana also asked for search across all past calls to find competitor mentions.',
    decisions: ['Acme pilot starts with the sales team once SSO is enabled'],
    items: [
      ['Send Acme the SSO setup guide and security questionnaire', 'Sam', 'Tomorrow', '01:05'],
      ['Scope a CRM sync for action items', null, null, '01:48'],
      ['Schedule a follow-up with Acme security team', 'Dana', 'Next week', '02:30'],
    ],
    lines: [
      ['00:03', 'Thanks for making time, Dana. Tell me a bit about how your team runs calls today.'],
      ['00:15', "We're about forty people, mostly sales. Everyone takes their own notes and half of it never makes it into the CRM."],
      ['00:40', 'Got it. So the win is notes and action items landing in the CRM without anyone copying them.'],
      ['00:52', 'Exactly. But our security team will block anything that does not support SSO.'],
      ['01:05', "Totally fair. I'll send over the SSO setup guide and our security questionnaire tomorrow."],
      ['01:30', 'The other thing is search. I want to find every call where a competitor came up last quarter.'],
      ['01:48', "That's exactly what search is for. The CRM sync for action items we'd need to scope, I'll take that back to the team."],
      ['02:30', "I'll set up a follow-up with our security folks next week once they've read the questionnaire."],
      ['02:52', 'Perfect. If SSO checks out, we would start the pilot with the sales team.'],
    ],
  },
  {
    id: 'seed-eng',
    title: 'Transcription latency review',
    daysAgo: 6,
    summary:
      'The team reviewed live transcription latency. P95 time from speech to text on screen is 9 seconds, mostly from 20-second chunks plus upload time on slow networks. They agreed to try voice-activity-based chunk boundaries and to add a latency metric to the dashboard before changing anything.',
    decisions: ['Measure end-to-end latency before tuning chunk size', 'Prototype VAD-based chunk boundaries'],
    items: [
      ['Add speech-to-screen latency metric to the dashboard', 'Jordan', 'Monday', '00:58'],
      ['Prototype voice-activity-based chunking', 'Ava', null, '01:40'],
    ],
    lines: [
      ['00:05', 'So the question is why live transcription feels slow on some calls.'],
      ['00:20', "P95 from someone speaking to text on screen is about nine seconds. Most of that is the twenty second chunk size."],
      ['00:41', "Slow networks make it worse, the upload queue backs up and retries with backoff."],
      ['00:58', "Before we tune anything, I want a real latency metric on the dashboard. I'll add it by Monday."],
      ['01:20', 'Shorter chunks cut words in half at the boundaries though, and accuracy drops.'],
      ['01:40', "What if we cut on silence instead of a fixed timer? I can prototype voice activity detection for chunk boundaries."],
      ['02:05', "Let's do both. Measure first, then try the VAD boundaries against the baseline."],
    ],
  },
];

const root = path.resolve(import.meta.dirname, '../../..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));
mkdirSync(dataDir, { recursive: true });
const db = openDb(path.join(dataDir, 'minutes.db'));

db.transaction(() => {
  for (const m of meetings) {
    db.prepare('DELETE FROM meetings WHERE id = ?').run(m.id);
    const starts = m.lines.map(([ts]) => parseTs(ts)!);
    const duration = starts[starts.length - 1] + 8000;
    db.prepare(
      `INSERT INTO meetings (id, title, title_locked, status, created_at, duration_ms, summary, decisions)
       VALUES (?, ?, 0, 'ready', ?, ?, ?, ?)`,
    ).run(m.id, m.title, Date.now() - m.daysAgo * 86_400_000, duration, m.summary, JSON.stringify(m.decisions));
    const seg = db.prepare('INSERT INTO segments (meeting_id, seq, start_ms, end_ms, text) VALUES (?, 0, ?, ?, ?)');
    m.lines.forEach(([, text], i) => seg.run(m.id, starts[i], starts[i + 1] ?? duration, text));
    const item = db.prepare('INSERT INTO action_items (meeting_id, text, owner, due, start_ms) VALUES (?, ?, ?, ?, ?)');
    for (const [text, owner, due, ts] of m.items) item.run(m.id, text, owner, due, parseTs(ts));
  }
})();

console.log(`Seeded ${meetings.length} meetings into ${dataDir}`);
