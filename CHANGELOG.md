# Changelog — Ultron fork (unreleased)

Fork of [Atlas](https://github.com/dortanes/atlas) v0.2.3. Full rationale and audit in
[`docs/ULTRON.md`](docs/ULTRON.md); Gemini voice details in [`docs/GEMINI-TTS.md`](docs/GEMINI-TTS.md).

## [Added]
- **Widget controls** — microphone, spoken-responses and settings buttons under the orb (`components/controls/WidgetControls`)
- **Persistent listening indicator** — visible badge while the microphone captures, even when the widget is collapsed (`components/controls/ListeningIndicator`)
- **Explicit microphone lifecycle** — `useSTT` gained `enable()` / `disable()` / `micActive` / `micError`; capture is never restored on launch unless opted in
- **`stt.autoListen`** — explicit opt-in for starting the microphone on launch; existing installs with STT enabled are migrated to `true`
- **Google Gemini TTS provider** — `generateContent` with `responseModalities: [AUDIO]`, Interactions as a documented fallback, 30 studio voices (`services/tts/GeminiTTSProvider.ts`, `geminiCatalog.ts`)
- **Per-model endpoint routing** — `GEMINI_TTS_MODELS[].api` records whether a model answers `generateContent` or Interactions; the Voice tab shows it in the hint
- **Raw Gemini error logging** — `logRawGeminiError` prints HTTP status, Google's `error.status`, `error.message` and `error.details` to the terminal
- **WAV support** — `utils/wav.ts` builds/parses RIFF headers; `useTTS` gained a `wav` blob pipeline
- **Per-provider TTS credentials** — `tts.providers.{elevenlabs,gemini}` so switching providers no longer overwrites keys
- **`audio.getTTSOptions`** — verified model/voice catalogue for the settings UI
- **`audio.testTTSVoice`** — synthesize a sample with the on-screen settings
- **`system.openSettings`** — open Settings from the widget
- **`ui.accent`** — `ultron` (fixed crimson) or `system` (OS accent)
- **Original icon artwork** — `scripts/generate-icons.py` (graphite plate, segmented crimson ring, hexagon core)
- **Verification pipeline** — `npm run typecheck` (renderer + main), `npm test` (vitest, 62 tests), `tsconfig.electron.json`

## [Changed]
- **Branding** — package name/description/repository, `productName`/`appId`/`executableName`/`artifactName`, window title, tray labels, prompts, settings copy, docs and issue templates
- **Clean-slate user data** — `app.setName('Ultron')` gives a dedicated user-data directory from the first launch; no migration code and no probe of earlier directories
- **Default persona** — displayed as **Ultron**; the record id stays `atlas-default` because `activePersonaId` and per-persona prompt folders are keyed by it
- **Config merging** — recursive deep merge so nested groups (`tts.providers.*`) survive partial saves
- **TTS errors** — provider-aware messages (`ttsErrors.ts`) naming the failing provider and the fix
- **Audio format reporting** — `BaseTTSProvider.audioFormat` replaces the hard-coded `'mpeg' | 'opus'` union
- **Voice tab** — rebuilt around providers, with key masking, verified pickers, custom ids and an inline test result
- **CI artifact** — `ultron-windows-x64`

## [Fixed]
- **Gemini TTS rejected every request** — the Interactions payload sent `{ type: 'text', text }` instead of the documented `user_input` content block, and the installed SDK (1.45.0) predates the 2.24.0 the endpoint requires. The provider now uses `generateContent` first, keeps Interactions as a fallback, and logs Google's raw error instead of a generic rejection
- **Retired model ids** — a 404 now retries at most two documented fallbacks (logged) instead of failing outright
- **Opaque TTS errors** — mapped messages append the provider's own words, truncated; status-only wrappers are suppressed
- **Dead microphone control** — the widget mic is dormant but clickable when voice input is off, and its tooltip states the real reason it is idle

## [Preserved]
- Agent engine, computer-use loop, planning, personas, memory, facts, search, prompts, settings layout
- ElevenLabs quota auto-disable behaviour
- Apache-2.0 licence and upstream copyright

# Changelog — v0.2.3 (2026-03-16)

## [Added]

- **Local Speech-to-Text** — offline STT via `vosk-browser` with AudioWorklet-based mic capture (`useSTT` composable, `STTService`, `ModelManager`)
- **Wake word activation** — persona-based wake word detection triggers listening automatically
- **ListeningIsland UI** — floating island component showing live transcript during voice input
- **STT model management** — backend download, progress tracking, and per-language model status via `getSTTModelStatus` (now accepts optional `language` parameter)
- **Full-page Settings UI** — new full-page layout with sidebar navigation replaces glass overlay panel
- **VoiceTab** — unified tab combining TTS and STT settings (replaces separate `TTSTab` and `STTTab`)
- **AboutTab** — displays app version, Electron/Chrome/Node runtime versions
- **CustomSelect component** — styled dropdown replacing native `<select>` across all settings tabs
- **EmojiPicker component** — emoji avatar selection for personas (`vue3-emoji-picker` dependency)
- **Per-section reset to defaults** — `settings.resetSection` tRPC endpoint resets individual config sections (`ui`, `llm`, `generation`, `tts`, `stt`, `agent`)
- **`settings.getAppVersion`** — tRPC endpoint returning app name, version, and runtime versions
- **`system.openExternal`** — tRPC endpoint to open URLs in the default browser
- **`forceHideWindow()`** — unconditional window hide in `WindowManager` (used when closing settings without agent)
- **Sound settings** — `soundEnabled` and `soundVolume` fields in `UIConfig` schema and defaults
- **`.gitattributes`** — enforce consistent line endings across the repository

## [Changed]

- **Settings tab structure** — 7 tabs → 6 tabs (`General`, `Intelligence`, `Voice`, `Agent`, `Personas`, `About`); `LLM` renamed to `Intelligence`
- **GeneralTab** — expanded with sound settings, hotkey binding (moved from `HotkeyTab`), and app exit action
- **AgentTab** — redesigned with card-based sections, slider controls, CustomSelect dropdowns
- **LLMTab (Intelligence)** — includes generation settings, model parameters, and section reset button
- **PersonasTab** — redesigned with emoji avatars, card-based persona list, horizontal sub-tab pills
- **PromptsTab** — restyled with horizontal prompt pills, full-width editor, and Material Icons
- **Persona sub-tabs** (`ActionsSubTab`, `FactsSubTab`, `MemorySubTab`) — unified `subtab-card` class system with Material Icons
- **`useSettings` composable** — auto-save via 800ms debounced watcher replaces manual save button
- **`SettingsView.css`** — fully rewritten (~2300+ lines) for the new full-page layout
- **`WindowManager.showWindowForSettings()`** — now positions window on active monitor without emitting agent-visibility events
- **`system.hideWindow`** — calls `forceHideWindow()` instead of `toggleWindow()`
- **`toggleWindow()`** — removed settings-open guard (no longer needed with full-page settings)
- **`App.tsx` / `MainView.tsx`** — updated for settings routing, window lifecycle, and STT integration
- **Multi-monitor screenshots** — `ScreenCapture` and `CoordinateMapper` now target the active display
- **TTS interruption** — `useTTS` properly stops playback when agent is interrupted
- **Agent warning** — dismissible max-steps warning in `InputBar`
- **Command deduplication** — prevents duplicate command submissions in `AgentService`
- **Hidden UI on startup** — main window starts invisible until explicitly shown
- **CSP headers** — updated Content-Security-Policy in `index.html` for audio worklet support

## [Removed]

- **`TTSTab.tsx`** — merged into `VoiceTab`
- **`STTTab.tsx`** — merged into `VoiceTab`
- **`HotkeyTab.tsx`** — hotkey settings moved into `GeneralTab`
- **`setSettingsOpen()` / `settingsOpen`** state tracking in `WindowManager`
- **`notifySettingsOpen`** tRPC endpoint in `system.router`
- **Manual "Save Settings" button** — replaced by auto-save
- Unused `suspendMic` / `resumeMic` functions
- Unused `tts:format` event from `eventBus.ts`

---

# Changelog — v0.2.2 (2026-03-15)

## [Added]

- **File-based log transport** — all log output (`info`, `warn`, `error`, `debug`) is now persisted to `{userData}/Log` with automatic size rotation (5 MB cap, keeps last ~1 MB)
- **Session banners** — `logSessionStart()` / `logSessionEnd()` write visual delimiters (`SESSION START` / `SESSION END`) to the log file for easier request tracing
- **"Open Log File" button** in `GeneralTab` — opens the log file in the default text editor via `settings.openLogFile` RPC
- **Settings-open guard on tray icon** — `WindowManager` tracks settings-open state via `notifySettingsOpen` RPC; tray click no longer collapses the atlas window while settings are visible

## [Changed]

- **`userData` folder naming** — capitalized to match Chromium conventions (`logs` → `Logs`) across `sessionLogger.ts`, `config/index.ts`, `config/schema.ts`, `config/migration.ts`, `PromptLoader.ts`, `FactService.ts`, `MemoryService.ts`, `MemoryTypes.ts`, `PersonaService.ts`
- **`createLogger`** — refactored to separate prefix formatting from output, enabling dual console + file writes
- **`GeneralTab`** — log buttons now share a horizontal row layout
- **`App.tsx`** — emits `notifySettingsOpen` on settings open/close

---

# Changelog — v0.2.1 (2026-03-15)

## [Added]

- **Gemini Context Caching** — `ContextCacheService` with per-persona, per-prompt-type partitions and automatic invalidation on prompt/persona changes
- **Alice TTS** — new `YandexAliceProvider` (no API key required, opus audio format) + `yandex-alice-client` dependency
- **Agent Cursor Overlay** — `AgentCursor` component, `AgentCursor.css`, and `useAgentCursor` composable for real-time animated cursor (move, click, double-click, right-click, type, scroll)
- **`agentUtils.ts`** — shared `buildDynamicContext()` and `requestPermission()` helpers extracted from loops
- **`navigate` action type** — new action type and `url` field in `AgentAction` for in-tab URL navigation
- **`agent:cursor-animation`** event bus channel for real-time action visualization
- **`prompt:saved`** event emitted on prompt save/reset for cache invalidation
- **`onTTSFormat`** subscription in `audio.router` — tells frontend which playback pipeline (mpeg/opus) to use
- **Opus/blob playback pipeline** in `useTTS` alongside existing MSE/mpeg pipeline
- **`hideCursor()`** method on `MotorService` — called on cleanup in `ActionLoop`, `DirectActionLoop`, and `ComputerUseLoop`
- **`isSendKeysTextCommand()`** guard in `DirectActionLoop` blocking WScript `SendKeys` text input
- **PowerShell special-folder resolution** in `ShellController` for OneDrive-redirected paths
- **`onCursorAnimation`** subscription in `agent.router`
- **`CursorAnimation`** interface in `src/types/agent.ts`
- **`<AgentCursor />`** mounted in `MainView.tsx`

## [Changed]

- **`ComputerUseLoop`** — reduced redundant screenshots, dynamic delay scaling, improved retry/backoff logic, smarter stop-condition checks; now receives `searchService` for web search support
- **`DirectActionLoop`** — on action failure, asks LLM for a natural error explanation; blocks `SendKeys` text input → redirects to vision mode
- **`ChatMode`** — uses `buildDynamicContext()` for dynamic context injection and Gemini context caching
- **`TaskPlanner`** — enforces same-language step descriptions matching the user's command language
- **`AgentService`** — stores `searchService` as class field, passes it through to `AgentLoop`; removed direct state transitions from `onPermissionResponse` (now handled inside loops)
- **`AgentLoop`** — passes `searchService` to `ComputerUseLoop`
- **`IntelligenceService`** + all LLM providers (`BaseLLMProvider`, `GeminiProvider`, `OpenAIProvider`) — added `cachedContent` parameter threading through `chat`, `stream`, `chatWithVision`, `chatStructured`, `chatWithVisionStructured`
- **`system.md`** — removed `time` and `user_facts` placeholders (now injected as dynamic context in messages)
- **`computerUseMapper`** — handles `type_text_at` without coordinates by falling back to `type` action
- **`MouseController`** — increased scroll amount for reliable scrolling
- **`KeyboardController`** — improved text input with configurable delays
- **`settings.router`** — prevents stale `activePersonaId` from overwriting persona switch value; emits `prompt:saved` on save/reset
- **`useResponse`** — clears old response when new command starts processing
- **`useSearch`** — clears search results when new command starts processing
- **`TTSTab`** — conditionally hides API key / voice / model fields for Alice
- **Prompts** (`action.md`, `direct_action.md`, `computer_use.md`, `extract_facts.md`, `intent_classifier.md`) — refined instructions for language consistency and action accuracy
- **`TTSService`** — adds `audioFormat` getter, `disposeProvider()` lifecycle, Alice support, `tts:format` emission
- **`README.md`** — minor documentation updates

## [Removed]

- **`alwaysOnTop`** UI config option — removed from `schema.ts`, `defaults.ts`, `migration.ts`, `useSettings.ts`, `GeneralTab.tsx`, `TrayManager.ts`, `WindowManager.ts`, and `settings.router.ts`
