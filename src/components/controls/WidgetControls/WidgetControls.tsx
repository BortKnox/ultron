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
 * The microphone is never a dead button: when voice input is switched off in
 * Settings it renders dormant but stays clickable, because clicking it is the
 * shortest way to turn capture on. Only an in-flight start (`micBusy`)
 * disables it, and that state is announced through `aria-busy`.
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
    /** Voice input is allowed by Settings (dormant, still clickable, when false) */
    micAvailable: { type: Boolean, default: true },
    /** Spoken responses are enabled */
    speechEnabled: { type: Boolean, default: true },
    /** Model is loading / permission prompt is open */
    micBusy: { type: Boolean, default: false },
    /** Tooltip explaining the current microphone state */
    micHint: { type: String, default: '' },
  },

  emits: ['toggleMic', 'toggleSpeech', 'openSettings'],

  render() {
    const micLabel = this.micActive
      ? 'Stop listening'
      : this.micAvailable
        ? 'Start listening'
        : 'Enable voice input'

    const micTitle = this.micBusy
      ? 'Starting microphone…'
      : this.micHint || micLabel

    const speechLabel = this.speechEnabled ? 'Mute spoken responses' : 'Enable spoken responses'

    return (
      <div class="widget-controls" role="toolbar" aria-label="Assistant controls">
        {/* Microphone — controls capture */}
        <button
          type="button"
          class={[
            'widget-controls__btn',
            this.micActive && 'widget-controls__btn--active',
            !this.micActive && !this.micAvailable && 'widget-controls__btn--dormant',
            this.micBusy && 'widget-controls__btn--busy',
          ]}
          aria-pressed={this.micActive}
          aria-busy={this.micBusy}
          aria-disabled={this.micBusy}
          aria-label={micLabel}
          title={micTitle}
          disabled={this.micBusy}
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
              this.micBusy && 'widget-controls__dot--busy',
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
