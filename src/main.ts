import './styles.css'
import { GameApp } from './game/gameApp'
import { readSave } from './domain/save'

const canvas = document.getElementById('gl') as HTMLCanvasElement
const banner = document.getElementById('err-banner') as HTMLElement

function showError(msg: string): void {
  banner.classList.remove('hidden')
  banner.textContent = msg
}

function isBenignLockError(reason: unknown): boolean {
  const msg = String(reason)
  return /pointer lock|WrongDocumentError|SecurityError|NotAllowedError/i.test(msg)
}

window.addEventListener('error', (e) => {
  showError(`Runtime error: ${e.message}`)
})

window.addEventListener('unhandledrejection', (e) => {
  if (isBenignLockError((e as PromiseRejectionEvent).reason)) {
    e.preventDefault()
    return
  }
  showError(`Async error: ${String((e as PromiseRejectionEvent).reason)}`)
})

function resize(): void {
  if (!window.__app) return
  const r = window.__app.renderer
  r.setSize(window.innerWidth, window.innerHeight)
  window.__app.camera.aspect = window.innerWidth / window.innerHeight
  window.__app.camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)

async function boot(): Promise<void> {
  const statusEl = document.getElementById('load-status')
  try {
    const app = await GameApp.create(canvas)
    window.__app = app
    ;(globalThis as unknown as { __app?: GameApp }).__app = app
    app.input.attach(canvas)
    resize()

    const title = document.getElementById('title-screen') as HTMLElement
    const btnNew = document.getElementById('btn-new') as HTMLButtonElement
    const btnContinue = document.getElementById('btn-continue') as HTMLButtonElement

    let hasSave = false
    try {
      hasSave = !!(await readSave())
    } catch {
      hasSave = false
    }
    btnContinue.disabled = !hasSave
    if (statusEl) statusEl.textContent = 'systems nominal — ready for crew'

    const launch = (fn: () => void | Promise<void>) => {
      void (async () => {
        try {
          app.audio.unlock()
          await fn()
          title.classList.add('gone')
          title.addEventListener('transitionend', () => title.classList.add('hidden'), { once: true })
          app.input.requestLock()
        } catch (err) {
          showError(String(err))
        }
      })()
    }

    btnNew.addEventListener('click', () => launch(() => app.startNewGame()))
    btnContinue.addEventListener('click', () => launch(() => app.startSavedGame()))

    const resume = document.getElementById('resume-overlay') as HTMLElement
    resume.addEventListener('click', () => {
      app.audio.unlock()
      app.input.requestLock()
    })
    document.addEventListener('pointerlockchange', () => {
      if (!app.started) return
      const locked = document.pointerLockElement === canvas
      app.hud.setPaused(!locked && !app.consoleUI.visible)
    })
  } catch (err) {
    if (statusEl) statusEl.textContent = 'boot failure — see console'
    showError(`Boot failed: ${String(err)}`)
    console.error(err)
  }
}

void boot()
