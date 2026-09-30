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
- Modding integration / support
    - Right now we support only a helper for injecting DLLs.
    - Would this look like an overlay filesystem?

## Unplanned features

- Voice Chat / Text Chat


Ember is a problem with the GPU -- is the visualizer always running when music is playing or something?l



Create a youtube downloader frontend plugin





What actually works for this niche, roughly in order of "least annoying":

Affiliate/referral revenue on game purchases — this is the model Heroic itself leans toward via GOG/Epic partnerships. If your launcher aggregates storefronts, affiliate links or bundle partnerships (Humble, Fanatical, etc.) are invisible to the user and don't touch their CPU or attention at all.
Paid tier with real utility, not a paywall on core function — cloud save sync across devices, save-state rollback, cross-launcher library stats/backlog tracking, themes, or priority download-server access (P2P-assisted downloads like item #2 from my last answer — legitimately useful since launchers move huge files). Free tier stays fully functional; paid tier is a nice-to-have.
One-time "supporter" purchase (à la ad-blockers, VLC-adjacent tools) — a $5–15 one-time unlock for cosmetic/QoL stuff. Low friction, no recurring nagging, and works well for utility software people trust.
Opt-in P2P bandwidth sharing that saves you money, not crypto mining — if you're hosting installers/updates, letting idle clients relay chunks to each other (WebTorrent/WebRTC-style) cuts your CDN bill directly, which is a real dollar saving rather than a speculative crypto payout, and it's a much easier sell to users ("help us keep this free" vs "we mine coins on your PC").
Non-tracking, non-intrusive sponsorship — a single static "supported by X" placement in the launcher, no dynamic ad network, no behavioral targeting. Annoys almost nobody if it's one clean slot.