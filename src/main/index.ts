import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { initDb } from './db'
import { registerIpcHandlers } from './ipc'
import { initInputSystem, destroyInputSystem } from './input/evdev'
import { getSettings } from './services/settings.service'

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

const LOCK_FILE = join(app.getPath('userData'), 'app.lock')

function isElectronProcess(pid: number): boolean {
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ')
    return cmdline.includes('electron')
  } catch {
    return false
  }
}

async function killStaleProcess(pid: number): Promise<void> {
  if (!isElectronProcess(pid)) {
    console.log(`[lock] PID ${pid} is not an Electron process, skipping`)
    return
  }

  console.log(`[lock] Killing stale Electron process ${pid}`)
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return
  }

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 100))
    try {
      process.kill(pid, 0)
    } catch {
      console.log(`[lock] Stale process ${pid} exited gracefully`)
      return
    }
  }

  try {
    process.kill(pid, 'SIGKILL')
    console.log(`[lock] Force-killed stale process ${pid}`)
  } catch {
    // Already gone
  }
}

async function acquireInstanceLock(): Promise<void> {
  if (existsSync(LOCK_FILE)) {
    try {
      const oldPid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10)
      if (oldPid && oldPid !== process.pid) {
        await killStaleProcess(oldPid)
      }
    } catch (err) {
      console.warn('[lock] Failed to read lock file:', err)
    }
  }

  try {
    writeFileSync(LOCK_FILE, String(process.pid))
  } catch (err) {
    console.warn('[lock] Failed to write lock file:', err)
  }
}

function releaseInstanceLock(): void {
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

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('[lock] Another instance is already running, quitting')
  app.quit()
}

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
  await acquireInstanceLock()
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
