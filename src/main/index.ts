import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { initDb } from './db'
import { registerIpcHandlers } from './ipc'
import { initInputSystem, destroyInputSystem } from './input/evdev'
import { getSettings } from './services/settings.service'

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

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

app.whenReady().then(() => {
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
