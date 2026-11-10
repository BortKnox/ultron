import { defineComponent, ref, onMounted } from 'vue'
import { api } from '@/api'
import logoUrl from '../../../../build/icon.png'

/**
 * AboutTab — centered hero with big logo, version info, runtime details, links
 * and upstream attribution.
 */
export default defineComponent({
  name: 'AboutTab',

  props: {
    onClose: {
      type: Function,
      required: true,
    },
  },

  setup(props) {
    const info = ref<{ version: string; name: string; electron: string; chrome: string; node: string } | null>(null)

    onMounted(async () => {
      try {
        info.value = await api.settings.getAppVersion.query()
      } catch (err) {
        console.error('[AboutTab] Failed to load app info:', err)
      }
    })

    function openExternal(url: string) {
      props.onClose()
      api.system.openExternal.mutate({ url })
    }

    return { info, openExternal }
  },

  render() {
    return (
      <div class="about-page">
        {/* Hero section — centered vertically */}
        <div class="about-page__hero">
          <img class="about-page__logo" src={logoUrl} alt="Ultron" />
          <div class="about-page__name">Ultron</div>
          <div class="about-page__version">v{this.info?.version ?? '…'}</div>
          <div class="about-page__tagline">AI Desktop Agent</div>

          {/* Runtime pills inline  */}
          <div class="about-page__runtime">
            <span class="about-page__runtime-pill">
              Electron {this.info?.electron ?? '…'}
            </span>
            <span class="about-page__runtime-pill">
              Chromium {this.info?.chrome ?? '…'}
            </span>
            <span class="about-page__runtime-pill">
              Node {this.info?.node ?? '…'}
            </span>
          </div>
        </div>

        {/* Links row */}
        <div class="about-page__links">
          <button class="about-page__link" onClick={() => this.openExternal('https://github.com/BortKnox/ultron')}>
            <span class="about-page__link-icon">code</span>
            Source Code
          </button>
          <button class="about-page__link" onClick={() => this.openExternal('https://github.com/BortKnox/ultron/issues')}>
            <span class="about-page__link-icon">bug_report</span>
            Report Bug
          </button>
          <button class="about-page__link" onClick={() => this.openExternal('https://github.com/BortKnox/ultron/releases')}>
            <span class="about-page__link-icon">new_releases</span>
            Releases
          </button>
        </div>

        {/* Upstream attribution — required by the Apache-2.0 license */}
        <div class="about-page__attribution">
          Built on{' '}
          <button class="voice-link-btn" onClick={() => this.openExternal('https://github.com/dortanes/atlas')}>
            Atlas
          </button>{' '}
          by dortanes. Licensed under Apache-2.0.
        </div>
      </div>
    )
  },
})
