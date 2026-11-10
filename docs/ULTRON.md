# Ultron — audit and implementation report

What was audited in the codebase, what changed to turn it into Ultron, why each
change was made, and what could **not** be verified in the build environment.

Ultron starts from a **clean slate**: a fresh `Ultron` user-data directory, no
migration from any earlier install, and no dependency on the previous brand.

---

## 1. Audit findings

### Round 1 — baseline

| # | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| 1 | Product identity was not Ultron anywhere | `package.json`, `electron-builder.json5`, window title, tray, About, prompts, README | High (branding) |
| 2 | TTS credentials lived in a single slot | one `apiKey`/`voiceId`/`model` shared by every provider; switching overwrote them | **High (blocks a second provider)** |
| 3 | Config merge was only two levels deep | `merge()` replaced `tts.providers.*` wholesale on a partial save | High (correctness) |
| 4 | No microphone control in the widget | the only switch was in Settings | High (voice UX) |
| 5 | Auto-activation on window show | `useSTT` armed listening every time the tray/hotkey showed the window | Medium (surprising) |
| 6 | No persistent mic indicator | nothing showed capture state while the widget was collapsed | Medium (privacy/trust) |
| 7 | Audio format was binary | `tts:format` was `'mpeg' \| 'opus'`; a WAV provider would be mislabelled | Medium |
| 8 | No main-process typecheck, no tests | `tsconfig.node.json` was a stub; zero test files | Medium (regression risk) |
| 9 | 28 npm advisories | 1 critical (`protobufjs`), 15 high (`electron@29`, `@trpc@10.45`) | Tracked — see §7 |

### Round 2 — after the first build

| # | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| 10 | **Gemini TTS rejected every request** | Google returned a rejection for the Interactions payload; the UI only showed "rejected the request" | **Critical (feature dead)** |
| 11 | Wrong Interactions `input` shape | docs require `[{ type: 'user_input', content: [{ type: 'text', text }] }]`; the code sent `[{ type: 'text', text }]` | Root cause of #10 |
| 12 | SDK older than the endpoint requires | TTS docs require `@google/genai >= 2.24.0` for Interactions; the project ships `1.45.0` | Root cause of #10 |
| 13 | Raw Google errors were swallowed | `formatTTSError` mapped 400 to a generic sentence and logged only the wrapper | High (undebuggable) |
| 14 | Legacy-data migration contradicted a clean slate | startup probed old `Atlas`/`atlas` directories | Product decision |
| 15 | The mic button could become a dead control | `disabled` when unavailable, so it could not start capture or explain itself | Medium (UX) |
| 16 | API keys could not be inspected | password field with no reveal in Intelligence | Low (friction) |

---

## 2. What changed

### Branding and packaging

| Area | Change |
| --- | --- |
| `package.json` | `name: ultron`, Ultron-only description, `repository` → `BortKnox/ultron`, author `BortKnox`, `typecheck`/`test` scripts |
| `electron-builder.json5` | `productName: Ultron`, `appId: com.bortknox.ultron`, `executableName: ultron`, `artifactName: ultron-${version}`, NSIS shortcut `Ultron` |
| Window / tray / logs | Window title, tray tooltip and menu, session-log filenames and log prefixes all read Ultron |
| Prompts | The self-preservation rule lists the real process names (`ultron`, `atlas` for older builds, `electron`); renaming the executable without this could let the agent kill itself |
| Docs, templates, policies | README, CHANGELOG, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue templates |
| Icon | `scripts/generate-icons.py` renders original geometric art (graphite plate, segmented crimson ring, hexagon core) into `build/icon.png`, `icon.ico`, `tray.png`. No third-party character artwork |
| Colour | `@theme` tokens `--color-ultron-crimson*`, `--color-ultron-graphite-*`, `--color-ultron-silver`; `ui.accent` switches between the fixed Ultron crimson and the OS accent |
| Default persona | Displayed as **Ultron**. The id stays `atlas-default` because `activePersonaId` and per-persona prompt directories are keyed by it — a record id, not branding |

**Explicitly kept:** the upstream `LICENSE`, the single Apache-2.0 attribution
line on the About page and in the README footer, and the `contributors` entry
naming the original author. Those are licence obligations, not branding.

### Clean slate (finding 14)

There is **no migration code**. `app.setName('Ultron')` fixes the identity, and
Electron therefore reads and writes `…/Ultron` from the first launch. A previous
installation's directory is neither detected, copied nor consulted.

The config-shape migration in `utils/config/migration.ts` is unrelated and stays:
it upgrades *this app's own* config file from flat keys to the nested schema as
the schema evolves.

### Gemini TTS (findings 10–13)

`GeminiTTSProvider` was rewritten around the shape that actually answers:

1. **`generateContent` is the primary path** — `responseModalities: [AUDIO]`,
   `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`. Fully supported by
   the installed SDK, so no dependency bump was needed.
2. **Interactions remains as a fallback**, with the `user_input` wrapper fixed.
   It is used automatically for the 3.8 models, or when Google reports an
   endpoint mismatch, and every attempt is logged.
3. **The catalogue records each model's endpoint** (`GEMINI_TTS_MODELS[].api`),
   so the picker says which shape a model speaks. Default model is
   `gemini-2.5-flash-preview-tts`.
4. **Retired ids degrade instead of dying** — a 404 triggers at most two
   documented fallbacks, bounded and logged.
5. **Raw errors are printed** (`logRawGeminiError`): HTTP status, Google's
   `error.status`, `error.message` and `error.details` reach the terminal, and
   the provider's own words are appended to the user-facing message.
6. **Audio is labelled honestly** — WAV detected by magic bytes, headerless PCM
   wrapped at the rate in the MIME parameters, anything else rejected.

Details: [`docs/GEMINI-TTS.md`](GEMINI-TTS.md).

### Widget controls (findings 4–6, 15)

- Microphone, spoken responses and Settings sit under the orb.
- `micActive` is derived from the STT phase, so the button cannot claim to
  listen while capture is off; stopping releases the media tracks and context.
- The mic is **never a dead control**: when voice input is off in Settings it
  renders dormant but still starts capture on click (the shortest path), and its
  tooltip states the real reason it is idle.
- Capture is never restored on launch unless `stt.autoListen` is on; installs
  that had voice input enabled keep that behaviour through a one-time config
  migration.
- A Listening badge stays visible when the widget is collapsed.
- Failures surface as warnings with a specific cause: permission denied, no
  device, device busy, model not downloaded.

### Settings polish (finding 16)

- Intelligence → API key gained a Show/Hide toggle (matching Voice), plus
  `autocomplete="off"` and `spellcheck={false}`.
- Voice → Gemini failures show Google's message rather than a bare rejection,
  and the test result wraps instead of overflowing.
- The model dropdown hints the endpoint each model uses.

---

## 3. Verification

| Check | Result |
| --- | --- |
| `npm run lint` | Pass (0 errors) |
| `npm run typecheck` (renderer + `tsconfig.electron.json`) | Pass |
| `npm test` (vitest) | 62 tests, 5 files, pass |
| `npx vite build` | Pass |
| `node scripts/generate-icons.py` | Pass — 512² PNG, multi-size ICO, 32² tray |

**Not verified here:** no live Gemini request was made — that needs a real API
key, which is not in this environment. The payloads are unit-tested against the
documented shapes, and the first real call happens on your machine; the terminal
log will now show Google's exact answer if it fails.

The Electron UI was not launched either: this sandbox is headless Linux and the
app targets Windows, so window click-through, tray behaviour and audio playback
need a run on your machine.

---

## 4. Known issues not addressed

1. **Dependency advisories (28).** `protobufjs` (critical, via
   `google-auth-library`), `electron@29` and `@trpc@10.45.0` (high) need
   upgrades. That is a major Electron/TRPC bump plus a full runtime regression
   pass — a separate change from this one.
2. **Gemini TTS does not stream.** Playback starts after synthesis; the SSE
   variant is not exposed by the installed SDK.
3. **Alice voice/language is not configurable** — the client picks it.
4. **Legacy TTS keys remain in config** (`tts.apiKey`, `tts.voiceId`,
   `tts.model`). Deprecated and unused, kept so an older build does not lose
   credentials.
5. **The agent engine is untouched** — computer use, planning, memory, facts,
   search and prompts work exactly as before.
