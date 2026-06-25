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

