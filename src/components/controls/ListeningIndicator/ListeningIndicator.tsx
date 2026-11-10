import { defineComponent } from 'vue'
import './ListeningIndicator.css'

/**
 * ListeningIndicator — small persistent badge that shows whether the
 * microphone is capturing audio.
 *
 * Deliberately separate from the microphone button: it stays visible when the
 * widget is collapsed or busy with another view, so the user can always tell
 * at a glance that Ultron is listening.
 *
 * Renders nothing when the microphone is off.
 */
export default defineComponent({
  name: 'ListeningIndicator',

  props: {
    /** Microphone is capturing audio */
    active: { type: Boolean, default: false },
    /** Screen side the widget is anchored to */
    positionSide: { type: String, default: 'right' },
  },

  render() {
    if (!this.active) return null

    return (
      <div
        class={['listening-indicator', `listening-indicator--${this.positionSide}`]}
        role="status"
        aria-live="polite"
        aria-label="Microphone is on — Ultron is listening"
      >
        <span class="listening-indicator__dot" aria-hidden="true" />
        <span class="listening-indicator__label">Listening</span>
      </div>
    )
  },
})
