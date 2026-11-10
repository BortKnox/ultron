<p align="center">
  <img src="build/icon.png" width="128" height="128" alt="Ultron" />
</p>

<h1 align="center">Ultron</h1>

<p align="center">
  <b>A composed AI agent that lives on your desktop.</b><br/>
  It sees your screen, understands what you need, and gets things done — hands-free.
</p>

<p align="center">
  <a href="#-getting-started"><img src="https://img.shields.io/badge/get%20started-→-be2631?style=for-the-badge" alt="Get Started" /></a>&nbsp;
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-gray?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-supported-brightgreen?style=flat-square&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/privacy--first-local%20only-blue?style=flat-square" alt="Privacy" />
  <img src="https://img.shields.io/badge/built%20on-Atlas-lightgrey?style=flat-square" alt="Built on Atlas" />
</p>

---

> **Ultron is a fork of [Atlas](https://github.com/dortanes/atlas) by dortanes** (Apache-2.0).
> The desktop-agent engine — computer use, planning, personas, memory, search —
> comes from Atlas. This fork changes the identity, the widget interaction model
> and the text-to-speech stack. See [docs/ULTRON.md](docs/ULTRON.md) for the full
> change log and audit, and [docs/GEMINI-TTS.md](docs/GEMINI-TTS.md) for the
> Gemini voice integration.

---

## What is Ultron?

Ultron is an **AI-powered desktop agent** that works alongside you as a transparent overlay. Press `Ctrl+Space`, tell it what to do — and it figures out the rest: navigating apps, clicking buttons, typing text, searching the web, finding files, running commands.

Think of it as a **copilot for your entire OS**.

- 🖥 **Sees your screen** — captures what's on your display and understands the context
- 🧠 **Thinks before it acts** — plans multi-step tasks and shows progress in real time
- 🖱 **Controls your computer** — mouse, keyboard, and terminal — all automated
- 🎯 **Shows what it's doing** — you can see the agent's cursor moving on screen
- 🔍 **Searches the web** — finds answers and brings them back, no tab-switching needed
- 📂 **Finds your files** — searches local files and folders by name, right from chat
- 🗣 **Speaks to you** — ElevenLabs (streaming), Yandex Alice, or Google Gemini TTS
- 🎙 **Listens to you** — local speech-to-text with an explicit microphone switch and wake word
- 🔊 **Sound feedback** — distinct sounds for every state: activation, processing, task complete, warnings
- 🛡 **Asks before doing anything risky** — built-in safety system with permission prompts

---

## ✨ Key Features

### 🎛 Widget Controls
Three switches sit directly under the orb, so nothing important is hidden in Settings:

| Control | What it does |
| --- | --- |
| 🎙 **Microphone** | Starts and stops real microphone capture. Its state mirrors the audio pipeline, so the button can never claim to be listening while capture is off. |
| 🔊 **Speaker** | Mutes or unmutes spoken responses. Text, listening and commands keep working while muted. |
| ⚙ **Settings** | Opens Settings without leaving the widget. |

A small **Listening** badge stays visible even when the widget is collapsed, so
you always know whether the microphone is on. Capture is never persisted: it
starts on launch only if you enable *Start microphone on launch* in
Settings → Voice.

### 🗣 Text-to-Speech
- **Google Gemini** — `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts`, 30 studio voices, free tier available, verified model/voice pickers and a **Test voice** button
- **ElevenLabs** — streaming MP3 with your own voice ids
- **Yandex Alice** — no API key required

Each provider keeps its own credentials, so switching providers never
overwrites another one. A failing provider is reported, never silently swapped.

### 🔮 The Orb
A glowing AI indicator that shows you exactly what Ultron is doing — idle, thinking, acting, or waiting for your input. Always visible, never in the way.

### 🏝 Islands
Context-aware floating panels that appear when relevant:
- **Action Island** — shows the current task and progress
- **Response Island** — streams Ultron's thoughts and replies word by word
- **Permission Island** — asks for confirmation before risky operations
- **Microtask Island** — your task queue with real-time step progress (queue new tasks while the agent is busy)
- **Search Island** — web search results and local file search results
- **Listening Island** — live transcript display during voice input
- **Warning Island** — dismissable warnings for errors and quota issues

### 🎯 Agent Cursor
When Ultron controls your desktop, you can see its cursor moving on screen — clicking, typing, and scrolling — so you always know what's happening.

### 🖥 Computer Use
With compatible Gemini 3.x models, Ultron uses the native **[Computer Use API](https://ai.google.dev/gemini-api/docs/computer-use)** for precise screen control — clicking, typing, scrolling, navigating, and searching — all without opening extra apps. Multi-monitor setups are supported.

### 🧩 Smart Task Planning
Before executing complex commands, Ultron breaks them into high-level steps (2–5) and displays them in the Task Queue. You see planned steps before execution begins and watch progress as each step completes.

### 🎭 Personas
Create multiple AI agents with unique personalities, knowledge, and voices. Each persona has its own memory and prompt settings — switch between them from the tray menu.

### 🧠 Memory
Ultron remembers your preferences and context across sessions. It learns facts about you from conversations and uses them to give better responses over time. Browse conversation history and view, edit, or delete learned facts in Settings.

### 🎙 Voice Input
Local offline speech-to-text via Vosk — enable the microphone in the widget and say the wake word (the active persona's name). No cloud API required.

### ✍️ Editable Prompts
Full control over the AI's behavior — modify system, action, and safety prompts directly from the Settings UI. Reset to defaults anytime.

### ⚙️ Customizable Layout
Choose where Ultron appears on screen (left, right, or center), pick an accent (Ultron crimson or your OS accent) and configure your preferred activation hotkey — all from Settings.

### 🔧 Debug Logging
Enable per-request session logs to trace the full pipeline: intent classification → LLM calls → actions → response streaming — with precise timing for every stage.

---

## 🚀 Getting Started

### Download & Install

1. Go to [**Releases**](https://github.com/BortKnox/ultron/releases) and download the latest installer for Windows
2. Run the installer — Ultron will appear in your system tray
3. Get a **Gemini API key**: go to [Google AI Studio](https://aistudio.google.com/apikey) → sign in → **Create API Key** → copy it
4. Click the **Ultron tray icon** → **Settings** → **Intelligence** tab → paste your API key
5. Set the recommended models in the **Intelligence** tab:

   | Setting | Free tier | Paid tier |
   |---------|-----------|-----------|
   | **Text model** | `gemini-3.1-flash-lite-preview` | `gemini-3.1-flash-lite-preview` |
   | **Vision model** | `gemini-3.1-flash-lite-preview` | `gemini-3-flash-preview` |

   > Vision model handles screen control & Computer Use. Paid tier model is more accurate but requires a billing-enabled API key.

6. *(Optional)* For voice output — **Voice** tab:
   - **Gemini** — paste a Gemini API key, keep `gemini-3.8-flash-lite-tts` and a voice such as `Kore`, then press **Test voice**
   - **Alice** (free, no API key): select **Yandex Alice** → done
   - **ElevenLabs** (premium voices): get an [ElevenLabs](https://elevenlabs.io/) API key → paste key + voice ID
7. Press `Ctrl+Space` and start giving Ultron tasks 🎉

> Coming from Atlas? Your config, personas, memory, facts and downloaded
> speech models are reused from the previous user-data directory.

### Build from Source

> For contributors and developers who want to run Ultron from source.

```bash
git clone https://github.com/BortKnox/ultron.git
cd ultron
npm install
npm run dev
```

> **Requires:** [Node.js](https://nodejs.org/) ≥ 20

Useful scripts:

```bash
npm run lint        # ESLint
npm run typecheck   # renderer + main process
npm test            # vitest unit tests
npm run build       # lint + typecheck + vite build + electron-builder
```

---

## 🗺 Roadmap

| Status | Feature |
|:------:|---------|
| ✅ | Transparent glassmorphism overlay with Orb + Island UI |
| ✅ | Widget mic / speaker / settings controls |
| ✅ | LLM integration (Gemini + OpenAI) with multi-provider architecture |
| ✅ | Screen vision + desktop automation (robotjs) |
| ✅ | Native Gemini [Computer Use API](https://ai.google.dev/gemini-api/docs/computer-use) |
| ✅ | Smart task planning with step-by-step progress |
| ✅ | Agent cursor animations (click, type, scroll overlays) |
| ✅ | Google Gemini TTS (WAV), ElevenLabs streaming, Yandex Alice |
| ✅ | Persona system with isolated memory & custom voices |
| ✅ | Web search + local file search |
| ✅ | Settings UI with prompt editor + debug logging |
| ✅ | Intent classification (direct / action / chat) |
| ✅ | Context caching (Gemini prompt caching for token optimization) |
| ✅ | Voice input (wake word + local STT via Vosk) |
| ⏹ | Action whitelist/blacklist & audit log |
| ⏹ | Onboarding flow |
| ⏹ | Auto-update |
| ⏹ | Streaming Gemini TTS (needs the SDK's SSE variant) |

---

## 🤝 Contributing

Issues and pull requests are welcome. For anything touching the agent engine,
read [docs/ULTRON.md](docs/ULTRON.md) first — it lists what was deliberately
left unchanged and which dependency upgrades are still pending.

## 📜 License

[Apache License 2.0](LICENSE) — use it, modify it, build on it.

This project is a fork of [Atlas](https://github.com/dortanes/atlas) by
[dortanes](https://github.com/dortanes), also Apache-2.0. The original
copyright and licence notices are retained.

---

<p align="center">
  Forked and reworked by <a href="https://github.com/BortKnox">BortKnox</a><br/>
  Original engine: <a href="https://github.com/dortanes">dortanes</a>
</p>
