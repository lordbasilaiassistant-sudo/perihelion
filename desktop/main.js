// ICV Perihelion — desktop wrapper.
// Serves the compiled game from ./dist on a random localhost port and opens
// it in a frameless Chromium window. WebGPU when available, WebGL2 fallback
// (same as the browser build).
const { app, BrowserWindow, Menu } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')

const DIST = path.join(__dirname, 'dist')
const PORT = 41740 + Math.floor(Math.random() * 2000)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2'
}

const server = http.createServer((req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    let file = path.normalize(path.join(DIST, url))
    if (!file.startsWith(DIST)) {
      res.writeHead(403)
      res.end()
      return
    }
    if (url === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
    const ext = path.extname(file).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  } catch {
    res.writeHead(500)
    res.end()
  }
})

function createWindow() {
  Menu.setApplicationMenu(null)
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'ICV PERIHELION',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadURL(`http://127.0.0.1:${PORT}/`)
}

app.whenReady().then(() => {
  server.listen(PORT, '127.0.0.1', () => {
    createWindow()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  server.close()
  app.quit()
})
