# Ultron — fork audit and implementation report

This document records what was audited in the Atlas codebase, what was changed
to turn it into Ultron, why each change was made, and what could **not** be
verified in the build environment.

Scope: branding, widget interaction (microphone and voice output), Google
Gemini text-to-speech, and the verification pipeline. Game logic, the computer
use loop, personas, memory and search were left functionally untouched.

---

## 1. Audit findings (baseline)

| # | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| 1 | Product identity was Atlas everywhere | `package.json` name/description/repo, `productName`/`appId`/`artifactName` in `electron-builder.json5`, window title, tray labels, About page, prompts, README | High (branding) |
| 2 | Renaming the app would silently reset user data | `app.getPath('userData')` is derived from the app name; a rename points at a new, empty directory → config, personas, memory, facts, prompts and STT models lost | **High (data loss)** |
| 3 | TTS credentials lived in a single slot | `TTSConfig` had one `apiKey`/`voiceId`/`model` for whichever provider was active; switching providers overwrote them | **High (blocks a second provider)** |
| 4 | Config merge was only two levels deep | `merge()` in `utils/config/index.ts` merged nested groups one level; `tts.providers.*` would have been replaced wholesale on any partial save | High (correctness) |
| 5 | No microphone control in the widget | `MainView` started STT automatically when `stt.enabled` was true, and the only switch was in Settings | High (voice UX) |
| 6 | Auto-activation on window show | `useSTT` called `activateWithoutWakeWord()` every time the tray/hotkey showed the window, whether or not the user wanted to speak | Medium (surprising) |
| 7 | No persistent mic indicator | `ListeningIsland` only appears while a command is being dictated; nothing indicates capture when the widget is collapsed | Medium (privacy/trust) |
| 8 | Audio format was binary | `tts:format` was `'mpeg' \| 'opus'`; the renderer hard-coded two pipelines, so a WAV provider would have been mislabelled | Medium |
| 9 | Gemini TTS used a retired API shape | Documentation shows `generateContent` + `speechConfig` belongs to the 2.5 preview API; current models use the Interactions API | N/A (design input) |
| 10 | No main-process typecheck, no tests | `tsconfig.node.json` is a `references` stub; `npm run typecheck` did not exist; zero test files | Medium (regression risk) |
| 11 | 28 npm audit findings | `npm audit --omit=dev`: 1 critical, 15 high, 11 moderate, 1 low (`protobufjs` critical via `google-auth-library`; `electron` 29 and `@trpc/*` 10.45.0 need major/minor bumps) | Tracked, not fixed here — see §6 |

Note on finding 6: the wake-word feature itself is valuable, so it was **kept**
but made explicit — see `stt.autoListen` in §3.

---

## 2. Branding

| Area | Change |
| --- | --- |
| `package.json` | `name: ultron`, new description, `repository` → `BortKnox/ultron`, upstream author credited in `contributors`, added `typecheck` and `test` scripts |
| `electron-builder.json5` | `productName: Ultron`, `appId: com.bortknox.ultron`, `executableName: ultron`, `artifactName: ultron-${version}.${ext}`, NSIS shortcut `Ultron` |
| Window / tray | Window title `Ultron`, tray tooltip and menu items renamed, logs renamed |
| Prompts | The self-preservation rule in `action.md` / `direct_action.md` now lists the real process names (`ultron`, `atlas` legacy, `electron`) — renaming the executable without this would have let the agent kill itself |
| About page | Ultron name, tagline, links to this repository, plus an explicit "Built on Atlas by dortanes — Apache-2.0" line (licence compliance) |
| Icon | `scripts/generate-icons.py` renders original geometric artwork (graphite plate, segmented crimson ring, hexagon core) into `build/icon.png`, `icon.ico`, `tray.png`. No third-party or copyrighted character art is used anywhere |
| Colour | New `@theme` tokens (`--color-ultron-crimson*`, `--color-ultron-graphite-*`, `--color-ultron-silver`) and a default crimson accent (`--glass-accent-h/s/l`). `ui.accent` switches between `ultron` and `system`, and `useAccentColor` skips the OS listener when the fixed identity is selected |
| Default persona | Displayed as **Ultron** with a composed personality; the internal id stays `atlas-default` because `activePersonaId` and per-persona prompt directories reference it. `PersonaService` upgrades name/avatar/personality **only** while they still hold the Atlas defaults, so customised users keep their setup |

### User-data preservation (finding 2)

`electron/main/index.ts` now sets the app name and, before `app.whenReady()`,
reuses a previous user-data directory when the new one does not exist yet and
the old one contains a `Config` file:

```ts
for (const legacyName of ['Ultron', 'ultron', 'Atlas', 'atlas']) { … app.setPath('userData', candidate) }
```

Nothing is copied, moved or deleted — the existing directory is simply kept.

---

## 3. Widget: microphone and voice output

The widget now carries a compact control bar under the orb
(`src/components/controls/WidgetControls`) with three buttons: microphone,
speaker, settings.

**Microphone**

- Starts and stops *actual* capture (`useSTT.enable()` / `disable()`), releasing
  the `MediaStream` tracks and the `AudioContext` when stopped.
- `micActive` is derived from the STT phase, so the button cannot claim to be
  listening while capture is off (finding 5).
- Enabling capture also sets `stt.enabled`, so Settings and the widget never
  disagree. Disabling only stops capture.
- Failures are reported as a widget warning with a specific cause: permission
  denied, no device, device busy, or "speech model not downloaded".
- Capture is **not** persisted. On launch it starts only when the user opted in
  with the new `stt.autoListen` setting; existing installs that had voice input
  enabled are migrated to `autoListen: true` so they keep their previous
  behaviour (finding 6).

**Spoken responses**

- Toggles `tts.enabled` only, and stops playback immediately when muted.
- Independent of the microphone, and it survives restarts because it is a real
  preference (unlike capture state).

**Listening indicator**

- `src/components/controls/ListeningIndicator` renders a small "Listening" pill
  outside the widget stack, so it stays visible when the widget is collapsed
  (finding 7).

**Accessibility**

- Real `<button>` elements with `aria-pressed`, `aria-label`, `title`, visible
  focus rings, and a dot indicator so state is not conveyed by colour alone.
- All new animations are disabled under `prefers-reduced-motion`.

---

## 4. Gemini TTS

Details, model/voice catalogue and limitations: [`docs/GEMINI-TTS.md`](GEMINI-TTS.md).

Summary of the implementation:

- `TTSService` now resolves credentials per provider from
  `tts.providers.{elevenlabs,gemini}` (finding 3). `migration.ts` copies the
  legacy single-slot values into the ElevenLabs (or Gemini) slot exactly once,
  only where the target field is empty, and never deletes the legacy keys.
- `mergeConfig()` in `utils/config/index.ts` is recursive, so a partial save
  cannot drop sibling provider settings (finding 4).
- `GeminiTTSProvider` uses `client.interactions.create()` from the existing
  `@google/genai` dependency, requests `audio/wav`, and validates the response
  shape (`outputs[]` and the raw `steps[].content[]` form).
- `utils/wav.ts` writes/reads RIFF headers so headerless `audio/l16` output can
  be played; unexpected MIME types raise a clear error instead of being passed
  to the renderer mislabelled (finding 8).
- `BaseTTSProvider` gained `audioFormat` and an optional `AbortSignal`; the
  renderer's `useTTS` gained a `wav` blob pipeline.
- `audio.router` exposes `getTTSOptions` (providers, models, voices) and
  `testTTSVoice` (synthesize with the values currently on screen).
- The Voice tab shows a provider selector with per-provider panels, a masked key
  field with show/hide, verified model and voice dropdowns plus custom ids, a
  **Test voice** button with inline success/error feedback, and
  `stt.autoListen`.

No provider silently replaces another: an unknown provider id or a missing key
produces a warning naming the provider.

---

## 5. Verification performed

| Check | Result |
| --- | --- |
| `npm run lint` | Pass (0 errors) |
| `npm run typecheck` (renderer + `tsconfig.electron.json`) | Pass |
| `npm test` (vitest) | 45 tests, 5 files, pass |
| `npx vite build` | Pass — renderer 6.3 MB, main 231 kB, preload 7.2 kB |
| `node scripts/generate-icons.py` | Pass — 512² PNG, multi-size ICO, 32² tray |

Unit tests cover the pure logic that is easy to get wrong and impossible to
eyeball: WAV header maths, Gemini response parsing, audio normalisation,
provider error mapping, config migration, and catalogue integrity.

**Not verified here (be honest):**

- No live Gemini request was made — that needs a real API key, which is not in
  this environment. The request shape follows the documented Interactions
  payload and is unit-tested, but the first real call happens on your machine.
- The Electron UI was not launched: this sandbox is headless Linux and the app
  targets Windows. Behaviour of window click-through, tray and audio playback
  must be confirmed by running the app.

---

## 6. Known issues not addressed

1. **Dependency advisories (28).** `protobufjs` (critical, via
   `google-auth-library`), `electron@29` and `@trpc/*@10.45.0` (high) need
   upgrades. Fixing them means a major Electron/TRPC bump and a full runtime
   regression pass, which is a separate change from this one. Suggested starting
   point: `npm audit fix` for the non-breaking subset, then plan Electron 45 and
   TRPC 11 as their own tasks.
2. **Gemini TTS does not stream.** Playback starts after synthesis. Making it
   stream requires the SDK's SSE variant.
3. **Alice voice/language is not configurable** — the client picks it. The
   provider now reports `opus` explicitly instead of relying on the renderer's
   default.
4. **Legacy TTS keys remain in config** (`tts.apiKey`, `tts.voiceId`,
   `tts.model`). They are deprecated and unused, kept only so a downgrade does
   not lose credentials. They can be removed in a later migration.
5. **The intelligence engine still speaks for the agent** — nothing in this
   change touched the computer-use loop, memory or search.
