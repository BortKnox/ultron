# Gemini TTS in Ultron

How Ultron talks to Google Gemini for speech, which models and voices it offers,
and how to read a failure when Google says no.

Verified against the official documentation in November 2026:

- <https://ai.google.dev/gemini-api/docs/speech-generation>
- <https://ai.google.dev/gemini-api/docs/pricing>

---

## 1. Two request shapes, one provider

Gemini has served TTS from two different endpoints during its preview period,
and which models answer which endpoint has changed more than once:

| Shape | Request | Models documented for it |
| --- | --- | --- |
| `generateContent` | `responseModalities: [AUDIO]` + `speechConfig` | `gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts`, `gemini-3.1-flash-tts-preview` |
| Interactions | `client.interactions.create()` | `gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts` |

Ultron's provider knows which shape each catalogue model uses and sends that
one first:

```ts
// generateContent — the default path
client.models.generateContent({
  model: 'gemini-2.5-flash-preview-tts',
  contents: [{ role: 'user', parts: [{ text }] }],
  config: {
    responseModalities: [Modality.AUDIO],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
  },
})

// Interactions — used by the 3.8 models
client.interactions.create({
  model: 'gemini-3.8-flash-tts',
  input: [{ type: 'user_input', content: [{ type: 'text', text }] }],
  response_format: { type: 'audio', mime_type: 'audio/wav' },
  generation_config: { speech_config: [{ voice: 'Kore' }] },
})
```

**Why the default moved to `generateContent`.** The first cut of this provider
used the Interactions endpoint for every model, and Google rejected the request.
Two things were wrong: the `input` payload must nest text inside a `user_input`
content block (it was sent as a bare `{ type: 'text', text }`), and the TTS docs
require `@google/genai >= 2.24.0` for that endpoint while this project ships
`1.45.0`. The `generateContent` shape is fully supported by the installed SDK
and needs no dependency bump, so it is the primary path; Interactions remains
as an automatic fallback for models that only answer there.

The fallback is not silent. Every attempt is logged with its endpoint, and the
model/API choice is visible in Settings → Voice (each model carries its endpoint
in the dropdown hint).

## 2. Models

| Model | API | Notes |
| --- | --- | --- |
| `gemini-2.5-flash-preview-tts` | generateContent | **Default.** Fast, cheap, widest key compatibility. |
| `gemini-2.5-pro-preview-tts` | generateContent | Higher fidelity, slower. |
| `gemini-3.1-flash-tts-preview` | generateContent | Preview generation. |
| `gemini-3.8-flash-lite-tts` | Interactions | Current generation, free tier. |
| `gemini-3.8-flash-tts` | Interactions | Studio-grade fidelity. |

Any other model id can be typed in: custom ids are sent through
`generateContent` unless the catalogue knows better, and are not pre-validated.

**Retired model ids.** If Google answers 404 for the configured model, the
provider retries up to two documented fallbacks (bounded, logged) so voice
output keeps working instead of dying on a retired id. If every attempt fails,
the error says so and lists each attempt.

## 3. Voices

All 30 documented prebuilt studio voices are available:

`Zephyr` (Bright), `Puck` (Upbeat), `Charon` (Informative), `Kore` (Firm —
default), `Fenrir` (Excitable), `Leda` (Youthful), `Orus` (Firm), `Aoede`
(Breezy), `Callirrhoe` (Easy-going), `Autonoe` (Bright), `Enceladus` (Breathy),
`Iapetus` (Clear), `Umbriel` (Easy-going), `Algieba` (Smooth), `Despina`
(Smooth), `Erinome` (Clear), `Algenib` (Gravelly), `Rasalgethi` (Informative),
`Laomedeia` (Upbeat), `Achernar` (Soft), `Alnilam` (Firm), `Schedar` (Even),
`Gacrux` (Mature), `Pulcherrima` (Forward), `Achird` (Friendly),
`Zubenelgenubi` (Casual), `Vindemiatrix` (Gentle), `Sadachbia` (Lively),
`Sadaltager` (Knowledgeable), `Sulafat` (Warm).

A persona may override the voice (`AgentProfile.ttsVoiceId`); the provider-level
voice is the fallback.

## 4. Audio handling

| Source | Payload | What Ultron does |
| --- | --- | --- |
| 3.8 models (unary) | `audio/wav` — RIFF header, 24 kHz mono 16-bit | Used as-is |
| Preview models | `audio/L16;codec=pcm;rate=24000` — headerless PCM | RIFF header written at the reported rate |

The rate comes from the response, not from a constant: `utils/wav.ts` builds the
header, `parseAudioMime()` reads `rate=`. A WAV payload is detected by its magic
bytes even if the MIME type lies. Any other audio format is **rejected with a
clear error** rather than handed to the renderer mislabelled, because `<audio>`
would either fail silently or play noise.

The renderer therefore has a dedicated `wav` blob path alongside MP3 streaming
(ElevenLabs) and Ogg/Opus (Alice).

## 5. When it fails

Failures are printed in full to the terminal log — HTTP status, Google's
`error.status`, `error.message`, and `error.details`:

```
[ERROR] [GeminiTTSProvider] [Gemini TTS] gemini-2.5-flash-preview-tts via generateContent failed
[ERROR] [GeminiTTSProvider]   HTTP status : 400
[ERROR] [GeminiTTSProvider]   API status  : INVALID_ARGUMENT
[ERROR] [GeminiTTSProvider]   message     : Request contains an invalid argument.
[ERROR] [GeminiTTSProvider]   details     : [{"@type":"type.googleapis.com/google.rpc.BadRequest", ...}]
```

The user-facing message keeps the mapped, actionable sentence **and** appends
Google's own words (truncated), so the warning in the widget and the result in
Settings → Voice → *Test voice* both say something you can act on:

> Gemini rejected the request. Check the selected model and voice in Settings →
> Voice. — API key not valid. Please pass a valid API key.

| Signal | Mapped to |
| --- | --- |
| `API key not valid` / 401 | Authentication failed — check the key |
| 403 / `PERMISSION_DENIED` | Key rejected or lacks permission |
| 404 / `not found` | Model or voice unknown (triggers model fallback) |
| `RESOURCE_EXHAUSTED` / quota wording | Quota exhausted |
| 429 (rate) | Rate limit — resumes shortly |
| `fetch failed`, `ENOTFOUND` | Cannot reach Gemini — check connection |

A Gemini failure never falls back to another provider. ElevenLabs keeps its
previous behaviour (auto-disable on hard quota exhaustion); Gemini stays enabled
on a 429 because that is a per-minute limit, not an exhausted balance.

## 6. Deliberate limitations

- **Buffered, not streamed.** One complete utterance per reply, so playback
  starts after synthesis. The Interactions SSE variant is not exposed by the
  installed SDK version.
- **Single speaker.** Multi-speaker dialogue needs speaker-labelled
  `speech_config` plus a transcription config; the assistant speaks one line at
  a time.
- **No style padding.** Gemini 3.8 treats input as a verbatim transcript and
  expects performance notes in `speech_metadata.style`; Ultron deliberately
  sends plain text so the assistant never reads stage directions aloud.
- **Cost is not hard-coded.** Paid usage is billed per audio token; see the
  pricing page for current rates. Both 3.8 models include a free tier.
