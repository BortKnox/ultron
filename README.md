<p align="center">
  <img src="build/icon.png" width="132" height="132" alt="Ultron" />
</p>

<h1 align="center">ULTRON</h1>

<p align="center">
  <b>An AI desktop agent that sees, navigates and operates your computer.</b><br/>
  Speak the goal. Ultron plans the steps and takes action.
</p>

<p align="center">
  <a href="#install"><img src="https://img.shields.io/badge/install-→-be2631?style=for-the-badge" alt="Install" /></a>&nbsp;
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-2a2d33?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  Windows desktop app · Electron + Vue + TypeScript<br/>
  <a href="#what-can-i-ask-it-to-do">What it can do</a> · <a href="#computer-navigation-and-automation">Computer control</a> · <a href="#preview">Preview</a> · <a href="#install">Get started</a> · <a href="#build-from-source">Development</a> · <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://htmlpreview.github.io/?https://github.com/BortKnox/ultron/blob/share/orb-mockup/docs/orb-preview/index.html">
    <img src="docs/screenshots/orb-ready.webp" width="480" alt="Ultron neural gyro orb design preview: golden gyroscopic rings and orbiting particles around a crystalline core in the Ready state" />
  </a><br/>
  <sub>Neural gyro orb — next visual direction, design preview only. Not yet integrated into the desktop app.</sub>
</p>

---

## This is Ultron

Ultron turns plain-language requests into actions on your Windows desktop. It can
read the screen, operate applications, run PowerShell commands, search for files
and information, and work through multi-step tasks. **It does not just tell you
where to click—it can do the clicking, typing and navigation.**

Developed and maintained by **BortKnox**, Ultron combines that computer-use engine
with voice interaction, persona-specific memory and a floating desktop widget.

The focus is a companion with a distinct presence: an orb you engage directly,
visible progress while it works, and a personality you can shape. Ultron's
development includes its own branding, multi-provider voice integration,
manual memory-entry tools, and hardware-verified consecutive orb-driven command
sessions.

---

## It is not a chat window

Ultron lives on your desktop as a transparent overlay. One hotkey — `Ctrl+Space`
— and it is present: reading what is on screen, planning the steps, moving the
cursor, typing into the app that is actually open.

No tab switching. No copy-paste relay. You state the outcome; it does the work
and shows you every step it takes.

Simple commands can take a direct shell or keyboard route. Tasks that need the
screen use screenshot-guided interaction. You do not need to script every click
or restrict your request to a fixed catalogue of automations.

## What can I ask it to do?

Give it an outcome, not a sequence of clicks. These are example requests for
Ultron's general computer-use capabilities, not separately tested one-click features.

**Organize files and investigate duplicates.** “Help me organize this project
folder. Compare potential duplicates using my duplicate-finder app and show me
what should be kept before anything is deleted.” Ultron can navigate file tools
and perform file-management commands. It is not a built-in, whole-drive duplicate
scanner; matching filenames alone does not establish that file contents are identical.

**Understand your PC and investigate performance.** “Open System Information and
Task Manager, review my specs and resource usage, and suggest the easiest
improvements. Don't change anything yet.” Ultron can operate Windows system tools
and run system-information commands. Recommendations depend on what it actually
observes—not a dedicated benchmark or a promise of faster performance.

**Work across applications.** “Open the project folder and my notes app, create
a checklist from these instructions, and save it with the project.” App launching,
window switching, text entry and file operations let a task span more than one
window rather than stop at a chat response.

**Research, then act on what you find.** “Look up how to change this setting,
open the relevant settings page, and walk me through the options.” Web search,
screen reading and desktop navigation support tasks that require both information
and interaction.

For cleanup and configuration work, start with a read-only review, agree on the
changes and keep backups. Review important results; model-driven actions can fail
or misinterpret a screen, and confirmation is not enforced uniformly across all
execution paths. See [Known limits](#known-limits).

## Computer navigation and automation

Ultron's abilities are backed by executable actions, not simulated activity in chat:

- **Mouse and keyboard control** — click, double-click, right-click, type, scroll
  and use shortcuts to navigate real applications and browser pages.
- **Screen awareness** — capture the display the overlay is on, interpret what is
  visible and use subsequent screenshots to guide the next action, with
  multi-monitor coordinate handling.
- **Windows command execution** — use PowerShell for file operations, application
  launch and system queries when a command is more appropriate than GUI navigation.
- **File and web search** — find files by name in common user folders and look up
  information online; these are separate tools, not just browser clicks.
- **Multi-step execution** — generate a high-level task plan, show progress and
  perform successive actions toward the requested outcome, within configured limits.

For implementation details, see the [action dispatcher](electron/main/services/motor/MotorService.ts),
[PowerShell controller](electron/main/services/motor/ShellController.ts),
[computer-use loop](electron/main/services/agent/ComputerUseLoop.ts),
[task planner](electron/main/services/agent/TaskPlanner.ts) and
[search service](electron/main/services/search/SearchService.ts).

---

## Control

Three controls sit under the orb. Nothing important is buried in a settings
screen you have to hunt for. The orb itself is the entry point for a command.

| Control | Behaviour |
| --- | --- |
| **Orb** | With the microphone armed, opens a command session without requiring a wake word. With the microphone off, opens the text input only. |
| **Microphone** | Arms or disarms capture. Its indicator reflects observed audio-frame activity, not a separate UI-only toggle. |
| **Speaker** | Mutes or unmutes spoken responses. Text, listening and commands continue while muted. |
| **Settings** | Opens configuration without leaving the widget. |

The microphone is **never** silently armed. Capture starts when you press it, or
on launch only if you switched on *Start microphone on launch*. A small
**Listening** badge stays visible even with the widget collapsed — you always
know whether capture is active. After a voice command, capture stays armed;
click the orb to begin the next command session.

---

## Voice

Three engines. Each keeps its own credentials, so switching never destroys the
others. A failing engine is named, never swapped behind your back.

**Google Gemini** — `gemini-2.5-flash-preview-tts` by default; the 3.8 family is
selectable. Thirty studio voices, WAV or raw PCM handled correctly, free tier
available. Failures print Google's own words to the log, not a shrug.

**ElevenLabs** — streaming MP3, your own voice ids.

**Yandex Alice** — no key required.

Speech-to-text runs locally through Vosk. Download the model once, then
recognition works offline. Orb-driven sessions do not require a wake word.
Cloud intelligence and voice providers still require their respective services.

---

## Memory and personas

Ultron remembers facts across sessions, and you can read, edit or delete every
one of them. You can also add narrative memory entries manually. Personas give
it distinct personalities, knowledge, voices and isolated memory. Switch
personas from the tray.

---

## The look

Ultron's current interface uses a graphite-and-crimson identity: near-black
surfaces, a focused accent, and an animated orb that responds to agent state.
*Ultron crimson* is the default accent; your OS accent is one setting away.

## Preview

The next orb concept is a neural core: gyroscopic rings, orbiting particles,
a crystalline centre, and a spectral ring for listening and speaking. It explores
distinct functional states and expressive motion without making the orb a
conventional dashboard.

[Explore the interactive orb preview](https://htmlpreview.github.io/?https://github.com/BortKnox/ultron/blob/share/orb-mockup/docs/orb-preview/index.html) to see the motion and switch between all eight functional states and four speaking expressions. Use **1–8** for states and **Q / W / E / R** for expressions.

**Design preview only:** these are captures of the standalone mockup, not the running desktop app. Its buttons are demonstration controls, not the proposed widget layout. Emotional expression driven by response content remains a proposed enhancement.

### Functional states

<p align="center">
  <img src="docs/screenshots/orb-ready.webp" width="220" alt="Ready orb design state" />
  <img src="docs/screenshots/orb-listening.webp" width="220" alt="Listening orb design state" />
  <img src="docs/screenshots/orb-thinking.webp" width="220" alt="Thinking orb design state" />
  <img src="docs/screenshots/orb-speaking.webp" width="220" alt="Speaking orb design state" /><br/>
  <sub>Ready · Listening · Thinking · Speaking — left to right, wrapping on smaller screens.</sub>
</p>

<details>
<summary>Dormant, Acting, Awaiting permission and Fault</summary>

<p align="center">
  <img src="docs/screenshots/orb-dormant.webp" width="220" alt="Dormant orb design state" />
  <img src="docs/screenshots/orb-acting.webp" width="220" alt="Acting orb design state" />
  <img src="docs/screenshots/orb-awaiting-permission.webp" width="220" alt="Awaiting permission orb design state" />
  <img src="docs/screenshots/orb-fault-warning.webp" width="220" alt="Fault warning orb design state" /><br/>
  <sub>Dormant · Acting · Awaiting permission · Fault — left to right.</sub>
</p>

</details>

<details>
<summary>Speaking expressions: Cold Composure, Dry Amusement, Rising Irritation and Controlled Fury</summary>

<p align="center">
  <img src="docs/screenshots/orb-cold-composure.webp" width="220" alt="Cold Composure speaking expression design" />
  <img src="docs/screenshots/orb-dry-amusement.webp" width="220" alt="Dry Amusement speaking expression design" />
  <img src="docs/screenshots/orb-rising-irritation.webp" width="220" alt="Rising Irritation speaking expression design" />
  <img src="docs/screenshots/orb-controlled-fury.webp" width="220" alt="Controlled Fury speaking expression design" /><br/>
  <sub>Cold Composure · Dry Amusement · Rising Irritation · Controlled Fury — left to right.</sub>
</p>

</details>

Capture provenance and refresh guidance live in [`docs/screenshots/README.md`](docs/screenshots/README.md). The older [`docs/preview.png`](docs/preview.png) is an upstream-era reference, not a screenshot of Ultron's current interface.

Icons and marks are original geometry — generated by
[`scripts/generate-icons.py`](scripts/generate-icons.py), not borrowed art.

---

## Install

Windows is the supported target. Packaged installers will appear in [Releases](https://github.com/BortKnox/ultron/releases); none are published yet. For now, use [Build from source](#build-from-source), then configure the app below.

1. When an installer is available, download it from [Releases](https://github.com/BortKnox/ultron/releases).
2. Install and launch. Ultron appears in the system tray.
3. Create a **Gemini API key** at [Google AI Studio](https://aistudio.google.com/apikey).
4. Tray icon → **Settings** → **Intelligence** → paste the key.
5. Recommended models:

   | Setting | Free tier | Paid tier |
   | --- | --- | --- |
   | Text | `gemini-3.1-flash-lite-preview` | `gemini-3.1-flash-lite-preview` |
   | Vision | `gemini-3.1-flash-lite-preview` | `gemini-3-flash-preview` |

6. Optional — **Settings → Voice**:
   - **Gemini**: paste a key, keep `gemini-2.5-flash-preview-tts`, pick a voice, press **Test voice**.
   - **Yandex Alice**: select it. No key.
   - **ElevenLabs**: paste a key and voice id.
7. Press `Ctrl+Space` to show the widget. For voice input, download the STT model
   in **Settings → Voice**, arm the microphone, then click the orb and speak.
   With the microphone off, click the orb to type instead.

Ultron keeps its state in its own `Ultron` user-data directory, created on first
launch.

---

## Build from source

```bash
git clone https://github.com/BortKnox/ultron.git
cd ultron
npm install
npm run dev
```

Requires Node.js ≥ 20.

```bash
npm run lint        # ESLint
npm run typecheck   # renderer + main process
npm test            # vitest unit tests
npm run build       # lint + typecheck + bundle + installer
```

Design notes and the audit trail live in [`docs/ULTRON.md`](docs/ULTRON.md);
the Gemini voice pipeline is documented in [`docs/GEMINI-TTS.md`](docs/GEMINI-TTS.md).

## Contributing

Bug reports, visual refinements and focused fixes are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch, verification and pull-request workflow. Report issues with reproduction steps and logs, removing API keys and personal information first.

---

## Known limits

- Windows is the supported target.
- Computer-use tasks depend on the configured model, available applications,
  permissions and screen state. Iteration and failure limits can leave a task incomplete.
- Built-in file search is filename-based, limited to common user folders and
  bounded results; it is not an exhaustive scan of every drive or content-based duplicate detection.
- **Confirmation is not universal.** Standard action paths can request approval
  for actions classified as high or critical risk, but the native Computer Use loop
  currently auto-acknowledges model confirmation requests. Do not rely on it as a
  blanket safeguard for deletions or system changes.
- Gemini speech is buffered, not streamed — playback begins after synthesis.
- The install will not auto-update yet.
- Dependency advisories are tracked in `docs/ULTRON.md` §4; the Electron and
  TRPC upgrades are pending.

---

## Licence

[Apache License 2.0](LICENSE). Original copyright and licence notices are retained.

<details>
<summary>Upstream acknowledgement</summary>

Ultron originated as a fork of [Atlas](https://github.com/dortanes/atlas) by
dortanes and incorporates portions of its desktop-agent engine under Apache-2.0.
Ultron's subsequent development and presentation are maintained in this repository.

</details>

---

<p align="center">
  <sub>There is no version of this where you are not watched over.</sub>
</p>
