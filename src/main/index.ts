import { app, BrowserWindow, shell, protocol } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, unlinkSync, readlinkSync, readdirSync } from 'fs'
import { initDb } from './db'
import { registerIpcHandlers } from './ipc'
import { initInputSystem, destroyInputSystem } from './input/evdev'
import { getSettings } from './services/settings.service'

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

const LOCK_FILE = join(app.getPath('userData'), 'app.lock')
const STARTUP_DEADLINE_MS = 20000

function isElectronProcess(pid: number): boolean {
  try {
    const exe = readlinkSync(`/proc/${pid}/exe`)
    return exe === process.execPath
  } catch {
    return false
  }
}

function getProcessCmdline(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ')
  } catch {
    return ''
  }
}

function killProcessTree(pid: number, signal: NodeJS.Signals | number): void {
  try {
    const children: number[] = []
    const entries = readdirSync('/proc')
    for (const entry of entries) {
      const childPid = parseInt(entry, 10)
      if (isNaN(childPid)) continue
      try {
        const stat = readFileSync(`/proc/${childPid}/stat`, 'utf-8')
        const match = stat.match(/^\d+\s+\([^)]*\)\s+\S+\s+(\d+)/)
        if (match && parseInt(match[1], 10) === pid) {
          children.push(childPid)
        }
      } catch {
        // ignore
      }
    }
    for (const cpid of children) {
      try { process.kill(cpid, signal) } catch { /* ignore */ }
    }
    try { process.kill(pid, signal) } catch { /* ignore */ }
  } catch {
    // ignore
  }
}

function killAllStaleElectronProcesses(): void {
  try {
    const entries = readdirSync('/proc')
    for (const entry of entries) {
      const pid = parseInt(entry, 10)
      if (isNaN(pid) || pid === process.pid) continue
      if (!isElectronProcess(pid)) continue
      const cmdline = getProcessCmdline(pid)
      const isOurApp = cmdline.includes('htpc') || cmdline.includes('out/main') || cmdline.includes('app.lock')
      if (isOurApp) {
        console.log(`[lock] Killing stale Electron PID ${pid}`)
        killProcessTree(pid, 'SIGKILL')
      }
    }
  } catch {
    // ignore
  }
}

function syncCleanupStaleLock(): void {
  if (!existsSync(LOCK_FILE)) return
  try {
    const pid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10)
    if (!pid || pid === process.pid) return

    let alive = false
    try {
      process.kill(pid, 0)
      alive = true
    } catch {
      alive = false
    }

    if (!alive) {
      console.log(`[lock] Removing stale lockfile for dead PID ${pid}`)
      unlinkSync(LOCK_FILE)
      return
    }

    try {
      const exe = readlinkSync(`/proc/${pid}/exe`)
      if (exe !== process.execPath) {
        console.log(`[lock] Removing stale lockfile for reused PID ${pid}`)
        unlinkSync(LOCK_FILE)
        return
      }
    } catch {
      unlinkSync(LOCK_FILE)
      return
    }

    // Alive and is our process - kill entire tree immediately (dev reload needs speed)
    console.log(`[lock] Killing stale process tree for PID ${pid}`)
    killProcessTree(pid, 'SIGKILL')
  } catch {
    // ignore
  }
}

// Dev mode: be absolutely sure no stale processes exist before we even try locking
if (isDev) {
  killAllStaleElectronProcesses()
}
syncCleanupStaleLock()

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('[lock] Another instance is already running, exiting')
  app.exit(1)
}

let hasLock = false

function releaseInstanceLock(): void {
  if (!hasLock) return
  try {
    if (existsSync(LOCK_FILE)) {
      const pid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10)
      if (pid === process.pid) {
        unlinkSync(LOCK_FILE)
      }
    }
  } catch {
    // Ignore
  }
}

process.on('SIGINT', () => {
  console.log('[lock] SIGINT received, cleaning up lockfile')
  releaseInstanceLock()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[lock] SIGTERM received, cleaning up lockfile')
  releaseInstanceLock()
  process.exit(0)
})

if (isDev) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-setuid-sandbox')
} else {
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-zero-copy')
  app.commandLine.appendSwitch('enable-accelerated-video-decode')
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder')
}

let mainWindow: BrowserWindow | null = null

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ])
}

async function createWindow(): Promise<void> {
  const startupDeadline = setTimeout(() => {
    console.error(`[startup] FATAL: Window creation exceeded ${STARTUP_DEADLINE_MS}ms. Aborting.`)
    process.exit(1)
  }, STARTUP_DEADLINE_MS)

  try {
    await withTimeout(initDb(), 8000, 'initDb')
    const settings = await withTimeout(getSettings(), 3000, 'getSettings')

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      show: false,
      fullscreen: settings.fullscreen ?? false,
      backgroundColor: '#000000',
      frame: !settings.fullscreen,
      titleBarStyle: settings.fullscreen ? 'hidden' : 'default',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        webviewTag: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    mainWindow.on('ready-to-show', () => {
      mainWindow?.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    registerIpcHandlers(mainWindow)

    try {
      await withTimeout(initInputSystem(mainWindow), 5000, 'initInputSystem')
    } catch (err) {
      console.warn('[input] evdev init failed (user may not be in input group):', err)
    }

    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } finally {
    clearTimeout(startupDeadline)
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'htpc-thumb', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
])

app.whenReady().then(async () => {
  if (!gotTheLock) {
    console.log('[lock] Skipping window creation (no lock)')
    return
  }

  try {
    writeFileSync(LOCK_FILE, String(process.pid))
  } catch (err) {
    console.warn('[lock] Failed to write lock file:', err)
  }
  hasLock = true

  app.setAppUserModelId('com.htpc.app')

  protocol.handle('htpc-thumb', async (request) => {
    const url = new URL(request.url)
    let pathname = decodeURIComponent(url.hostname + url.pathname)
    if (pathname.startsWith('/')) pathname = pathname.slice(1)
    if (pathname.includes('..')) {
      return new Response('Forbidden', { status: 403 })
    }
    const filePath = join(app.getPath('userData'), 'thumbnails', pathname)
    console.log('[protocol] htpc-thumb request:', request.url, '→', filePath)
    try {
      const data = readFileSync(filePath)
      const ext = pathname.toLowerCase().slice(pathname.lastIndexOf('.'))
      let contentType = 'application/octet-stream'
      if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg'
      else if (ext === '.png') contentType = 'image/png'
      else if (ext === '.svg') contentType = 'image/svg+xml'
      else if (ext === '.webp') contentType = 'image/webp'
      console.log('[protocol] serving', filePath, 'size:', data.length, 'type:', contentType)
      return new Response(new Uint8Array(data), { headers: { 'Content-Type': contentType } })
    } catch {
      console.warn('[protocol] file not found:', filePath)
      return new Response('Not Found', { status: 404 })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await destroyInputSystem()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  releaseInstanceLock()
})
