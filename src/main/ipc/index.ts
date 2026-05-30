import { BrowserWindow, ipcMain, app } from 'electron'
import { getSettings, setSettings, setSetting } from '../services/settings.service'
import { launchGame, launchMovie, launchTrack } from '../services/launcher.service'
import { scanSteamGames } from '../scanners/steam.scanner'
import { scanDolphinGames } from '../scanners/dolphin.scanner'
import { scanDesktopGames } from '../scanners/desktop.scanner'
import { scanHeroicGames, scanLutrisGames } from '../scanners/heroic.scanner'
import { scanMusicFiles } from '../scanners/music.scanner'
import { scanMovieFiles, scanTvShows } from '../scanners/video.scanner'
import { getDb } from '../db'
import { getProtonRating } from '../services/protondb.service'
import { searchGame } from '../services/rawg.service'
import { searchMovie, searchShow } from '../services/tmdb.service'
import { listPlugins, reloadPlugins } from '../plugins/loader'
import { getConnectedDevices } from '../input/evdev'
import { Game, Movie, MusicTrack, TVShow, AppSettings } from '../../shared/types'

export function registerIpcHandlers(window: BrowserWindow): void {
  ipcMain.handle('settings:get', async () => {
    return await getSettings()
  })

  ipcMain.handle('settings:set', async (_e, partial: Partial<AppSettings>) => {
    await setSettings(partial)
    if ('fullscreen' in partial) {
      window.setFullScreen(partial.fullscreen ?? false)
    }
  })

  ipcMain.handle('app:fullscreen', (_e, value: boolean) => {
    window.setFullScreen(value)
    setSetting('fullscreen', value)
  })

  ipcMain.handle('app:quit', () => {
    app.quit()
  })

  ipcMain.handle('games:scan', async (_e, extraPaths?: string[]) => {
    window.webContents.send('scan:progress', { scanner: 'steam', current: 0, total: 0, status: 'scanning' })
    const steam = scanSteamGames()
    window.webContents.send('scan:progress', { scanner: 'steam', current: steam.length, total: steam.length, status: 'done' })

    window.webContents.send('scan:progress', { scanner: 'dolphin', current: 0, total: 0, status: 'scanning' })
    const dolphin = scanDolphinGames(extraPaths)
    window.webContents.send('scan:progress', { scanner: 'dolphin', current: dolphin.length, total: dolphin.length, status: 'done' })

    const heroic = scanHeroicGames()
    const lutris = scanLutrisGames()
    const desktop = scanDesktopGames()

    const all = [...steam, ...dolphin, ...heroic, ...lutris, ...desktop]

    const db = getDb()
    for (const game of all) {
      await db.query(
        `UPSERT game:⟨${game.id}⟩ CONTENT $game`,
        { game }
      )
    }

    return all
  })

  ipcMain.handle('games:list', async () => {
    const db = getDb()
    const result = await db.query<[Game[]]>('SELECT * FROM game ORDER BY title ASC')
    return result[0] ?? []
  })

  ipcMain.handle('games:launch', (_e, game: Game) => {
    launchGame(game)
  })

  ipcMain.handle('games:favorite', async (_e, id: string, value: boolean) => {
    const db = getDb()
    await db.query(`UPDATE game:⟨${id}⟩ SET isFavorite = $value`, { value })
  })

  ipcMain.handle('games:tag', async (_e, id: string, tags: string[]) => {
    const db = getDb()
    await db.query(`UPDATE game:⟨${id}⟩ SET tags = $tags`, { tags })
  })

  ipcMain.handle('games:metadata', async (_e, title: string, steamAppId?: number) => {
    const settings = await getSettings()
    const [rawg, proton] = await Promise.all([
      searchGame(title, settings.rawgApiKey),
      steamAppId ? getProtonRating(steamAppId) : Promise.resolve('unknown')
    ])
    return { rawg, proton }
  })

  ipcMain.handle('movies:scan', async (_e, extraPaths?: string[]) => {
    window.webContents.send('scan:progress', { scanner: 'movies', current: 0, total: 0, status: 'scanning' })
    const movies = await scanMovieFiles(extraPaths)
    const db = getDb()
    for (const movie of movies) {
      await db.query(`UPSERT movie:⟨${movie.id}⟩ CONTENT $movie`, { movie })
    }
    window.webContents.send('scan:progress', { scanner: 'movies', current: movies.length, total: movies.length, status: 'done' })
    return movies
  })

  ipcMain.handle('movies:list', async () => {
    const db = getDb()
    const result = await db.query<[Movie[]]>('SELECT * FROM movie ORDER BY title ASC')
    return result[0] ?? []
  })

  ipcMain.handle('movies:launch', (_e, movie: Movie) => {
    launchMovie(movie)
  })

  ipcMain.handle('movies:favorite', async (_e, id: string, value: boolean) => {
    const db = getDb()
    await db.query(`UPDATE movie:⟨${id}⟩ SET isFavorite = $value`, { value })
  })

  ipcMain.handle('movies:metadata', async (_e, title: string) => {
    const settings = await getSettings()
    return await searchMovie(title, settings.tmdbApiKey)
  })

  ipcMain.handle('music:scan', async (_e, extraPaths?: string[]) => {
    window.webContents.send('scan:progress', { scanner: 'music', current: 0, total: 0, status: 'scanning' })
    const tracks = await scanMusicFiles(extraPaths)
    const db = getDb()
    for (const track of tracks) {
      await db.query(`UPSERT music_track:⟨${track.id}⟩ CONTENT $track`, { track })
    }
    window.webContents.send('scan:progress', { scanner: 'music', current: tracks.length, total: tracks.length, status: 'done' })
    return tracks
  })

  ipcMain.handle('music:list', async () => {
    const db = getDb()
    const result = await db.query<[MusicTrack[]]>('SELECT * FROM music_track ORDER BY artist, album, trackNumber ASC')
    return result[0] ?? []
  })

  ipcMain.handle('music:launch', (_e, track: MusicTrack) => {
    launchTrack(track)
  })

  ipcMain.handle('music:favorite', async (_e, id: string, value: boolean) => {
    const db = getDb()
    await db.query(`UPDATE music_track:⟨${id}⟩ SET isFavorite = $value`, { value })
  })

  ipcMain.handle('tv:scan', async (_e, extraPaths?: string[]) => {
    window.webContents.send('scan:progress', { scanner: 'tv', current: 0, total: 0, status: 'scanning' })
    const shows = await scanTvShows(extraPaths)
    const db = getDb()
    for (const show of shows) {
      await db.query(`UPSERT tv_show:⟨${show.id}⟩ CONTENT $show`, { show })
    }
    window.webContents.send('scan:progress', { scanner: 'tv', current: shows.length, total: shows.length, status: 'done' })
    return shows
  })

  ipcMain.handle('tv:list', async () => {
    const db = getDb()
    const result = await db.query<[TVShow[]]>('SELECT * FROM tv_show ORDER BY title ASC')
    return result[0] ?? []
  })

  ipcMain.handle('tv:launch', (_e, filePath: string) => {
    launchMovie({ id: '', title: '', filePath } as Movie)
  })

  ipcMain.handle('tv:favorite', async (_e, id: string, value: boolean) => {
    const db = getDb()
    await db.query(`UPDATE tv_show:⟨${id}⟩ SET isFavorite = $value`, { value })
  })

  ipcMain.handle('tv:metadata', async (_e, title: string) => {
    const settings = await getSettings()
    return await searchShow(title, settings.tmdbApiKey)
  })

  ipcMain.handle('input:devices', () => {
    return getConnectedDevices()
  })

  ipcMain.handle('input:mappings:get', async (_e, deviceId: string) => {
    const db = getDb()
    const result = await db.query(
      'SELECT * FROM controller_mapping WHERE deviceId = $deviceId',
      { deviceId }
    )
    return result[0] ?? []
  })

  ipcMain.handle('input:mappings:set', async (_e, deviceId: string, inputCode: string, action: string) => {
    const db = getDb()
    await db.query(
      `INSERT INTO controller_mapping (deviceId, inputCode, action) VALUES ($deviceId, $inputCode, $action)
       ON DUPLICATE KEY UPDATE action = $action`,
      { deviceId, inputCode, action }
    )
  })

  ipcMain.handle('plugins:list', async () => {
    return await listPlugins()
  })

  ipcMain.handle('plugins:reload', async () => {
    return await reloadPlugins()
  })
}
