// ICV Perihelion — MCP server for LLM agents that play/QA the game.
//
// Owns a persistent phantom (headless) browser session with an in-page
// bridge: pointer lock is stubbed so the player's real mouse is NEVER
// touched, all input is synthesized inside the phantom.
//
// Tools: game_start, game_state, game_cmd, game_key, game_hold_e,
//        game_mouse, game_screenshot, game_logs, game_stop
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

function resolvePatchright() {
  const base = join(homedir(), '.vscode/extensions')
  const dirs = readdirSync(base)
    .filter((d) => d.startsWith('danielsanmedium.dscodegpt-'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!dirs.length) throw new Error('patchright not found in ~/.vscode/extensions')
  return createRequire(join(base, dirs[dirs.length - 1], 'standalone') + '/')('patchright')
}

const BRIDGE = () => {
  // PHANTOM MODE: pointer lock never reaches the real OS pointer.
  try {
    Element.prototype.requestPointerLock = function () { return Promise.resolve() }
    Document.prototype.exitPointerLock = function () {}
    Object.defineProperty(Document.prototype, 'pointerLockElement', {
      configurable: true,
      get() { return document.getElementById('gl') || null }
    })
    const fire = () => { try { document.dispatchEvent(new Event('pointerlockchange')) } catch {} }
    for (const t of [300, 1200, 2600, 4500, 7000]) setTimeout(fire, t)
  } catch {}
  window.addEventListener('error', (e) => {
    const d = document.documentElement
    if (d) d.dataset.errStack = ((e.error && e.error.stack) || e.message || 'unknown').slice(0, 900)
  }, true)
  const el = () => document.documentElement
  const mkv = (a) => (x, y, z) => new a.ship.anchors.spawnHub.constructor(x, y, z)
  const CMDS = {
    tp: (a, q) => { a.player.char.teleport({ x: +q[0], y: +q[1], z: +q[2] }); return 'tp ok' },
    face: (a, q) => {
      let t = a.ship.anchors[q[0]]
      if (!t && q[0] && q[0].startsWith('plot')) t = a.ship.plots[+q[0].slice(4)]?.anchor
      if (!t) return 'unknown anchor ' + q[0]
      return a.faceAnchor(mkv(a)(t.x, t.y, t.z))
    },
    aim: (a, q) => a.faceAnchor(mkv(a)(+q[0], +q[1], +q[2])),
    give: (a, q) => a.setItemInHand(q[0] ?? 'none'),
    break: (a, q) => a.debugBreak(q[0] ?? ''),
    fixall: (a) => { a.debugFixAll(); return 'fixed' },
    god: (a) => { a.godMode = !a.godMode; return 'god=' + a.godMode },
    suit: (a) => { a.setSuited(!a.suited); return 'suited=' + a.suited },
    time: (a, q) => { const [h, m] = q[0].split(':').map(Number); a.clock.setTimeOfDay(h * 3600 + m * 60); return 'time set' },
    sleep: async (a) => { await a.sleep(true); return 'day=' + a.clock.day },
    spawn: (a, q) => { a.spawnCrate(q.length > 1 ? +q[1] : 6); return 'spawned' },
    door: (a, q) => { const d = a.ship.doors.find((x) => x.id === q[0]); if (!d) return 'no door ' + q[0]; a.toggleDoor(d); return 'door ' + d.id + ' open=' + d.open },
    save: async (a) => { await a.save(); return 'saved' },
    ripen: (a) => { for (const s of a.garden.states) if (s.stage === 'growing') { s.t = 1; s.stage = 'ripe' } a.garden.visualSync(); return 'ripened' },
    resetup: (a) => { if (a.player.char.upSmooth) { a.player.char.upSmooth.set(0, 1, 0); return 'up reset' } return 'no upSmooth' },
    mira: (a) => { a.talkToMira(); return 'MIRA speaking' },
    cam: (a, q) => {
      if (q[0] === 'off') { a.photoCam = null; return 'photo cam off' }
      if (q.length < 6) return 'usage: cam x y z tx ty tz | cam off'
      const V = mkv(a)
      a.photoCam = { pos: V(+q[0], +q[1], +q[2]), target: V(+q[3], +q[4], +q[5]) }
      return 'photo cam set'
    },
    proplist: (a) => a.props.map((p, i) => `${i}:${[p.currP.x, p.currP.y, p.currP.z].map((n) => +n.toFixed(2)).join(',')} m${p.mass}`).join('; '),
    doorsinfo: (a) => a.ship.doors.map((d) => `${d.id}${d.open ? '[OPEN]' : ''}${d.locked ? '[LOCKED]' : ''}@${[d.closedPos.x, d.closedPos.y, d.closedPos.z].map((n) => +n.toFixed(1)).join(',')}`).join(' '),
    plots: (a) => a.ship.plots.map((p, i) => i + ':' + [p.anchor.x, p.anchor.y, p.anchor.z].map((n) => +n.toFixed(2)).join(',')).join('; ')
  }
  setInterval(() => {
    try {
      el().dataset.bridgeBeat = String(performance.now() | 0)
      const a = window.__app
      const raw = el().dataset.cmd
      if (raw && a) {
        delete el().dataset.cmd
        const bar = raw.indexOf('|')
        const seq = raw.slice(0, bar)
        const body = raw.slice(bar + 1)
        const sp = body.indexOf(' ')
        const name = sp < 0 ? body : body.slice(0, sp)
        const rest = sp < 0 ? '' : body.slice(sp + 1)
        const fn = CMDS[name]
        if (!fn) el().dataset.cmdOut = seq + '|' + JSON.stringify({ err: 'unknown cmd ' + name })
        else
          Promise.resolve(fn(a, rest ? rest.split(/\s+/) : []))
            .then((r) => { el().dataset.cmdOut = seq + '|' + JSON.stringify({ r: String(r) }) })
            .catch((e) => { el().dataset.cmdOut = seq + '|' + JSON.stringify({ err: String((e && e.message) || e) }) })
      }
      if (a && a.started) {
        const p = a.player.char.currPos
        const pr = document.getElementById('prompt')
        el().dataset.mirror = JSON.stringify({
          pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
          mode: a.player.char.mode, grounded: a.player.char.grounded,
          field: a.player.currentField ? a.player.currentField.id : null,
          g: +a.player.gMag.toFixed(2), vel: +a.player.char.vel.length().toFixed(2),
          yaw: +a.player.yaw.toFixed(2), pitch: +a.player.pitch.toFixed(2),
          day: a.clock.day, tod: +(a.clock.timeOfDay / 3600).toFixed(2),
          co2: +a.systems.co2Percent.toFixed(2), o2: +a.systems.o2Percent.toFixed(1),
          pwr: +a.systems.powerKWh.toFixed(3), press: +a.systems.pressureKPa.toFixed(1),
          water: +a.systems.waterLiters.toFixed(1), food: Math.round(a.systems.foodKcal),
          wing: a.systems.wingDamaged, hull: a.systems.hullPuncture,
          filtWear: +a.systems.scrubberFilterWear.toFixed(2), recInt: Math.round(a.systems.recyclerIntegrity),
          scrubOn: a.systems.scrubbersOnline, exMin: a.systems.exerciseMinutesToday,
          suited: a.suited, held: a.heldItem, god: a.godMode, airlock: a.airlockPhase,
          tasks: a.tasks.tasks.map((t) => (t.done ? '+' : '-') + t.id),
          hover: a.interaction.hover ? a.interaction.hover.id : null,
          holding: a.interaction.holding ? a.interaction.holding.entry.id + '@' + a.interaction.holding.t.toFixed(1) : null,
          prompt: pr.classList.contains('hidden') ? null : pr.textContent,
          props: a.props.length, grab: a.grabIdx >= 0 ? a.grabIdx : null,
          plots: a.garden.states.map((s) => s.stage + (s.watered ? '*' : '')).join(','),
          drone: a.companion ? [+a.companion.group.position.x.toFixed(2), +a.companion.group.position.y.toFixed(2), +a.companion.group.position.z.toFixed(2)] : null,
          dialog: a.companion && a.companion.dialogOpen ? 'open' : null,
          backend: a.renderer.backend, fps: a.loop.stats.fps | 0,
          errStack: el().dataset.errStack ? el().dataset.errStack.slice(0, 400) : null,
          locked: !!document.pointerLockElement,
          pausedHud: !document.getElementById('resume-overlay').classList.contains('hidden')
        })
      }
    } catch (e) { el().dataset.bridgeErr = String((e && e.message) || e) }
  }, 110)
}
const BRIDGE_SRC = '(' + BRIDGE.toString() + ')()'

class GameSession {
  ctx = null
  page = null
  cdp = null
  logs = []
  seq = 0
  url = 'http://localhost:4173/'

  async start(url, mode = 'new') {
    if (this.page) await this.stop()
    this.url = url || this.url
    const { chromium } = resolvePatchright()
    const browser = await chromium.launch({
      headless: true,
      channel: 'chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
    })
    this.ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    await this.ctx.addInitScript(BRIDGE_SRC)
    this.page = await this.ctx.newPage()
    this.page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') this.logs.push(`[${m.type()}] ${m.text().slice(0, 240)}`)
      if (this.logs.length > 200) this.logs.splice(0, this.logs.length - 200)
    })
    this.page.on('pageerror', (e) => this.logs.push('[uncaught] ' + String(e).slice(0, 240)))
    await this.page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await this.page
      .waitForFunction(() => (document.getElementById('load-status')?.textContent || '').includes('ready'), null, { timeout: 60000, polling: 200 })
      .catch(() => {})
    await this.page.locator(mode === 'continue' ? '#btn-continue' : '#btn-new').click()
    await this.waitForMirror(10000)
    return 'game started (' + mode + ') at ' + this.url
  }

  async waitForMirror(ms = 6000) {
    await this.page.waitForFunction(() => !!document.documentElement.dataset.mirror, null, { timeout: ms, polling: 100 })
  }

  async state() {
    if (!this.page) return { err: 'no session — call game_start first' }
    try {
      await this.waitForMirror(4000)
      const s = JSON.parse(await this.page.evaluate(() => document.documentElement.dataset.mirror))
      return s
    } catch (e) {
      return { err: 'mirror unavailable', bridgeErr: await this.page.evaluate(() => document.documentElement.dataset.bridgeErr || '').catch(() => '') }
    }
  }

  async cmd(body) {
    if (!this.page) return { err: 'no session' }
    const prev = await this.page.evaluate(() => document.documentElement.dataset.cmdOut || '')
    await this.page.evaluate(({ s, b }) => { document.documentElement.dataset.cmd = s + '|' + b }, { s: ++this.seq, b: body })
    try {
      await this.page.waitForFunction((p) => (document.documentElement.dataset.cmdOut || '').startsWith(p + '|'), this.seq, { timeout: 7000, polling: 55 })
    } catch {
      return { err: 'cmd timeout: ' + body }
    }
    const out = await this.page.evaluate(() => document.documentElement.dataset.cmdOut)
    return JSON.parse(out.split('|').slice(1).join('|'))
  }

  async key(key, holdMs = 100) {
    if (!this.page) return { err: 'no session' }
    await this.page.keyboard.down(key)
    await this.page.waitForTimeout(holdMs)
    await this.page.keyboard.up(key)
    return { pressed: key, holdMs }
  }

  async holdE(needSec) {
    if (!this.page) return { err: 'no session' }
    const before = await this.state()
    if (!before.hover) return { started: false, reason: 'nothing hovered', prompt: before.prompt ?? null }
    await this.page.keyboard.down('KeyE')
    let started = true
    try {
      await this.page.waitForFunction(
        `(() => { const m = document.documentElement.dataset.mirror; return m && !!JSON.parse(m).holding })()`,
        null, { timeout: 2600, polling: 90 }
      )
    } catch { started = false }
    if (!started) {
      await this.page.keyboard.up('KeyE')
      await this.page.waitForTimeout(400)
      return { started: false, reason: 'hold did not begin (instant interaction fired instead)', hover: before.hover }
    }
    let finished = true
    try {
      await this.page.waitForFunction(
        `(() => { const m = document.documentElement.dataset.mirror; return m && !JSON.parse(m).holding })()`,
        null, { timeout: needSec * 1000 + 3500, polling: 90 }
      )
    } catch { finished = false }
    await this.page.keyboard.up('KeyE')
    await this.page.waitForTimeout(450)
    const after = await this.state()
    return { started: true, finished, hover: before.hover, prompt: after.prompt, held: after.held }
  }

  async mouse(action, x = 640, y = 360) {
    if (!this.page) return { err: 'no session' }
    if (action === 'down') await this.page.mouse.down()
    else if (action === 'up') await this.page.mouse.up()
    else if (action === 'click') await this.page.mouse.click(x, y)
    else await this.page.mouse.move(x, y, { steps: 3 })
    return { action, x, y }
  }

  async screenshot() {
    if (!this.page) return { err: 'no session' }
    const buf = await this.page.screenshot({ type: 'png' })
    return { type: 'image', data: buf.toString('base64'), mimeType: 'image/png' }
  }

  async stop() {
    try { if (this.ctx) await this.ctx.close() } catch {}
    this.ctx = this.page = null
    return 'session closed'
  }
}

const session = new GameSession()

const TOOLS = [
  { name: 'game_start', description: 'Launch the game in the phantom browser and start playing. mode: "new" or "continue" (load save).', inputSchema: { type: 'object', properties: { url: { type: 'string' }, mode: { type: 'string', enum: ['new', 'continue'] } } } },
  { name: 'game_state', description: 'Full live game state: position, mode, gravity, ship systems (power/o2/co2/pressure/water/food), tasks, hover target, hold progress, garden plots, drone position, fps, any error stacks.', inputSchema: { type: 'object', properties: {} } },
  { name: 'game_cmd', description: 'Run an in-game bridge command. Commands: tp <x y z>, face <anchor>, aim <x y z>, give <item|none>, break <wing|hull|filter|recycler|surge>, fixall, god, suit, time <HH:MM>, sleep, spawn [mass], door <id>, save, ripen, resetup, mira, cam <x y z tx ty tz|off>, proplist, doorsinfo, plots', inputSchema: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] } },
  { name: 'game_key', description: 'Press a real keyboard key (e.g. KeyW, KeyE, Tab, Space, ShiftLeft). holdMs: how long to hold (default 100).', inputSchema: { type: 'object', properties: { key: { type: 'string' }, holdMs: { type: 'number' } }, required: ['key'] } },
  { name: 'game_hold_e', description: 'Press and HOLD E until the interaction completes (verified: waits for hold to start AND finish). Requires something hovered. Returns before/after state.', inputSchema: { type: 'object', properties: { needSec: { type: 'number' } }, required: ['needSec'] } },
  { name: 'game_mouse', description: 'Real mouse input: down/up/click/move. Coordinates in the 1280x720 viewport.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['down', 'up', 'click', 'move'] }, x: { type: 'number' }, y: { type: 'number' } }, required: ['action'] } },
  { name: 'game_screenshot', description: 'Capture the current frame as an image you can see. Use after cam/tp to inspect visuals.', inputSchema: { type: 'object', properties: {} } },
  { name: 'game_logs', description: 'Collected browser console errors/warnings and uncaught exceptions since session start.', inputSchema: { type: 'object', properties: {} } },
  { name: 'game_stop', description: 'Close the phantom session.', inputSchema: { type: 'object', properties: {} } }
]

const server = new Server(
  { name: 'perihelion-qa', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const a = req.params.arguments ?? {}
  try {
    let result
    switch (req.params.name) {
      case 'game_start': result = await session.start(a.url, a.mode ?? 'new'); break
      case 'game_state': result = await session.state(); break
      case 'game_cmd': result = await session.cmd(String(a.cmd ?? '')); break
      case 'game_key': result = await session.key(String(a.key), a.holdMs ?? 100); break
      case 'game_hold_e': result = await session.holdE(Number(a.needSec ?? 3)); break
      case 'game_mouse': result = await session.mouse(String(a.action), a.x, a.y); break
      case 'game_screenshot': {
        const shot = await session.screenshot()
        if (shot.type === 'image') {
          return { content: [{ type: 'image', data: shot.data, mimeType: shot.mimeType }] }
        }
        result = shot
        break
      }
      case 'game_logs': result = { logs: session.logs.slice(-40), count: session.logs.length }; break
      case 'game_stop': result = await session.stop(); break
      default: result = { err: 'unknown tool ' + req.params.name }
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ err: String((e && e.message) || e) }) }] }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('perihelion-qa MCP ready')
