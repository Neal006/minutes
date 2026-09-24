# End-to-end tests

```bash
npx playwright install chromium   # once
npm run e2e                       # builds the web app, downloads Obscura, runs everything
npm run e2e:obscura               # only the user-behavior flows
npx playwright show-report e2e/report
```

Playwright starts two servers for the run:

- **The app** on `:3100` with a fresh temp data dir, the seeded demo meetings, and `AI_PROVIDER=mock`
  (deterministic, offline). A non-WAV chunk is read as text, so a test can script a transcript
  through the real upload API: `createMeeting(request, ['line one', "I'll do the thing"])`.
- **[Obscura](https://github.com/h4ckf0r0day/obscura)** v0.2.3 on `:9333`, a Rust headless browser that
  speaks the Chrome DevTools Protocol. `scripts/get-obscura.mjs` downloads the right build. It runs
  with `--allow-private-network`, because by default it refuses to load localhost (SSRF guard).

| Project | Browser | What it covers |
|---|---|---|
| `obscura` | Obscura via `chromium.connectOverCDP` | 11 user flows: browse → read notes, search → jump to the moment, no-results → Ask, Ask → follow a citation, "nothing relevant" answers, rename (Escape/Enter), two-step delete with timeout, process an interrupted recording, failed notes → Try again, unknown meeting, XSS-safe rendering |
| `chromium` | Chromium with a fake microphone | Recording end to end (WAV chunk uploads, live banner, notes), upload retry after network failures, denied microphone, the `/` shortcut, action-item checkbox + rollback on server error |

## What Obscura 0.2.3 can't do (and where it's covered instead)

Found while building this suite; each gap is covered in Chromium rather than skipped.

| Gap in Obscura | Effect | Covered by |
|---|---|---|
| No `getUserMedia` / `MediaRecorder` / media playback (documented) | Can't record | `recording.spec.ts` in Chromium |
| Clicking an `<a>` doesn't navigate by default, and `location.hash = …` is a no-op; `location.href = …` works (as a full navigation) | Hash links did nothing | The app routes in-app link clicks itself (`interceptInternalLinks`, the same pattern as react-router's `<Link>`) and navigates with `location.href`. It behaves the same in real browsers |
| `keydown.preventDefault()` doesn't stop the character from being typed | Pressing `/` typed a slash into the search box | `interactions.spec.ts` ("/" shortcut) |
| Toggling a checkbox fires native `click`/`input`/`change`, but React's `onChange` never runs (React's value tracker sees no change) | Couldn't tick an action item | `interactions.spec.ts` (checkbox + rollback) |
