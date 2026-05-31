import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, unlinkSync, readlinkSync } from 'fs'
import { initDb } from './db'
import { registerIpcHandlers } from './ipc'
import { initInputSystem, destroyInputSystem } from './input/evdev'
import { getSettings } from './services/settings.service'

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

const LOCK_FILE = join(app.getPath('userData'), 'app.lock')

function isElectronProcess(pid: number): boolean {
  try {
    const exe = readlinkSync(`/proc/${pid}/exe`)
    return exe === process.execPath
  } catch {
    return false
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

    // Alive and is our process - kill immediately (dev reload needs speed)
    try {
      process.kill(pid, 'SIGKILL')
      console.log(`[lock] Sent SIGKILL to stale process ${pid}`)
    } catch {
      // ignore
    }

    // Brief busy-wait so the OS reaps the PID before requestSingleInstanceLock
    const start = Date.now()
    while (Date.now() - start < 500) {
      try {
        process.kill(pid, 0)
        // still alive
      } catch {
        console.log(`[lock] Stale process ${pid} reaped`)
        break
      }
    }
  } catch {
    // ignore
  }
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

app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('enable-accelerated-video-decode')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder')

let mainWindow: BrowserWindow | null = null

async function createWindow(): Promise<void> {
  await initDb()
  const settings = await getSettings()

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
    await initInputSystem(mainWindow)
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
}

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
