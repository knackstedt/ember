import { parentPort } from 'worker_threads'
import { scanSteamGames } from '../scanners/steam.scanner'
import { scanDolphinGames } from '../scanners/dolphin.scanner'
import { scanDesktopGames } from '../scanners/desktop.scanner'
import { scanHeroicGames, scanLutrisGames } from '../scanners/heroic.scanner'

parentPort?.once('message', (extraPaths?: string[]) => {
  try {
    parentPort?.postMessage({ type: 'progress', scanner: 'steam', current: 0, total: 0, status: 'scanning' })
    const steam = scanSteamGames()
    parentPort?.postMessage({ type: 'progress', scanner: 'steam', current: steam.length, total: steam.length, status: 'done' })

    parentPort?.postMessage({ type: 'progress', scanner: 'dolphin', current: 0, total: 0, status: 'scanning' })
    const dolphin = scanDolphinGames(extraPaths)
    parentPort?.postMessage({ type: 'progress', scanner: 'dolphin', current: dolphin.length, total: dolphin.length, status: 'done' })

    const heroic = scanHeroicGames()
    const lutris = scanLutrisGames()
    const desktop = scanDesktopGames()

    parentPort?.postMessage({ type: 'result', games: [...steam, ...dolphin, ...heroic, ...lutris, ...desktop] })
  } catch (err) {
    parentPort?.postMessage({ type: 'error', error: (err as Error).message })
  }
})
