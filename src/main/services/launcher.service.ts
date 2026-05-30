import { spawn, ChildProcess } from 'child_process'
import { Game, Movie, MusicTrack } from '../../shared/types'

const activeProcesses = new Map<string, ChildProcess>()

export function launchGame(game: Game): void {
  if (!game.execPath && !game.romPath) {
    throw new Error(`No executable or ROM path for game: ${game.title}`)
  }

  let cmd: string
  let args: string[]

  switch (game.platform) {
    case 'steam':
      cmd = 'xdg-open'
      args = [`steam://rungameid/${game.steamAppId}`]
      break
    case 'dolphin-gc':
    case 'dolphin-wii':
      cmd = 'dolphin-emu'
      args = ['--exec', game.romPath!]
      break
    case 'flash':
      // Handled via webview in renderer
      return
    default:
      if (game.execPath) {
        const parts = game.execPath.split(' ')
        cmd = parts[0]
        args = parts.slice(1)
      } else {
        throw new Error(`Cannot launch game: ${game.title}`)
      }
  }

  const proc = spawn(cmd, args, {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env }
  })

  proc.unref()
  activeProcesses.set(game.id, proc)

  proc.on('exit', () => {
    activeProcesses.delete(game.id)
  })
}

export function launchMovie(movie: Movie): void {
  const proc = spawn('xdg-open', [movie.filePath], {
    detached: true,
    stdio: 'ignore'
  })
  proc.unref()
}

export function launchTrack(track: MusicTrack): void {
  const proc = spawn('xdg-open', [track.filePath], {
    detached: true,
    stdio: 'ignore'
  })
  proc.unref()
}
