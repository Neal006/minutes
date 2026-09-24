// Five scripted meetings, synthesized to speech and run through the real pipeline
// (chunked WAV upload → OpenRouter STT → OpenRouter notes → search/ask). Numbers are spelled out
// so the word-error-rate compares what was said, not how a model formats digits.

export interface Line {
  speaker: string;
  text: string;
}

export interface Expectations {
  /** An extracted item must mention `keyword` (and name `owner`, when given). */
  actionItems: { owner?: string; keyword: string }[];
  /** Some decision must mention one of these keywords. Empty = any. */
  decisionKeywords?: string[];
  /** No decision may mention these (faithfulness: things that were NOT decided). */
  forbiddenDecisionKeywords?: string[];
  /** Questions asked after all meetings are in; the answer must mention a keyword and cite a source from this meeting. */
  questions: { q: string; keywords: string[] }[];
  /** The first transcript line must start at or after this second (leading-silence case). */
  firstSpeechAfterSec?: number;
}

export interface CaseStudy {
  id: string;
  title: string;
  why: string;
  leadingSilenceSec?: number;
  lines: Line[];
  expect: Expectations;
}

/** Two Windows SAPI voices at different rates stand in for five people. */
export const VOICES: Record<string, { voice: string; rate: number }> = {
  Maya: { voice: 'Microsoft Zira Desktop', rate: 0 },
  Jordan: { voice: 'Microsoft David Desktop', rate: 0 },
  Priya: { voice: 'Microsoft Zira Desktop', rate: 2 },
  Sam: { voice: 'Microsoft David Desktop', rate: 2 },
  Alex: { voice: 'Microsoft David Desktop', rate: -1 },
  Dana: { voice: 'Microsoft Zira Desktop', rate: -1 },
};

export const CASES: CaseStudy[] = [
  {
    id: 'sprint-planning',
    title: 'Sprint planning',
    why: 'The bread-and-butter case: clear owners, due dates and one explicit decision.',
    lines: [
      { speaker: 'Maya', text: 'Morning everyone. The goal today is to lock the scope for the next two week sprint.' },
      { speaker: 'Jordan', text: 'The calendar sync bug is still our top issue. Customers see duplicate events after they reconnect Google Calendar.' },
      { speaker: 'Maya', text: 'Then that goes first. Jordan, can you own the fix?' },
      { speaker: 'Jordan', text: 'Yes. I will have a fix ready for review by Wednesday.' },
      { speaker: 'Priya', text: 'The new onboarding checklist designs are done. I can hand off the final specs tomorrow.' },
      { speaker: 'Maya', text: 'Great. We decided to push the dark mode work to next sprint, because the sync bug matters more.' },
      { speaker: 'Jordan', text: 'Agreed. I also want to add an alert when sync failures spike, so we catch this earlier next time.' },
      { speaker: 'Maya', text: 'Good idea, take that as well. I will update the roadmap and tell support about the timeline today.' },
      { speaker: 'Priya', text: 'One risk. The checklist needs copy from marketing, and they have not sent it yet.' },
      { speaker: 'Maya', text: 'I will ask marketing for the copy by Thursday. Okay, that is the plan. Thanks all.' },
    ],
    expect: {
      actionItems: [
        { owner: 'Jordan', keyword: 'sync' },
        { owner: 'Priya', keyword: 'spec' },
        { owner: 'Maya', keyword: 'marketing' },
      ],
      decisionKeywords: ['dark mode'],
      questions: [{ q: 'When will the calendar sync fix be ready for review?', keywords: ['wednesday'] }],
    },
  },
  {
    id: 'customer-discovery',
    title: 'Customer discovery call',
    why: 'Next steps split across two companies, a hard requirement, and a conditional (not yet decided) pilot.',
    lines: [
      { speaker: 'Sam', text: 'Thanks for joining, Dana. What made you start looking for a meeting notes tool?' },
      { speaker: 'Dana', text: 'Our support team runs about forty customer calls a day, and nobody has time to write notes. Important details get lost.' },
      { speaker: 'Sam', text: 'What happens today when a customer reports a bug on a call?' },
      { speaker: 'Dana', text: 'The agent types a quick summary into Zendesk, but half the time the steps to reproduce are missing.' },
      { speaker: 'Sam', text: 'So the key requirement is getting bug details and action items into Zendesk automatically.' },
      { speaker: 'Dana', text: 'Exactly. And all of our data must stay in the European Union. That is a hard requirement from our legal team.' },
      { speaker: 'Sam', text: 'Understood. We do not have a European region yet, but it is on our roadmap. I will confirm the date with our engineers and email you by Friday.' },
      { speaker: 'Dana', text: 'Please do. If data residency works out, we would want a pilot with ten agents next month.' },
      { speaker: 'Sam', text: 'Great. I will also send over our security questionnaire today.' },
      { speaker: 'Dana', text: 'Perfect. I will bring Marco from our legal team to the next call.' },
    ],
    expect: {
      actionItems: [
        { owner: 'Sam', keyword: 'friday' },
        { owner: 'Sam', keyword: 'security' },
        { owner: 'Dana', keyword: 'marco' },
      ],
      questions: [{ q: "What is Dana's hard requirement for data?", keywords: ['european', 'eu'] }],
    },
  },
  {
    id: 'incident-postmortem',
    title: 'Incident postmortem',
    why: 'Dense facts (duration, root cause, impact) that search and Ask must retrieve precisely.',
    lines: [
      { speaker: 'Alex', text: "This is the postmortem for Tuesday's outage. Transcription was down for forty seven minutes, from two ten to two fifty seven in the afternoon." },
      { speaker: 'Alex', text: 'The root cause was an expired API key for our speech provider. Requests started failing and our retries made the queue back up.' },
      { speaker: 'Jordan', text: 'We had no alert on the error rate from the provider, so we only found out when customers wrote in.' },
      { speaker: 'Maya', text: 'How many customers were affected?' },
      { speaker: 'Alex', text: 'About three hundred meetings had no transcript. We reprocessed all of them by five o clock, so no data was lost.' },
      { speaker: 'Jordan', text: 'I will add an alert that fires when provider errors go above five percent for two minutes. I can ship that by Friday.' },
      { speaker: 'Alex', text: 'I will move the API keys into the secret manager with expiry reminders, by the end of next week.' },
      { speaker: 'Maya', text: 'And I will write the customer update and post it on the status page today.' },
      { speaker: 'Alex', text: 'We agreed that retries need a circuit breaker, so a dead provider does not flood the queue. Jordan, can you scope that?' },
      { speaker: 'Jordan', text: 'Yes, I will write a short design doc for the circuit breaker next week.' },
    ],
    expect: {
      actionItems: [
        { owner: 'Jordan', keyword: 'alert' },
        { owner: 'Alex', keyword: 'secret' },
        { owner: 'Maya', keyword: 'status' },
        { owner: 'Jordan', keyword: 'circuit' },
      ],
      decisionKeywords: ['circuit breaker'],
      questions: [
        { q: "What caused Tuesday's transcription outage?", keywords: ['expired', 'key'] },
        { q: 'How long was transcription down?', keywords: ['forty', '47'] },
      ],
    },
  },
  {
    id: 'hiring-debrief',
    title: 'Hiring debrief (no decision)',
    why: 'Faithfulness test: mixed opinions and an explicit "no decision today". Notes must not invent a hire/reject decision or extra owners.',
    lines: [
      { speaker: 'Priya', text: "Let's debrief on the frontend candidate we interviewed yesterday." },
      { speaker: 'Jordan', text: 'Strong on React and performance. The system design answer was a bit shallow though.' },
      { speaker: 'Priya', text: 'I agree on the design part. Her product sense was great. She asked sharp questions about our onboarding.' },
      { speaker: 'Maya', text: 'I am not sure yet. The take home project was clean, but I did not see much testing.' },
      { speaker: 'Jordan', text: 'That is fair. Maybe we ask about testing in a follow up call instead of rejecting her.' },
      { speaker: 'Priya', text: 'I would lean yes, but I do not want to decide without hearing from Sam, who ran the culture interview.' },
      { speaker: 'Maya', text: 'Okay. No decision today. I will ask Sam to send his notes, and we will meet again on Monday.' },
    ],
    expect: {
      actionItems: [{ owner: 'Maya', keyword: 'sam' }],
      forbiddenDecisionKeywords: ['hire her', 'extend an offer', 'make an offer', 'reject her', 'rejected'],
      questions: [{ q: 'What concerns came up about the frontend candidate?', keywords: ['design', 'testing'] }],
    },
  },
  {
    id: 'late-start-standup',
    title: 'Late start: 25 s of silence, then a standup',
    why: 'Someone forgot to unmute. The silent first chunk must be skipped without an API call, and timestamps must still line up with when people actually spoke.',
    leadingSilenceSec: 25,
    lines: [
      { speaker: 'Sam', text: 'Sorry, I was on mute. Quick update from me.' },
      { speaker: 'Sam', text: 'Yesterday I finished the Zendesk integration prototype. Today I am testing it with real tickets.' },
      { speaker: 'Alex', text: 'I am blocked on the staging database migration. I need Jordan to review the migration script.' },
      { speaker: 'Jordan', text: 'I will review it right after this call.' },
    ],
    expect: {
      actionItems: [{ owner: 'Jordan', keyword: 'review' }],
      firstSpeechAfterSec: 20,
      questions: [{ q: 'Who is blocked in the standup, and on what?', keywords: ['migration'] }],
    },
  },
];
