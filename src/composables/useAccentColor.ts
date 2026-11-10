import { onMounted, onUnmounted } from 'vue'
import { api } from '@/api'

/**
 * useAccentColor — keeps the CSS accent custom properties in sync with the
 * configured accent source (`ui.accent`):
 *
 * - `ultron` (default): the fixed Ultron crimson identity
 * - `system`: the OS accent colour, as before
 *
 * Hue interpolation takes the shortest path around the 360° wheel
 * to avoid "disco" when jumping between distant hues (e.g. yellow → pink).
 */

/** Ultron crimson — must match the `html` defaults in index.css */
export const ULTRON_ACCENT = { h: 352, s: 72, l: 42 }

type AccentSource = 'ultron' | 'system'

export function useAccentColor() {
  let unsubSystem: (() => void) | null = null
  let unsubConfig: (() => void) | null = null
  let current = { h: 352, s: 72, l: 42 }
  let source: AccentSource = 'ultron'
  let lastSystemAccent: { h: number; s: number; l: number } | null = null
  let animId = 0
  let debounceId = 0

  /** Write HSL values to CSS custom properties */
  function setVars(h: number, s: number, l: number) {
    const root = document.documentElement
    root.style.setProperty('--glass-accent-h', String(Math.round(((h % 360) + 360) % 360)))
    root.style.setProperty('--glass-accent-s', `${Math.round(Math.max(0, Math.min(100, s)))}%`)
    root.style.setProperty('--glass-accent-l', `${Math.round(Math.max(0, Math.min(100, l)))}%`)
  }

  /**
   * Compute shortest hue delta (handles wrap-around at 360°).
   * e.g. from 350 → 10 = +20 (not -340)
   */
  function shortestHueDelta(from: number, to: number): number {
    let delta = ((to - from) % 360 + 540) % 360 - 180
    return delta
  }

  /** Animate from current position to target over 600ms */
  function animate(target: { h: number; s: number; l: number }) {
    const from = { ...current }
    const hueDelta = shortestHueDelta(from.h, target.h)
    const duration = 600
    const start = performance.now()

    cancelAnimationFrame(animId)

    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1)
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3)

      const h = from.h + hueDelta * ease
      const s = from.s + (target.s - from.s) * ease
      const l = from.l + (target.l - from.l) * ease

      current = { h, s, l }
      setVars(h, s, l)

      if (t < 1) {
        animId = requestAnimationFrame(tick)
      }
    }

    animId = requestAnimationFrame(tick)
  }

  /** Apply the accent that matches the current source */
  function applyCurrentSource() {
    if (source === 'ultron') {
      animate(ULTRON_ACCENT)
    } else if (lastSystemAccent) {
      animate(lastSystemAccent)
    }
  }

  /** Debounced handler — Windows fires multiple events per change */
  function onAccentData(accent: { h: number; s: number; l: number }) {
    lastSystemAccent = accent
    if (source === 'ultron') return // identity accent wins until the user opts out

    clearTimeout(debounceId)
    debounceId = window.setTimeout(() => animate(accent), 100)
  }

  onMounted(async () => {
    unsubSystem = api.system.onAccentColorChange.subscribe(undefined, {
      onData: onAccentData,
    }).unsubscribe

    unsubConfig = api.settings.onConfigChange.subscribe(undefined, {
      onData(cfg: { ui: { accent?: AccentSource } }) {
        const next = cfg.ui.accent ?? 'ultron'
        if (next === source) return
        source = next
        applyCurrentSource()
      },
    }).unsubscribe

    try {
      const cfg = await api.settings.getConfig.query()
      source = cfg.ui.accent ?? 'ultron'
    } catch {
      source = 'ultron'
    }

    if (source === 'system' && !lastSystemAccent) {
      try {
        lastSystemAccent = await api.system.getAccentColor.query()
      } catch {
        // fall back to the identity accent
      }
    }

    applyCurrentSource()
  })

  onUnmounted(() => {
    unsubSystem?.()
    unsubConfig?.()
    cancelAnimationFrame(animId)
    clearTimeout(debounceId)
  })
}
