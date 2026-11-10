import { defineComponent } from 'vue'
import './WidgetControls.css'

/**
 * WidgetControls — the floating widget's primary interaction switches.
 *
 * Two **independent** controls sit side by side:
 * - Microphone: starts/stops real microphone capture. State mirrors the
 *   audio pipeline (`micActive`), never a local UI boolean.
 * - Spoken responses: enables/disables voice output. Turning it off only
 *   mutes speech — text responses, listening and commands keep working.
 *
 * Plus a shortcut into Settings, so the user never has to leave the widget
 * to reconfigure the assistant.
 *
 * Accessibility: real `<button>` elements, `aria-pressed`, accessible labels,
 * keyboard focus rings, and state communicated by icon + label + shape
 * (never colour alone).
 */
export default defineComponent({
  name: 'WidgetControls',

  props: {
    /** Microphone is actually capturing audio */
    micActive: { type: Boolean, default: false },
    /** Voice input is allowed by Settings (mic button is inert when false) */
    micAvailable: { type: Boolean, default: true },
    /** Spoken responses are enabled */
    speechEnabled: { type: Boolean, default: true },
    /** Model is loading / permission prompt is open */
    micBusy: { type: Boolean, default: false },
    /** Tooltip explaining why the mic is unavailable */
    micHint: { type: String, default: '' },
  },

  emits: ['toggleMic', 'toggleSpeech', 'openSettings'],

  render() {
    const micLabel = this.micActive ? 'Stop listening' : 'Start listening'
    const speechLabel = this.speechEnabled ? 'Mute spoken responses' : 'Enable spoken responses'

    return (
      <div class="widget-controls" role="toolbar" aria-label="Assistant controls">
        {/* Microphone — controls capture */}
        <button
          type="button"
          class={[
            'widget-controls__btn',
            this.micActive && 'widget-controls__btn--active',
            !this.micAvailable && 'widget-controls__btn--disabled',
            this.micBusy && 'widget-controls__btn--busy',
          ]}
          aria-pressed={this.micActive}
          aria-label={this.micAvailable ? micLabel : 'Voice input disabled in Settings'}
          title={
            !this.micAvailable
              ? (this.micHint || 'Voice input is disabled in Settings → Voice')
              : micLabel
          }
          disabled={!this.micAvailable || this.micBusy}
          onClick={() => this.$emit('toggleMic')}
        >
          <span class="material-symbols-rounded widget-controls__icon">
            {this.micActive ? 'mic' : 'mic_off'}
          </span>
          {/* Persistent state dot — visible even when the icon is ambiguous */}
          <span
            class={[
              'widget-controls__dot',
              this.micActive && 'widget-controls__dot--live',
            ]}
            aria-hidden="true"
          />
        </button>

        {/* Spoken responses — controls TTS only */}
        <button
          type="button"
          class={[
            'widget-controls__btn',
            this.speechEnabled && 'widget-controls__btn--active',
          ]}
          aria-pressed={this.speechEnabled}
          aria-label={speechLabel}
          title={speechLabel}
          onClick={() => this.$emit('toggleSpeech')}
        >
          <span class="material-symbols-rounded widget-controls__icon">
            {this.speechEnabled ? 'volume_up' : 'volume_off'}
          </span>
        </button>

        <span class="widget-controls__divider" aria-hidden="true" />

        {/* Settings shortcut */}
        <button
          type="button"
          class="widget-controls__btn widget-controls__btn--ghost"
          aria-label="Open settings"
          title="Open settings"
          onClick={() => this.$emit('openSettings')}
        >
          <span class="material-symbols-rounded widget-controls__icon">settings</span>
        </button>
      </div>
    )
  },
})
