# Case studies: five meetings through the real pipeline

Run on 2026-09-24 with **OpenRouter free models only** (notes/ask: openrouter, transcription: local). Each meeting was synthesized with the built-in Windows voices, split into 20-second 16 kHz WAV chunks, and uploaded through the same HTTP API the browser recorder uses. Nothing is mocked. Reproduce with `npm run case-studies`.

**25 / 38 checks passed.**

| # | Case | Audio | Chunks (skipped silent) | Transcript WER | Notes ready after stop | Action items | Checks |
|---|---|---|---|---|---|---|---|
| 1 | [Sprint planning](#1-sprint-planning) | 67 s | 4 (0) | 7.1% | 73.8 s | 5 | 5/8 |
| 2 | [Customer discovery call](#2-customer-discovery) | 68 s | 4 (0) | 3.0% | 51.4 s | 32 | 4/7 |
| 3 | [Incident postmortem](#3-incident-postmortem) | 77 s | 4 (0) | 7.0% | 47.0 s | 4 | 6/10 |
| 4 | [Hiring debrief (no decision)](#4-hiring-debrief) | 45 s | 3 (0) | 3.4% | 26.8 s | 32 | 4/6 |
| 5 | [Late start: 25 s of silence, then a standup](#5-late-start-standup) | 46 s | 3 (1) | 8.3% | 7.3 s | 2 | 6/7 |

Free models are shared and rate-limited, so latency varies run to run; OpenRouter picks from each fallback list, and the model that actually served each call is listed per case.

## 1. sprint-planning

### Sprint planning

*Why this case:* The bread-and-butter case: clear owners, due dates and one explicit decision.

Audio 66.9 s · 4 chunks · transcription by `local:onnx-community/whisper-base.en` · notes by `nvidia/nemotron-3-super-120b-a12b:free` · ask by `poolside/laguna-xs-2.1:free`

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

**Title:** Sprint Planning Meeting

**Summary:** Locked scope for the next two‑week sprint, prioritized the calendar sync bug, deferred dark‑mode work, and agreed on follow‑up actions for onboarding checklist and sync‑failure alerts.

**Decisions:** 
- Calendar sync bug is the top issue and will be addressed first.
- Dark‑mode work will be pushed to the next sprint.
- Add an alert for sync‑failure spikes to catch issues earlier.

**Action items**

| Task | Owner | Due | At |
|---|---|---|---|
| Fix calendar sync bug | Jordan | Wednesday | 0:20 |
| Hand off final onboarding checklist specs | — | tomorrow | 0:27 |
| Add alert for sync‑failure spikes | — | — | 0:40 |
| Update roadmap and inform support about timeline | — | today | 0:46 |
| Request marketing copy for onboarding checklist from Marc | — | Thursday | 0:58 |

**Ask:** When will the calendar sync fix be ready for review?

> The calendar sync fix will be ready for review by Wednesday [1].

> [1] *Sprint Planning Meeting* @ 0:20: "Yes, I will have a fix ready for review by Wednesday."

**Checks**

- ✅ Notes generated
- ✅ Transcript word error rate ≤ 20% — 7.1%
- ✅ Action item for Jordan about "sync" — "Fix calendar sync bug"
- ❌ Action item for Priya about "spec" — not found
- ❌ Action item for Maya about "marketing" — not found
- ❌ Decision about "dark mode" — not found
- ✅ Owners are people from the meeting
- ✅ Ask: "When will the calendar sync fix be ready for review?" — answer mentions wednesday; cites this meeting

Timing: uploads + processing 73.9 s, notes ready 73.8 s after "stop"; 7 model calls (transcribe 3.8 s, transcribe 3.4 s, transcribe 3.3 s, transcribe 1.3 s, notes 42.1 s, notes 19.3 s, answer 2.1 s).

## 2. customer-discovery

### Customer discovery call

*Why this case:* Next steps split across two companies, a hard requirement, and a conditional (not yet decided) pilot.

Audio 67.8 s · 4 chunks · transcription by `local:onnx-community/whisper-base.en` · notes by `poolside/laguna-s-2.1:free`, `nvidia/nemotron-3-super-120b-a12b:free` · ask by `nex-agi/nex-n2.5-mini:free`

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

**Title:** Discussion on Meeting Notes Tool for Support Team

**Summary:** Dana's support team handles 40 customer calls daily and lacks time for manual notes, causing important details like bug reproduction steps to be lost. They need a meeting notes tool that automatically captures bug details and action items into Zendesk. A hard requirement is that all data must remain in the European Union. The vendor does not currently have a European region but plans to add one. The vendor will confirm the EU region launch date with engineers and email Dana by Friday. If data residency is resolved, Dana wants a pilot with 10 agents next month. The vendor will also send a security questionnaire today, and Dana will bring Marco from legal to the next call.

**Decisions:** 
- Proceed with a pilot of 10 agents next month if EU data residency requirement is met
- Vendor will confirm European region launch date and email Dana by Friday

**Action items**

| Task | Owner | Due | At |
|---|---|---|---|
| Confirm European region launch date with engineers and email Dana by Friday | Vendor | Friday | — |
| Send security questionnaire to Dana | Vendor | Today | — |
| Bring Marco from legal team to the next call | Dana | — | — |
| Proceed with pilot of 10 agents next month if EU region is available | Dana | — | — |
| Confirm EU region launch date | Vendor | Friday | — |
| Send security questionnaire | Vendor | Today | — |
| Bring Marco from legal to next call | Dana | — | — |
| Pilot with 10 agents next month | Dana | — | — |
| Confirm EU region launch date | Vendor | Friday | — |
| Send security questionnaire | Vendor | Today | — |
| Bring Marco from legal to next call | Dana | — | — |
| Pilot with 10 agents next month | Dana | — | — |
| Confirm EU region launch date | Vendor | Friday | — |
| Send security questionnaire | Vendor | Today | — |
| Bring Marco from legal to next call | Dana | — | — |
| Pilot with 10 agents next month | Dana | — | — |
| Confirm EU region launch date | Vendor | Friday | — |
| Send security questionnaire | Vendor | Today | — |
| Bring Marco from legal to next call | Dana | — | — |
| Pilot with 10 agents next month | Dana | — | — |
| Confirm EU region launch date | Vendor | Friday | — |
| Send security questionnaire | Vendor | Today | — |
| Bring Marco from legal to next call | Dana | — | — |
| Pilot with 10 agents next month | Dana | — | — |
| Confirm EU region launch date | Vendor | Friday | — |
| Send security questionnaire | Vendor | Today | — |
| Bring Marco from legal to next call | Dana | — | — |
| Pilot with 10 agents next month | Dana | — | — |
| Confirm EU region launch date | Vendor | Friday | — |
| Send security questionnaire | Vendor | Today | — |
| Bring Marco from legal to next call | Dana | — | — |
| Pilot with 10 agents next month | Dana | — | — |

**Ask:** What is Dana's hard requirement for data?

> All data must stay in the European Union. [1][5]

> [1] *Discussion on Meeting Notes Tool for Support Team* @ 0:37: "That is a hard requirement from our legal team."
> [5] *Discussion on Meeting Notes Tool for Support Team* @ 0:33: "And all of our data must stay in the European Union."

**Checks**

- ✅ Notes generated
- ✅ Transcript word error rate ≤ 20% — 3.0%
- ❌ Action item for Sam about "friday" — not found
- ❌ Action item for Sam about "security" — not found
- ✅ Action item for Dana about "marco" — "Bring Marco from legal team to the next call"
- ❌ Owners are people from the meeting — Vendor, Vendor, Vendor, Vendor, Vendor, Vendor, Vendor, Vendor, Vendor, Vendor, Vendor, Vendor, Vendor, Vendor, Vendor, Vendor
- ✅ Ask: "What is Dana's hard requirement for data?" — answer mentions european; cites this meeting

Timing: uploads + processing 52.6 s, notes ready 51.4 s after "stop"; 7 model calls (transcribe 3.0 s, transcribe 2.5 s, transcribe 2.5 s, transcribe 1.2 s, notes 13.2 s, notes 29.8 s, answer 1.9 s).

## 3. incident-postmortem

### Incident postmortem

*Why this case:* Dense facts (duration, root cause, impact) that search and Ask must retrieve precisely.

Audio 77.2 s · 4 chunks · transcription by `local:onnx-community/whisper-base.en` · notes by `nvidia/nemotron-3-super-120b-a12b:free` · ask by `nex-agi/nex-n2.5-mini:free`

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

**Title:** postmortem.json

**Summary:** Tuesday's outage caused transcription service downtime for 47 minutes due to an expired API key; lack of alerting delayed detection until customers reported; about 300 meetings lost transcripts, which were reprocessed by 5 PM with no data loss.

**Decisions:** 
- Retries need a circuit breaker to prevent a dead provider from flooding the queue.

**Action items**

| Task | Owner | Due | At |
|---|---|---|---|
| Add alert that fires when provider errors go above 5% for two minutes. | Speaker | Friday | 0:40 |
| Move API keys into the secret manager with expiry reminders. | Speaker | End of next week | 0:48 |
| Write the customer update and post it on the status page. | Speaker | Today | 0:56 |
| Write a short design doc for the circuit breaker. | Jordan | Next week | 1:11 |

**Ask:** What caused Tuesday's transcription outage?

> Tuesday’s transcription outage was caused by an expired API key for the speech provider. [1][3]

> [1] *postmortem.json* @ 0:00: "This is the postmortem for Tuesday's outage."
> [3] *postmortem.json* @ 0:11: "The root cause was an expired API key for our speech provider."

**Ask:** How long was transcription down?

> Transcription was down for 47 minutes. [1]

> [1] *postmortem.json* @ 0:03: "Transcription was down for 47 minutes, from 210 to 257 in the afternoon."

**Checks**

- ✅ Notes generated
- ✅ Transcript word error rate ≤ 20% — 7.0%
- ❌ Action item for Jordan about "alert" — not found
- ❌ Action item for Alex about "secret" — not found
- ❌ Action item for Maya about "status" — not found
- ✅ Action item for Jordan about "circuit" — "Write a short design doc for the circuit breaker."
- ✅ Decision about "circuit breaker" — "Retries need a circuit breaker to prevent a dead provider from flooding the queue."
- ❌ Owners are people from the meeting — Speaker, Speaker, Speaker
- ✅ Ask: "What caused Tuesday's transcription outage?" — answer mentions expired; cites this meeting
- ✅ Ask: "How long was transcription down?" — answer mentions 47; cites this meeting

Timing: uploads + processing 48.2 s, notes ready 47.0 s after "stop"; 7 model calls (transcribe 2.2 s, transcribe 2.2 s, transcribe 2.4 s, transcribe 2.0 s, notes 39.0 s, answer 3.1 s, answer 1.2 s).

## 4. hiring-debrief

### Hiring debrief (no decision)

*Why this case:* Faithfulness test: mixed opinions and an explicit "no decision today". Notes must not invent a hire/reject decision or extra owners.

Audio 45.1 s · 3 chunks · transcription by `local:onnx-community/whisper-base.en` · notes by `nvidia/nemotron-3-super-120b-a12b:free` · ask by `nex-agi/nex-n2.5-mini:free`

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

**Title:** Front-end Candidate Debrief

**Summary:** The team discussed the front-end candidate interviewed yesterday, highlighting strong React and performance skills, good product sense, and sharp questions about onboarding, but noted a shallow system design answer and limited testing in the take-home project. They lean toward hiring but want to wait for Sam's culture interview notes before deciding, and agreed to reconvene on Monday after receiving those notes.

**Decisions:** 
- No hiring decision made today.

**Action items**

| Task | Owner | Due | At |
|---|---|---|---|
| Ask Sam to send his notes from the Culture interview. | Unspecified (likely the speaker who will ask Sam) | Before Monday meeting | — |
| Schedule a follow-up meeting for Monday to reconvene after Sam's notes are received. | Unspecified | Monday | — |
| Consider arranging a follow-up call with the candidate to discuss testing experience. | Unspecified | TBD | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |
| Will ask Sam to send his notes, and we will meet again on Monday. | — | — | — |
| No decision today. | — | — | — |

**Ask:** What concerns came up about the frontend candidate?

> The only stated concern was her testing approach: they suggested asking about testing in a follow-up call rather than rejecting her [1][3].

> [1] *Front-end Candidate Debrief* @ 0:00: "Let's debrief on the front end candidate we interviewed yesterday."
> [3] *Front-end Candidate Debrief* @ 0:26: "Maybe we ask about testing in a follow-up call instead of rejecting her."

**Checks**

- ✅ Notes generated
- ✅ Transcript word error rate ≤ 20% — 3.4%
- ❌ Action item for Maya about "sam" — not found
- ✅ No invented hire/reject decision — 1 decision(s) recorded
- ❌ Owners are people from the meeting — Unspecified, Unspecified
- ✅ Ask: "What concerns came up about the frontend candidate?" — answer mentions testing; cites this meeting

Timing: uploads + processing 27.7 s, notes ready 26.8 s after "stop"; 5 model calls (transcribe 2.7 s, transcribe 2.6 s, transcribe 1.1 s, notes 20.7 s, answer 2.2 s).

## 5. late-start-standup

### Late start: 25 s of silence, then a standup

*Why this case:* Someone forgot to unmute. The silent first chunk must be skipped without an API call, and timestamps must still line up with when people actually spoke.

Audio 46.0 s · 3 chunks · transcription by `local:onnx-community/whisper-base.en` · notes by `nex-agi/nex-n2.5-mini:free` · ask by `inclusionai/ling-3.0-flash-sante:free`

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

**Title:** Zendesk Integration Update

**Summary:** The Zendesk integration prototype was finished yesterday. The speaker is testing it with real tickets today but is blocked by the staging database migration.

**Decisions:** _none recorded_

**Action items**

| Task | Owner | Due | At |
|---|---|---|---|
| Remove the staging database migration. | Jordan | — | — |
| Review the migration script right after this call. | — | — | — |

**Ask:** Who is blocked in the standup, and on what?

> The speaker's name isn't provided in the excerpt, but they are blocked on the staging database migration [1].

> [1] *Zendesk Integration Update* @ 0:35: "I am blocked on the staging database migration."

**Checks**

- ✅ Notes generated
- ✅ Transcript word error rate ≤ 20% — 8.3%
- ❌ Action item for Jordan about "review" — not found
- ✅ Owners are people from the meeting
- ✅ Transcript starts after the 25 s of silence — first line at 0:20
- ✅ Silent chunk skipped without an API call — 1 chunk(s) skipped
- ✅ Ask: "Who is blocked in the standup, and on what?" — answer mentions migration; cites this meeting

Timing: uploads + processing 8.0 s, notes ready 7.3 s after "stop"; 4 model calls (transcribe 2.2 s, transcribe 1.1 s, notes 4.6 s, answer 14.4 s).
