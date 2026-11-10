# Gemini TTS in Ultron

How Ultron talks to Google Gemini for text-to-speech, which models and voices it
offers, and what the integration deliberately does **not** do.

Verified against the official documentation in November 2026:

- <https://ai.google.dev/gemini-api/docs/speech-generation>
- <https://ai.google.dev/gemini-api/docs/pricing>

---

## 1. Why the Interactions API

Gemini TTS moved to the **Interactions API**. Current models
(`gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`) are served by
`client.interactions.create()`; the older `generateContent` + `speechConfig`
shape belongs to the retired 2.5 preview API.

Ultron already depends on `@google/genai` (used by the intelligence engine), so
the TTS provider uses that same SDK and the same key-management path. No second
Google SDK, no dependency upgrade.

```ts
const interaction = await client.interactions.create({
  model: 'gemini-3.8-flash-lite-tts',
  input: [{ type: 'text', text }],
  response_modalities: ['audio'],
  response_format: { type: 'audio', mime_type: 'audio/wav' },
  generation_config: { speech_config: [{ voice: 'Kore' }] },
})
```

## 2. Supported models

| Model | Notes |
| --- | --- |
| `gemini-3.8-flash-lite-tts` | **Default.** Fastest and cheapest, free tier available. |
| `gemini-3.8-flash-tts` | Highest fidelity, slower, free tier available. |
| `gemini-3.1-flash-tts-preview` | Legacy preview, kept for compatibility. |
| `gemini-2.5-pro-preview-tts` | Legacy preview, kept for compatibility. |

The settings screen offers these four, plus a free-text field for any other
model id. Custom ids are **not** pre-validated — if Google rejects the id the
error is shown in the Voice tab and in the widget.

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

## 4. Audio format

| Request type | Payload | What Ultron does |
| --- | --- | --- |
| Unary (this integration) | `audio/wav` — 24 kHz, mono, 16-bit PCM with RIFF header | Played as-is |
| Streaming (not used) | `audio/l16` — headerless PCM | Wrapped in a WAV header (`utils/wav.ts`) |

Any other MIME type is **rejected with a clear error** rather than being handed
to the renderer mislabelled, because `<audio>` would either fail silently or
play noise.

The renderer therefore has a dedicated `wav` playback path (blob URL) alongside
the existing MP3 streaming (MediaSource) and Ogg/Opus (blob) paths.

## 5. Deliberate limitations

- **Buffered, not streamed.** The provider yields one complete utterance, so
  playback starts after synthesis finishes. Pretending to stream would mean
  inventing progress the API never reported. For streaming, the Interactions API
  requires the SSE variant, which the installed SDK does not expose yet.
- **Single speaker.** Multi-speaker dialogue needs a speaker-labelled
  `speech_config` and a transcription config; the assistant speaks one line at a
  time, so it is out of scope.
- **Long replies are spoken in full.** Very long text may be truncated or time
  out by the API; the provider logs a warning above 2 000 characters instead of
  silently cutting the sentence.

## 6. Cost control

- The Gemini key lives in `tts.providers.gemini.apiKey`, separate from the
  intelligence key, so TTS usage can be revoked or rate-limited independently.
- Spoken responses are toggled from the widget speaker button
  (`tts.enabled`) without touching the microphone.
- Both Gemini 3.8 TTS models include a free tier. Paid usage is billed per
  audio token — see the pricing page above for current rates, which are not
  hard-coded in this repository on purpose.

## 7. Error mapping

`utils/ttsErrors.ts` maps provider failures to actionable text:

| Signal | User-facing message |
| --- | --- |
| `API key not valid` / 401 | Authentication failed — check the key in Settings → Voice |
| 403 / `PERMISSION_DENIED` | Key rejected or lacks permission |
| 404 / `not found` | Model or voice not recognised |
| `RESOURCE_EXHAUSTED` / quota wording | Quota exhausted |
| 429 (rate) | Rate limit — resumes shortly |
| `fetch failed`, `ENOTFOUND` | Cannot reach Gemini — check connection |

A Gemini failure **never** falls back to another provider. ElevenLabs keeps its
previous behaviour (auto-disable on hard quota exhaustion); Gemini stays enabled
on a 429 because that is a per-minute limit, not an exhausted balance.
