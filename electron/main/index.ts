import * as path from 'node:path'
import * as fs from 'node:fs'
import { app, BrowserWindow, protocol, net } from 'electron'
import { ServiceRegistry } from './services/ServiceRegistry'
import { IntelligenceService } from './services/intelligence/IntelligenceService'
import { TTSService } from './services/tts/TTSService'
import { AgentService } from './services/agent/AgentService'
import { HotkeyService } from './services/hotkey/HotkeyService'
import { PersonaService } from './services/persona/PersonaService'
import { MemoryService } from './services/memory/MemoryService'
import { FactService } from './services/memory/FactService'
import { VisionService } from './services/vision/VisionService'
import { MotorService } from './services/motor/MotorService'
import { SearchService } from './services/search/SearchService'
import { STTService } from './services/stt/STTService'
import { setPersonaService } from './api/routers/personas.router'
import { setMemoryService } from './api/routers/memory.router'
import { setFactService } from './api/routers/facts.router'
import { setAgentService } from './api/routers/agent.router'
import { setSTTService } from './api/routers/audio.router'
import { setTTSService } from './api/routers/audio.router'
import { createLogger } from './utils/logger'
import { loadConfig } from './utils/config'
import { mainEventBus } from './utils/eventBus'
import { createWindow, toggleWindow, clearWindow } from './WindowManager'
import { createTray } from './TrayManager'

// Side-effect: sets process.env paths on import
import './utils/paths'

const log = createLogger('Main')

// ── Platform Setup ──

// Stable identity across dev and packaged builds ('atlas' before the fork)
app.setName('Ultron')

if (process.platform === 'win32') app.setAppUserModelId('com.bortknox.ultron')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

/**
 * Keep Atlas-era user data when the application is renamed.
 *
 * Electron derives `userData` from the app name, so renaming Atlas → Ultron
 * would otherwise point at a brand-new empty directory and silently forget
 * the user's config, personas, memory, facts, prompts and downloaded models.
 *
 * If the new directory does not exist yet but a previous one contains a
 * `Config` file (written by this app), the legacy directory is reused in
 * place — nothing is copied, moved or deleted.
 */
function preserveLegacyUserData(): void {
  try {
    const appData = app.getPath('appData')
    const current = path.join(appData, app.getName())

    if (fs.existsSync(current)) return

    for (const legacyName of ['Ultron', 'ultron', 'Atlas', 'atlas']) {
      const candidate = path.join(appData, legacyName)
      if (candidate === current) continue
      if (fs.existsSync(path.join(candidate, 'Config'))) {
        app.setPath('userData', candidate)
        return
      }
    }
  } catch {
    // Never block startup because of the migration probe
  }
}

preserveLegacyUserData()

// Register custom protocol for serving STT model files to renderer
protocol.registerSchemesAsPrivileged([
  { scheme: 'stt-model', privileges: { bypassCSP: true, supportFetchAPI: true } },
])

// ── Service Registry ──

const services = new ServiceRegistry()

// ── App Lifecycle ──

app.whenReady().then(async () => {
  log.info('Ultron starting...')

  loadConfig()

  // Serve STT model files to renderer via custom protocol (file:// is blocked)
  // URL format: stt-model://ru/am/final.mdl → {userData}/Models/stt/ru/am/final.mdl
  const sttModelsDir = path.join(app.getPath('userData'), 'Models', 'stt')
  protocol.handle('stt-model', (req) => {
    const relative = decodeURIComponent(req.url.slice('stt-model://'.length))
    const filePath = path.join(sttModelsDir, relative)
    return net.fetch(`file:///${filePath.replace(/\\/g, '/')}`)
  })

  // Register services (order matters: dependencies first)
  const intelligence = new IntelligenceService()
  const persona = new PersonaService()
  const memory = new MemoryService()
  const facts = new FactService()
  const tts = new TTSService()
  const vision = new VisionService(intelligence)
  const motor = new MotorService()
  const searchService = new SearchService()
  const stt = new STTService()

  // Wire cross-service dependencies
  persona.setMemoryService(memory)
  persona.setFactService(facts)
  tts.setPersonaService(persona)

  services.register('intelligence', intelligence)
  services.register('tts', tts)
  services.register('persona', persona)
  services.register('memory', memory)
  services.register('facts', facts)
  services.register('vision', vision)
  services.register('motor', motor)
  services.register('search', searchService)
  services.register('stt', stt)
  const agent = new AgentService(intelligence, persona, memory, facts, vision, motor, searchService)
  services.register('agent', agent)
  services.register('hotkey', new HotkeyService())

  // Wire services into tRPC routers
  setPersonaService(persona)
  setMemoryService(memory)
  setFactService(facts)
  setAgentService(agent)
  setSTTService(stt)
  setTTSService(tts)

  await services.initAll()
  await createWindow()
  createTray(persona)

  // Global hotkey → toggle window visibility
  mainEventBus.on('hotkey:toggle-atlas', () => toggleWindow())

  log.info('Ultron ready')
})

app.on('window-all-closed', () => {
  clearWindow()
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    const main = allWindows[0]
    if (main.isMinimized()) main.restore()
    main.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

app.on('before-quit', async () => {
  log.info('Shutting down services...')
  await services.disposeAll()
})

