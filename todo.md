# Application Roadmap

## Online Services

### Account Service
- User authentication
- Profile synchronization
- Data backup/restore (Including ROM saves!)
- Flash Game metadata library
- Progress tracking
- Achievement tracking (for supported platforms...)
    - May be able to patch games that have achievements and add them to the tracking system
- Account page like Steam/Origin/Epic
- Achievements tied to account (RetroAchievements, Steam etc.)
- Speedruns tied to account

## Data Feeds

- Better Rsync interface and control
- Streaming more content types than just movies and music
- Actual streaming interfaces that work with controllers
- Actual or better Store integration
    - itch.io
    - Steam
    - GOG
    - Epic Games
    - Flash Archive (wayback machine?)


## Launch Functionality

- Better WINE / Bottles / Proton integration (currently present but could be better)
- Unified Video playback system (currently using 2 different playback flows)
- Correct display color management in libmpv playback
- Support more audio containers/codecs than Chrome
- Support Dolby Digital audio (?) 

## Performance

- Replace libretro renderer with something near zero-copy
- Replace MPV rendering pipeline with libmpv direct rendering for full HDR, Dolby Atmos and theater support

## Large future features

- castv2/multicast-dns support (bidirectional)
- [smithay](https://github.com/Smithay/smithay) custom DE for dual/quad inputs and display management
    - Develop in nested mode (?)

## Minor Issues

- Metadata gaps in various sources
    - ROM covers, singular music file covers
    - Missing game descriptions, categories etc.

## Long-term Features

- HDMI CEC support (both input-linux-cec kernel module and libcec integration for pulse-eight USB controllers)
- Direct support for Online stores without Heroic
    - Shell out to butler (itch), legendary (epic), gogdl (gog).


## Unplanned features

- Voice Chat / Text Chat


# Misc garbage tasks:

===============================================================================

Build a custom "Overlay" mode that shows up when launching a Steam/Lutris/Heroic/Wine etc game.
This mode should work loosely like steam's overlay, in that it provides an overlay to the video game that can be used to control the game and access other features like network, controller order & mapping, shader, a webview for searching stuff, notes, achievements, etc. They keybind to access this mode should be configurable, and it should work for both keyboard and controllers. Set the default 
keyboard keybind to F1 (it should be rebindable like our other keybinds) This keybind is special - it should work even when the game is running in fullscreen and Ember isn't focused (so use electron's globalShortcut API).

For the overlay window, it should also be fullscreen (no title bar) with a transparent background so the game is still visible.
It should have a semi-transparent background and a border to make it visible but not block the game. It should be visually configurable
to either use a backdrop filter (like glassmorphism) or just a transparent color above the game.

Include any features that would be useful for a gaming overlay, such as:
- Game information (title, progress, etc.)
- System information (CPU, GPU, RAM, etc.)
- Achievements
- Pause game (SIGSTOP/SIGCONT) -- also add a keyboard and controller keybind for this keyboard should default to PAUSE/BREAK.

For now, do it for X11. We'll add Wayland support once we either have a compositor hook or wayland authors give us an actual option here.

===============================================================================

Build out splitscreen-me like support for games using a custom compositor written with smithay.
It should provide an overlay when activating that shows player 1 / player 2 vertically or horizontally stacked for 2p, 
each corner for 4p, and different layouts for 3p (one stretch on the top, vs left/right). When activated it spawns X instances of the game with input mapping and or emulation through the compositor so that 3 controllers can be sent to the
different apps, and mice/keyboards can also be directed to different apps. One mouse/keyboard or controller should be marked as the "host" controller and be able to control the overlay and jump to other games if needed (e.g. a controller based game that needs a mouse for starting the level or something).

When showing the layout overlay, each corner should show a ghost of the controller or keyboard that's mapped to it with the number to the right of the controller. So if a gamecube controller is connected as P2 in a side-by-side layout, it should show a ghost of the gamecube controller with the number 2 to the right of it, along with a label saying "Player 2" and a "locate" function the host input can activate.

This should show up before the games are spawned, and should be configurable to have an overlay screen for each player.

===============================================================================

Implement a hotkey to force pause the active game via SIGSTOP/SIGCONT (like nyrna does). You'll have to crawl the process tree and stop the children processes in the right order.

===============================================================================

Some gamepads aren't mapping the xbox button correctly (xbox format)

Xbox Series controllers may be fucked up


How do we avoid this from showing up? This is showing up with 3 controllers (switch, ps5, wiimote+nunchuk)

18:32:24 WARN  [evdev] Too many controllers, skipping /dev/input/event21




===============================================================================

update the dolphin game launching (wii, gamecube)

use --user to a file that we write to a temp dir (and clear when game exits) this should be created automatically 
based on our database config and should be unique per game -- including "public" defaults from our own data source.
With this, point the game to a custom save file location under the temp dir that is unique per game. We will backup
the file every 10 minutes and save it when the game finishes before clearing the file. This allows us to remotely 
play and backup ROMs without having to backup the random save directories each emulator uses.

================================================================================
