# Case studies: five meetings through the real pipeline

Run on 2026-09-24 with **OpenRouter free models only** (notes/ask: openrouter, transcription: local). Each meeting was synthesized with the built-in Windows voices, split into 20-second 16 kHz WAV chunks, and uploaded through the same HTTP API the browser recorder uses. Nothing is mocked. Reproduce with `npm run case-studies`.

**43 / 43 content checks passed** (transcript, tasks, decisions, grounded answers, silence). **Owners: 3 / 12**: owners named in the text ("Jordan, can you own the fix?") are captured; every miss is a first-person commitment ("I will…") and transcripts have no speaker labels, so the pipeline correctly records null rather than guessing. Speaker diarization is the fix.

| # | Case | Audio | Chunks (skipped silent) | Transcript WER | Notes ready after stop | Action items | Checks |
|---|---|---|---|---|---|---|---|
| 1 | [Sprint planning](#1-sprint-planning) | 67 s | 4 (0) | 7.1% | 50.3 s | 6 | 10/12 |
| 2 | [Customer discovery call](#2-customer-discovery) | 68 s | 4 (0) | 3.0% | 26.9 s | 3 | 9/11 |
| 3 | [Incident postmortem](#3-incident-postmortem) | 77 s | 4 (0) | 7.0% | 26.2 s | 4 | 12/15 |
| 4 | [Hiring debrief (no decision)](#4-hiring-debrief) | 45 s | 3 (0) | 3.4% | 41.4 s | 3 | 7/8 |
| 5 | [Late start: 25 s of silence, then a standup](#5-late-start-standup) | 46 s | 3 (1) | 8.3% | 17.7 s | 2 | 8/9 |

Free models are shared and rate-limited, so latency varies run to run; OpenRouter picks from each fallback list, and the model that actually served each call is listed per case.

## 1. sprint-planning

### Sprint planning

*Why this case:* The bread-and-butter case: clear owners, due dates and one explicit decision.

Audio 66.9 s · 4 chunks · transcription by `local:onnx-community/whisper-base.en` · notes by `nvidia/nemotron-3-super-120b-a12b:free` · ask by `qwen/qwen3.8-27b:free`

<details><summary>Script (what was said)</summary>

- **Maya:** Morning everyone. The goal today is to lock the scope for the next two week sprint.
- **Jordan:** The calendar sync bug is still our top issue. Customers see duplicate events after they reconnect Google Calendar.
- **Maya:** Then that goes first. Jordan, can you own the fix?
- **Jordan:** Yes. I will have a fix ready for review by Wednesday.
- **Priya:** The new onboarding checklist designs are done. I can hand off the final specs tomorrow.
- **Maya:** Great. We decided to push the dark mode work to next sprint, because the sync bug matters more.
- **Jordan:** Agreed. I also want to add an alert when sync failures spike, so we catch this earlier next time.
- **Maya:** Good idea, take that as well. I will update the roadmap and tell support about the timeline today.
- **Priya:** One risk. The checklist needs copy from marketing, and they have not sent it yet.
- **Maya:** I will ask marketing for the copy by Thursday. Okay, that is the plan. Thanks all.

</details>

<details><summary>Transcript (what the model heard)</summary>

- `0:00` Morning everyone. The goal today is to lock the scope for the next two weeks sprint.
- `0:06` The calendar sync bug is still our top issue. Customers see duplicate events after they reconnect Google Calendar.
- `0:14` Then that goes first. Jordan, can you own the fix?
- `0:20` Yes, I will have a fix ready for review by Wednesday.
- `0:25` The new onboarding checklist designs are done.
- `0:27` I can hand off the final specs tomorrow.
- `0:30` Great.
- `0:31` We decided to push the dark mode work to next sprint, because the sink bug matters more.
- `0:37` Agreed.
- `0:39` I also want to make a difference between the two.
- `0:40` to add an alert when sync failures spike, so we catch this earlier next time.
- `0:46` Good idea, take that as well. I will update the roadmap and tell support about the timeline
- `0:52` today. One risk. The checklist needs copy from marketing, and they have not sent it yet.
- `0:58` I will ask Marc to
- `1:00` marketing for the copy by Thursday.
- `1:02` Okay, that is the plan.
- `1:05` Thanks all.

</details>

**Title:** analysis

**Summary:** The team locked scope for the upcoming two‑week sprint, prioritized the calendar sync bug, assigned Jordan to fix it, planned to hand off onboarding checklist specs, decided to defer dark‑mode work, agreed to add a sync‑failure alert, and noted a risk that marketing copy for the checklist is pending.

**Decisions:** 
- Lock scope for the next two weeks sprint
- Push dark mode work to next sprint

**Action items**

| Task | Owner | Due | At |
|---|---|---|---|
| Fix calendar sync bug causing duplicate events after reconnecting Google Calendar | Jordan | Wednesday | 0:20 |
| Hand off final specs for onboarding checklist | — | tomorrow | 0:27 |
| Add alert for sync failures spike | — | — | 0:40 |
| Update roadmap and inform support about timeline | — | today | 0:46 |
| Onboarding checklist awaits copy from marketing, which has not been sent yet | — | — | 0:52 |
| Request marketing copy for onboarding checklist from Marc | — | Thursday | 1:00 |

**Ask:** When will the calendar sync fix be ready for review?

> The fix will be ready for review by Wednesday [1].

> [1] *analysis* @ 0:20: "Yes, I will have a fix ready for review by Wednesday."

**Checks**

- ✅ Notes generated
- ✅ Transcript word error rate ≤ 20% — 7.1%
- ✅ Task captured: "sync" — "Fix calendar sync bug causing duplicate events after reconnecting Google Calendar"
- ✅ Owner attributed: Jordan — owner: Jordan
- ✅ Task captured: "spec" — "Hand off final specs for onboarding checklist"
- ❌ Owner attributed: Priya — owner: null
- ✅ Task captured: "marketing" — "Onboarding checklist awaits copy from marketing, which has not been sent yet"
- ❌ Owner attributed: Maya — owner: null
- ✅ No duplicate action items — 6 items
- ✅ Decision about "dark mode" — "Push dark mode work to next sprint"
- ✅ Owners are people from the meeting
- ✅ Ask: "When will the calendar sync fix be ready for review?" — answer mentions wednesday; cites this meeting

Timing: uploads + processing 50.4 s, notes ready 50.3 s after "stop"; 6 model calls (transcribe 4.1 s, transcribe 3.7 s, transcribe 3.3 s, transcribe 1.4 s, notes 37.1 s, answer 3.1 s).

## 2. customer-discovery

### Customer discovery call

*Why this case:* Next steps split across two companies, a hard requirement, and a conditional (not yet decided) pilot.

Audio 67.8 s · 4 chunks · transcription by `local:onnx-community/whisper-base.en` · notes by `nex-agi/nex-n2.5-mini:free` · ask by `nvidia/nemotron-3-ultra-550b-a55b:free`

<details><summary>Script (what was said)</summary>

- **Sam:** Thanks for joining, Dana. What made you start looking for a meeting notes tool?
- **Dana:** Our support team runs about forty customer calls a day, and nobody has time to write notes. Important details get lost.
- **Sam:** What happens today when a customer reports a bug on a call?
- **Dana:** The agent types a quick summary into Zendesk, but half the time the steps to reproduce are missing.
- **Sam:** So the key requirement is getting bug details and action items into Zendesk automatically.
- **Dana:** Exactly. And all of our data must stay in the European Union. That is a hard requirement from our legal team.
- **Sam:** Understood. We do not have a European region yet, but it is on our roadmap. I will confirm the date with our engineers and email you by Friday.
- **Dana:** Please do. If data residency works out, we would want a pilot with ten agents next month.
- **Sam:** Great. I will also send over our security questionnaire today.
- **Dana:** Perfect. I will bring Marco from our legal team to the next call.

</details>

<details><summary>Transcript (what the model heard)</summary>

- `0:00` Thanks for joining, Dana. What made you start looking for a meeting notes tool?
- `0:05` Our support team runs about 40 customer calls a day, and nobody has time to write notes.
- `0:12` Important details get lost.
- `0:15` What happens today when a customer reports a bug on a call?
- `0:19` The agent types.
- `0:20` a quick summary into Zendisk, but half the time the steps to reproduce are missing.
- `0:26` So the key requirement is getting bug details and action items into Zendisk automatically.
- `0:31` Exactly.
- `0:33` And all of our data must stay in the European Union.
- `0:37` That is a hard requirement from our legal team.
- `0:40` Understood. We do not have a European region yet, but it is on our roadmap.
- `0:45` I will confirm the date with our engineers and email you by Friday.
- `0:49` Please do. If data residency works out, we would want a pilot with 10 agents next month.
- `0:57` Great. I will also send over our security questions.
- `1:00` questionnaire today.
- `1:01` Perfect.
- `1:02` I will bring Marco from our legal team to the next call.

</details>

**Title:** Meeting notes with Dana

**Summary:** Dana's support team handles about 40 customer calls per day and needs bug details and action items captured automatically in Zendesk. EU data residency is a hard requirement; the vendor does not have a European region yet but is exploring one.

**Decisions:** 
- Zendesk must automatically capture bug details and action items.
- All data must remain in the European Union.
- Dana wants a pilot with 10 agents next month if data residency works.

**Action items**

| Task | Owner | Due | At |
|---|---|---|---|
| Confirm the European region date with engineers and email Dana. | — | Friday | — |
| Send the security questionnaire. | — | today | — |
| Bring Marco from the legal team to the next call. | Dana | — | — |

**Ask:** What is Dana's hard requirement for data?

> Dana's hard requirement is that all data must stay in the European Union (data residency) [5][1][8].

> [1] *Meeting notes with Dana* @ 0:37: "That is a hard requirement from our legal team."
> [5] *Meeting notes with Dana* @ 0:33: "And all of our data must stay in the European Union."
> [8] *Meeting notes with Dana* @ 0:49: "Please do. If data residency works out, we would want a pilot with 10 agents next month."

**Checks**

- ✅ Notes generated
- ✅ Transcript word error rate ≤ 20% — 3.0%
- ✅ Task captured: "friday" — "Confirm the European region date with engineers and email Dana."
- ❌ Owner attributed: Sam — owner: null
- ✅ Task captured: "security" — "Send the security questionnaire."
- ❌ Owner attributed: Sam — owner: null
- ✅ Task captured: "marco" — "Bring Marco from the legal team to the next call."
- ✅ Owner attributed: Dana — owner: Dana
- ✅ No duplicate action items — 3 items
- ✅ Owners are people from the meeting
- ✅ Ask: "What is Dana's hard requirement for data?" — answer mentions european; cites this meeting

Timing: uploads + processing 28.1 s, notes ready 26.9 s after "stop"; 6 model calls (transcribe 3.4 s, transcribe 2.6 s, transcribe 3.0 s, transcribe 1.3 s, notes 17.3 s, answer 8.2 s).

## 3. incident-postmortem

### Incident postmortem

*Why this case:* Dense facts (duration, root cause, impact) that search and Ask must retrieve precisely.

Audio 77.2 s · 4 chunks · transcription by `local:onnx-community/whisper-base.en` · notes by `dots-studio/dots-3-note-preview:free` · ask by `nvidia/nemotron-3-super-120b-a12b:free`, `poolside/laguna-s-2.1:free`

<details><summary>Script (what was said)</summary>

- **Alex:** This is the postmortem for Tuesday's outage. Transcription was down for forty seven minutes, from two ten to two fifty seven in the afternoon.
- **Alex:** The root cause was an expired API key for our speech provider. Requests started failing and our retries made the queue back up.
- **Jordan:** We had no alert on the error rate from the provider, so we only found out when customers wrote in.
- **Maya:** How many customers were affected?
- **Alex:** About three hundred meetings had no transcript. We reprocessed all of them by five o clock, so no data was lost.
- **Jordan:** I will add an alert that fires when provider errors go above five percent for two minutes. I can ship that by Friday.
- **Alex:** I will move the API keys into the secret manager with expiry reminders, by the end of next week.
- **Maya:** And I will write the customer update and post it on the status page today.
- **Alex:** We agreed that retries need a circuit breaker, so a dead provider does not flood the queue. Jordan, can you scope that?
- **Jordan:** Yes, I will write a short design doc for the circuit breaker next week.

</details>

<details><summary>Transcript (what the model heard)</summary>

- `0:00` This is the postmortem for Tuesday's outage.
- `0:03` Transcription was down for 47 minutes, from 210 to 257 in the afternoon.
- `0:11` The root cause was an expired API key for our speech provider.
- `0:16` Requests started failing and our retries made the queue back up.
- `0:20` We had no alert on the error rate from the provider, so we only found out when customers wrote in.
- `0:27` How many customers were affected?
- `0:30` About 300 meetings had no transcript.
- `0:34` We reprocessed all of them by 5 o'clock, so no data was lost.
- `0:40` I will add an alert that fires when provider errors go above 5% for two minutes.
- `0:46` I can ship that by Friday.
- `0:48` I will move the API keys into the secret manager with expiry reminders, by the end of next week.
- `0:56` And I will write the customer update and post it on the status page.
- `1:00` page today.
- `1:02` We agreed that retries need a circuit breaker, so a dead provider does not flood the queue.
- `1:08` Jordan, can you scope that?
- `1:11` Yes, I will write a short design doc for the circuit breaker next week.

</details>

**Title:** Postmortem for Tuesday's Outage

**Summary:** The postmortem for Tuesday's outage identified an expired API key for the speech provider as the root cause, affecting 300 meetings for 47 minutes. Actions were assigned to add provider error alerts, migrate API keys to a secret manager, notify affected customers, and scope a circuit breaker for retries.

**Decisions:** 
- Retries need a circuit breaker so a dead provider does not flood the queue.

**Action items**

| Task | Owner | Due | At |
|---|---|---|---|
| Add an alert that fires when provider errors go above 5% for two minutes. | — | Friday | 0:40 |
| Move the API keys into the secret manager with expiry reminders. | — | end of next week | 0:48 |
| Write the customer update and post it on the status page. | — | today | 0:56 |
| Write a short design doc for the circuit breaker. | Jordan | next week | 1:11 |

**Ask:** What caused Tuesday's transcription outage?

> The outage was caused by an expired API key for the speech provider. [3]

> [3] *Postmortem for Tuesday's Outage* @ 0:11: "The root cause was an expired API key for our speech provider."

**Ask:** How long was transcription down?

> Transcription was down for 47 minutes [1].

> [1] *Postmortem for Tuesday's Outage* @ 0:03: "Transcription was down for 47 minutes, from 210 to 257 in the afternoon."

**Checks**

- ✅ Notes generated
- ✅ Transcript word error rate ≤ 20% — 7.0%
- ✅ Task captured: "alert" — "Add an alert that fires when provider errors go above 5% for two minutes."
- ❌ Owner attributed: Jordan — owner: null
- ✅ Task captured: "secret" — "Move the API keys into the secret manager with expiry reminders."
- ❌ Owner attributed: Alex — owner: null
- ✅ Task captured: "status" — "Write the customer update and post it on the status page."
- ❌ Owner attributed: Maya — owner: null
- ✅ Task captured: "circuit" — "Write a short design doc for the circuit breaker."
- ✅ Owner attributed: Jordan — owner: Jordan
- ✅ No duplicate action items — 4 items
- ✅ Decision about "circuit breaker" — "Retries need a circuit breaker so a dead provider does not flood the queue."
- ✅ Owners are people from the meeting
- ✅ Ask: "What caused Tuesday's transcription outage?" — answer mentions expired; cites this meeting
- ✅ Ask: "How long was transcription down?" — answer mentions 47; cites this meeting

Timing: uploads + processing 27.4 s, notes ready 26.2 s after "stop"; 7 model calls (transcribe 2.4 s, transcribe 2.4 s, transcribe 2.6 s, transcribe 2.2 s, notes 17.8 s, answer 1.6 s, answer 12.8 s).

## 4. hiring-debrief

### Hiring debrief (no decision)

*Why this case:* Faithfulness test: mixed opinions and an explicit "no decision today". Notes must not invent a hire/reject decision or extra owners.

Audio 45.1 s · 3 chunks · transcription by `local:onnx-community/whisper-base.en` · notes by `dots-studio/dots-3-note-preview:free` · ask by `nvidia/nemotron-3-super-120b-a12b:free`

<details><summary>Script (what was said)</summary>

- **Priya:** Let's debrief on the frontend candidate we interviewed yesterday.
- **Jordan:** Strong on React and performance. The system design answer was a bit shallow though.
- **Priya:** I agree on the design part. Her product sense was great. She asked sharp questions about our onboarding.
- **Maya:** I am not sure yet. The take home project was clean, but I did not see much testing.
- **Jordan:** That is fair. Maybe we ask about testing in a follow up call instead of rejecting her.
- **Priya:** I would lean yes, but I do not want to decide without hearing from Sam, who ran the culture interview.
- **Maya:** Okay. No decision today. I will ask Sam to send his notes, and we will meet again on Monday.

</details>

<details><summary>Transcript (what the model heard)</summary>

- `0:00` Let's debrief on the front end candidate we interviewed yesterday.
- `0:04` Strong on react and performance.
- `0:06` The system design answer was a bit shallow though.
- `0:10` I agree on the design part.
- `0:12` Her product sense was great.
- `0:14` She asked sharp questions about our onboarding.
- `0:17` I am not sure yet.
- `0:19` The take home product.
- `0:20` The project was clean, but I did not see much testing.
- `0:24` That is fair.
- `0:26` Maybe we ask about testing in a follow-up call instead of rejecting her.
- `0:31` I would lean yes, but I do not want to decide without hearing from Sam, who ran the Culture
- `0:35` interview.
- `0:37` Okay.
- `0:38` No decision today.
- `0:40` I will ask Sam to send his notes, and we will meet again on Monday.

</details>

**Title:** Debrief on Front-End Candidate Interview

**Summary:** The team debriefed on yesterday's front-end candidate interview. The candidate showed strong React and performance skills, great product sense, and asked sharp questions about onboarding. However, their system design answer was shallow, and their take-home project lacked testing. The team agreed to conduct a follow-up call to address the testing concern rather than rejecting the candidate. A final hiring decision is postponed until they receive feedback from Sam's culture interview, with a follow-up meeting scheduled for Monday.

**Decisions:** 
- No decision today on hiring the candidate; the team wants to hear from Sam regarding the culture interview first.
- Instead of rejecting the candidate, the team will ask about testing in a follow-up call.

**Action items**

| Task | Owner | Due | At |
|---|---|---|---|
| Ask Sam to send his notes from the culture interview. | — | — | — |
| Schedule a follow-up call with the candidate to discuss testing in the take-home project instead of rejecting her. | — | — | — |
| Meet again on Monday to make a final decision after receiving Sam's notes. | — | Monday | — |

**Ask:** What concerns came up about the frontend candidate?

> The team was unsure about the candidate’s testing knowledge and considered either asking about testing in a follow‑up call or rejecting her. [3] (and the debrief context in [1]).

> [1] *Debrief on Front-End Candidate Interview* @ 0:00: "Let's debrief on the front end candidate we interviewed yesterday."
> [3] *Debrief on Front-End Candidate Interview* @ 0:26: "Maybe we ask about testing in a follow-up call instead of rejecting her."

**Checks**

- ✅ Notes generated
- ✅ Transcript word error rate ≤ 20% — 3.4%
- ✅ Task captured: "sam" — "Ask Sam to send his notes from the culture interview."
- ❌ Owner attributed: Maya — owner: null
- ✅ No duplicate action items — 3 items
- ✅ No invented hire/reject decision — 2 decision(s) recorded
- ✅ Owners are people from the meeting
- ✅ Ask: "What concerns came up about the frontend candidate?" — answer mentions testing; cites this meeting

Timing: uploads + processing 42.4 s, notes ready 41.4 s after "stop"; 5 model calls (transcribe 2.8 s, transcribe 2.7 s, transcribe 1.3 s, notes 34.5 s, answer 12.5 s).

## 5. late-start-standup

### Late start: 25 s of silence, then a standup

*Why this case:* Someone forgot to unmute. The silent first chunk must be skipped without an API call, and timestamps must still line up with when people actually spoke.

Audio 46.0 s · 3 chunks · transcription by `local:onnx-community/whisper-base.en` · notes by `dots-studio/dots-3-note-preview:free` · ask by `poolside/laguna-s-2.1:free`

<details><summary>Script (what was said)</summary>

- **Sam:** Sorry, I was on mute. Quick update from me.
- **Sam:** Yesterday I finished the Zendesk integration prototype. Today I am testing it with real tickets.
- **Alex:** I am blocked on the staging database migration. I need Jordan to review the migration script.
- **Jordan:** I will review it right after this call.

</details>

<details><summary>Transcript (what the model heard)</summary>

- `0:20` Sorry, I was unmute.
- `0:27` Quick update from me.
- `0:29` Yesterday I finished the Zendesk integration prototype.
- `0:32` Today I am testing it with real tickets.
- `0:35` I am blocked on the staging database migration.
- `0:38` I need Jordan to remove it.
- `0:40` Review the migration script.
- `0:43` I will review it right after this call.

</details>

**Title:** Zendesk Integration Prototype Update

**Summary:** The speaker provides an update on the Zendesk integration prototype, which is currently being tested with real tickets. They are blocked by the staging database migration and need Jordan to remove it. The speaker will review the migration script right after the call.

**Decisions:** _none recorded_

**Action items**

| Task | Owner | Due | At |
|---|---|---|---|
| Remove the staging database migration | Jordan | — | — |
| Review the migration script | — | — | — |

**Ask:** Who is blocked in the standup, and on what?

> The speaker is blocked on the staging database migration [1].

> [1] *Zendesk Integration Prototype Update* @ 0:35: "I am blocked on the staging database migration."

**Checks**

- ✅ Notes generated
- ✅ Transcript word error rate ≤ 20% — 8.3%
- ✅ Task captured: "review" — "Review the migration script"
- ❌ Owner attributed: Jordan — owner: null
- ✅ No duplicate action items — 2 items
- ✅ Owners are people from the meeting
- ✅ Transcript starts after the 25 s of silence — first line at 0:20
- ✅ Silent chunk skipped without an API call — 1 chunk(s) skipped
- ✅ Ask: "Who is blocked in the standup, and on what?" — answer mentions migration; cites this meeting

Timing: uploads + processing 19.2 s, notes ready 17.7 s after "stop"; 4 model calls (transcribe 3.4 s, transcribe 1.6 s, notes 13.9 s, answer 2.3 s).
