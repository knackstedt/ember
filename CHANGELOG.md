# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.6.2](https://github.com/knackstedt/ember/compare/v0.6.1...v0.6.2) (2026-07-01)


### Features

* **about:** add ReShade and ReShade Shaders to bundled dependencies list ([309f28c](https://github.com/knackstedt/ember/commit/309f28c00618af62e56cce5ba6a03ba7626d3d07))
* **gaming:** add html5 and unity platforms to web games category ([9a6cf11](https://github.com/knackstedt/ember/commit/9a6cf1172f2318e640ec04c02e03348a0476207c))


### Bug Fixes

* **build:** suppress rollup dynamic import warnings and filter CSP console messages ([9300b53](https://github.com/knackstedt/ember/commit/9300b53dba3d2ee0831a2ae7459a2bb1f51fe153))

### [0.6.1](https://github.com/knackstedt/ember/compare/v0.6.0...v0.6.1) (2026-07-01)


### Features

* **music:** add folder-based search results with hierarchical grouping and track filtering ([b32e45e](https://github.com/knackstedt/ember/commit/b32e45edaeb878519907a10e34aedc2d94c524d0))

## [0.6.0](https://github.com/knackstedt/ember/compare/v0.5.0...v0.6.0) (2026-07-01)


### Features

* **game-detection:** add comprehensive game engine and platform detection system ([12fbbc0](https://github.com/knackstedt/ember/commit/12fbbc00437e621f96c216a38bc09928ad49a04e))
* **overlay:** add pinned-only mode with persistent performance charts and configurable thresholds ([761704a](https://github.com/knackstedt/ember/commit/761704a05e3da2a943dde8482d1e5590733ae15a))
* **overlay:** improve window detection, visibility tracking, and stale taint cleanup for shader injection ([43f4f91](https://github.com/knackstedt/ember/commit/43f4f917b79de0e077e585f8792dade0f5ee197d))
* **reshade:** add ReShade addon DLL for windows game shader injection ([8f0b5b6](https://github.com/knackstedt/ember/commit/8f0b5b6905631669f26787b60ece3c08c24ba903))
* **splitscreen:** add experimental multi-player splitscreen system with input routing and audio management ([08635e0](https://github.com/knackstedt/ember/commit/08635e0398dc8242e4131a9768f80c33524fcaa3))


### Bug Fixes

* barrage of miscellaneous bugfixes ([68fcfd3](https://github.com/knackstedt/ember/commit/68fcfd3c41ffdd9efb2153b4b0459b51b377a27d))
* **reshade:** fix backend to enable overlay connection to ReShade ([6ebf9ae](https://github.com/knackstedt/ember/commit/6ebf9aea13b06095db9e33a0f194912a0ceda485))
* **thumbnails:** remove toast notification when loading libretro thumbnails without installed core ([46e4e0c](https://github.com/knackstedt/ember/commit/46e4e0cf350bc02a9c72dea567560dabd7c61466))

## [0.5.0](https://github.com/knackstedt/ember/compare/v0.4.7...v0.5.0) (2026-06-28)


### Features

* add OpenGL shader injection to native linux games ([a3565d6](https://github.com/knackstedt/ember/commit/a3565d61c77f5ed035a5179c5a324beafeff3c44))
* add visual shutdown indicator and fix intermittent shutdown errors ([ebffcc3](https://github.com/knackstedt/ember/commit/ebffcc31ed68a1a9512b6ab8e81ea7d61b0ef60c))
* Expand shader support to support EGL OpenGL games ([ae4f76c](https://github.com/knackstedt/ember/commit/ae4f76c0cf5b724073e6fbfda0431e43dd0cfa4a))
* **gaming:** add controller keybind support for focus-ember and kill-game commands while game is running ([99a62e1](https://github.com/knackstedt/ember/commit/99a62e1e392c615a6f3bff68fef4bd8c0d21b791))
* **launcher:** add detailed launch progress tracking with step-by-step status updates for Steam games ([4574f28](https://github.com/knackstedt/ember/commit/4574f28d954344907bbdb1903c15da27af8ae869))
* **music:** add "Play" context menu option and confirm dialog for queue clearing ([cbfd163](https://github.com/knackstedt/ember/commit/cbfd163e695a12e39b733831c9179213f4ab7eee))
* **music:** add corrupt file handling with policy-based cleanup for unparseable tracks ([d2a9c4a](https://github.com/knackstedt/ember/commit/d2a9c4a0ecff778863c3b6dde6a8c780742d1760))
* **power:** add reboot, suspend, and hibernate options to power dialog with grid layout ([1dcaaf2](https://github.com/knackstedt/ember/commit/1dcaaf2ee3a60dd4f2879e7e3a21c72f1915f9cc))
* **scanners:** improve executable detection by filtering common utility patterns and preferring game-specific names ([12ba924](https://github.com/knackstedt/ember/commit/12ba924f85e8c07412337d5beaa12ba04792b3f2))
* **shaders:** add 20 new post-processing effects with configurable parameters to Vulkan layer ([4cbf42e](https://github.com/knackstedt/ember/commit/4cbf42eb684ecf684076e3c3cc03ecb6004a4b68))
* **shaders:** add realtime shader updates in overlay ([a1dc9e0](https://github.com/knackstedt/ember/commit/a1dc9e0fa3440b665482b8afdf924ad584052b39))
* **shaders:** add taint manifest system for reliable cleanup of shader injection side-effects across crashes ([2037a86](https://github.com/knackstedt/ember/commit/2037a861487ab041352e654c61ae66a4b0a51034))
* **shaders:** add Vulkan layer shader injection and DLL override support for Windows games ([17ebc7b](https://github.com/knackstedt/ember/commit/17ebc7baf3a8b13d62180c266cdaec272a3023f8))


### Bug Fixes

* correct a bug that causes controller virtual cursors to not activate ([f561988](https://github.com/knackstedt/ember/commit/f561988cfb9bea21963bc308f3149dfdfc7badee))
* **launcher:** restore and focus main window when game exits ([1b33b6e](https://github.com/knackstedt/ember/commit/1b33b6ee0c4733794c38d3b819fad22e5b3520e1))
* prevent launching games from killing and restarting Steam ([c59bcf3](https://github.com/knackstedt/ember/commit/c59bcf3770327c71197302d36a722f54df74772a))
* prevent Vulkan layer env vars from leaking into Steam process and crashing steamwebhelper ([b608a4b](https://github.com/knackstedt/ember/commit/b608a4b85784e2fadb4e9cc7f5795e5d68f1b12c))

### [0.4.7](https://github.com/knackstedt/ember/compare/v0.4.6...v0.4.7) (2026-06-26)


### Features

* **bluetooth:** add Bluetooth device management with scan, pair, connect, and disconnect support ([15872dc](https://github.com/knackstedt/ember/commit/15872dc53d64cb43f7404922fd43203e39d5d74c))
* **controller:** add cursor snap-to-element for controller navigation ([d53aed4](https://github.com/knackstedt/ember/commit/d53aed4a5850bde6f3f00e9547bceb45fa290a72))
* **controllers:** unlock controllers tab by default and improve navigation locking ([9f3c925](https://github.com/knackstedt/ember/commit/9f3c925272b159f29b38d4e7d359f3d3144da554))
* **music:** add queue management actions and group context menus ([f1aa25b](https://github.com/knackstedt/ember/commit/f1aa25b915ccfaf2d9d96e7ebc6bbd591130b10c))
* **music:** add tab navigation within player and optimize visualizer rendering ([28fb1c3](https://github.com/knackstedt/ember/commit/28fb1c34191eb297e501c354d205f629cabac55c))
* **overlay:** add X11 window tracking and input grabbing for Linux overlay ([92cbcaf](https://github.com/knackstedt/ember/commit/92cbcafab0fda1129dab7a0d0d703fa9586453eb))
* **ui:** restore last active tab on app launch within 5-minute window ([3d455f8](https://github.com/knackstedt/ember/commit/3d455f85a1735d37676693881ba43fc040c2ece5))


### Bug Fixes

* **gaming:** correct playtime display to show hours and minutes instead of minutes and seconds ([c0b36ca](https://github.com/knackstedt/ember/commit/c0b36ca494ce1924f12b7125e6ebcd78b77dd269))
* **shutdown:** improve cleanup sequence and prevent dev server orphaning ([f27027d](https://github.com/knackstedt/ember/commit/f27027d0b2cb15036d8958f25030d22ce9c03e40))
* **ui:** adjust tab bar padding and focus outline positioning ([b52ca1e](https://github.com/knackstedt/ember/commit/b52ca1ef6cfcd76d0d09ab1cbb05eae47d682f62))
* **ui:** detailpanel no longer shifts grid ([10e4d87](https://github.com/knackstedt/ember/commit/10e4d87305bb7fa23f5af0e767653ec172624f71))

### [0.4.6](https://github.com/knackstedt/ember/compare/v0.4.5...v0.4.6) (2026-06-25)


### Features

* **animations:** pause requestAnimationFrame loops when page is hidden to reduce CPU usage ([9b32c49](https://github.com/knackstedt/ember/commit/9b32c49a6ebd8e54aa00ece5fe1b96df2db38453))
* **desktop:** add bulk desktop entry removal to danger zone settings ([e2248c3](https://github.com/knackstedt/ember/commit/e2248c3470db40b796fb682dc8cf903acfeac057))
* **desktop:** add CLI game launch support and desktop entry creation ([2d7644f](https://github.com/knackstedt/ember/commit/2d7644fa7e2422e97ab70b075811964d03c87273))
* **gc:** add manual garbage collection triggers for memory-intensive operations ([b32d893](https://github.com/knackstedt/ember/commit/b32d893ab2fa76a317df859dab1daa0b7bdac0ce))
* **images:** add on-demand image scaling with disk cache for ember:// protocol ([4d427f2](https://github.com/knackstedt/ember/commit/4d427f242e875c6ce69ec20b667808511509f354))
* **movies:** add navigation rail with genre/director/folder browsing ([f52ae8a](https://github.com/knackstedt/ember/commit/f52ae8aadcd2565697804a14880c5cd98b19eb92))
* **music:** preload album art for visible queue items ([70df8b1](https://github.com/knackstedt/ember/commit/70df8b190cc41b212277d6434b821a3b534e73a9))
* **ui:** add power dialog with system shutdown support and tab bar keyboard navigation ([7c21dd6](https://github.com/knackstedt/ember/commit/7c21dd67877d1303ed7c31c15cfb293a4724994e))

### [0.4.5](https://github.com/knackstedt/ember/compare/v0.4.4...v0.4.5) (2026-06-23)


### Features

* **build:** consolidate Rust build scripts into unified build-rust.ts ([72ce0f2](https://github.com/knackstedt/ember/commit/72ce0f21cf2b65ecf0f61b37ce4eca7f38ad1825))
* **db:** add graceful database worker shutdown with timeout handling ([0a14e19](https://github.com/knackstedt/ember/commit/0a14e19f405406ea1429f7b9e668091bd149b93c))
* **music:** add wheel event handler for volume control with passive:false flag ([83986a3](https://github.com/knackstedt/ember/commit/83986a3ea446c39c60f2b284f175d513abbce56b))
* **server:** add abort signal handling for file stream cleanup ([ba7ae50](https://github.com/knackstedt/ember/commit/ba7ae508b6e6fd39361b5fa1788400ba081327f7))
* **thumbnails:** add native mpv-based thumbnail worker with HDR tone-mapping and complexity detection ([c62ad97](https://github.com/knackstedt/ember/commit/c62ad97c3a20fd01c035db5863ba041c31364e38))
* tsc fixes ([4850660](https://github.com/knackstedt/ember/commit/48506600304796350e92d3b8e8451d69941b0c08))
* **ui:** add FlameLoader component and improve scanning toast handling ([84a6791](https://github.com/knackstedt/ember/commit/84a679150cfc696e21fe0dd33e401f4fc8c9b286))
* **updater:** add backup directory existence check before rollback ([74dd03d](https://github.com/knackstedt/ember/commit/74dd03d93499b0af5d51f2ba47630df2360060bb))
* **updater:** improve error handling and state management ([82f455f](https://github.com/knackstedt/ember/commit/82f455f51003b747d5981b1e1ac64d61a8c1b678))
* **video:** improve native decoder stability and add track/speed persistence ([fd4c10b](https://github.com/knackstedt/ember/commit/fd4c10b15f9e4e28062f20b30019942d142083cf))


### Bug Fixes

* **db:** use SELECT count() before DELETE to get accurate row counts ([072483a](https://github.com/knackstedt/ember/commit/072483a5e9d2d30497daaa292ecb72dd7380824a))

### [0.4.4](https://github.com/knackstedt/ember/compare/v0.4.3...v0.4.4) (2026-06-23)

### [0.4.3](https://github.com/knackstedt/ember/compare/v0.4.2...v0.4.3) (2026-06-23)


### Features

* **build:** add Ubuntu Ports repository for ARM64 cross-compilation dependencies ([f4a1e44](https://github.com/knackstedt/ember/commit/f4a1e4467965b130b4ecc33fa55166211f74b9c3))
* **cleanup:** add worker cleanup on app shutdown and window close ([710d1f3](https://github.com/knackstedt/ember/commit/710d1f3e51789ff7c25893f88b801697a97e9631))

### [0.4.2](https://github.com/knackstedt/ember/compare/v0.4.1...v0.4.2) (2026-06-23)


### Features

* **plugins:** add bundled plugin installation and dev plugin discovery ([e275ffa](https://github.com/knackstedt/ember/commit/e275ffa85b5fe15948951d1a77a78b5365619bed))

### [0.4.1](https://github.com/knackstedt/ember/compare/v0.4.0...v0.4.1) (2026-06-23)

## [0.4.0](https://github.com/knackstedt/ember/compare/v0.3.0...v0.4.0) (2026-06-22)


### Features

* **build:** move plugin packaging from predist to separate workflow step ([0caa24d](https://github.com/knackstedt/ember/commit/0caa24d2dc33dbff29cc7fcb403da234ff7e3941))
* cleanup CSS Vars & add Ember theme ([2734715](https://github.com/knackstedt/ember/commit/2734715b27efd51c66489f9bed666b6b690b5eea))
* **db:** add OData query service with generic database querying and install mechanism detection ([a7d1eb8](https://github.com/knackstedt/ember/commit/a7d1eb8c32ae2116ec0c32a667df0f8e48473d7a))
* **db:** centralize transaction conflict retry logic in WorkerSurreal query method ([c4f9fc6](https://github.com/knackstedt/ember/commit/c4f9fc68b4d9dfafdca8f74aff3af9f49ea1582e))
* **settings:** add install mechanism detection to system info diagnostics ([3d4121b](https://github.com/knackstedt/ember/commit/3d4121b3576b14c9a068ec2663099ab1b70b5793))
* **themes:** add five new theme plugins - Dark OLED, Deep Ocean, Glassmorphism, Monokai, and Neon Cyberpunk ([d79d590](https://github.com/knackstedt/ember/commit/d79d5904f48d54a2157f230137509b30b5b5686d)), closes [#000000](https://github.com/knackstedt/ember/issues/000000) [#e2e2e2](https://github.com/knackstedt/ember/issues/e2e2e2) [#001219](https://github.com/knackstedt/ember/issues/001219) [#00f5d4](https://github.com/knackstedt/ember/issues/00f5d4) [#7dd3](https://github.com/knackstedt/ember/issues/7dd3)
* **updater:** add auto-update system with GitHub releases integration and rollback support ([b6078ba](https://github.com/knackstedt/ember/commit/b6078ba48245bd570a051ef45174193bad374bae))

## [0.3.0](https://github.com/knackstedt/ember/compare/v0.2.1...v0.3.0) (2026-06-22)


### Features

* **App:** remove tab transition animations to fix recurring blank-tab bug ([bfc3c93](https://github.com/knackstedt/ember/commit/bfc3c93ec08543647931d3c46d6af3a62bbff4d5))
* **ConfirmDialog:** add keyboard/controller navigation with focus management and loading state handling ([a858dda](https://github.com/knackstedt/ember/commit/a858dda299ef72b27284e5eaf5f3d4dd6593cb8c))
* **dashboard:** add customizable dashboard tab with drag-and-drop widget grid and controller navigation ([4618859](https://github.com/knackstedt/ember/commit/4618859dc2a5dabfc9985820ab26f036af71a013))
* **Dashboard:** add keyboard/controller shortcuts and URL normalization to widget config dialog ([7df1740](https://github.com/knackstedt/ember/commit/7df17409b8b4e344540145c694d10f2a03c4e3b8))
* **Dashboard:** add webview URL persistence and edit mode navigation tracking ([89f18ad](https://github.com/knackstedt/ember/commit/89f18ad417f26ba37a29417f272961b74b4f1097))
* **database:** add playlist support, corrupt file tracking, scan source filtering, and streaming adapter infrastructure ([e3e99cb](https://github.com/knackstedt/ember/commit/e3e99cb8c302cbefe8bc13fbd34a864d456ef14c))
* **db:** move SurrealDB operations to worker thread to prevent main process blocking ([2423b0f](https://github.com/knackstedt/ember/commit/2423b0fc342099546198f41cba4cb4afafe19401))
* **ErrorBoundary:** add text selection support to error message displays ([ab8d4a0](https://github.com/knackstedt/ember/commit/ab8d4a0f72426a935a43357ff217c0440f5bc7cc))
* fix webkit scrollbar visuals ([1d80001](https://github.com/knackstedt/ember/commit/1d800014afb8872bdf520bb43e446e66f84964a0))
* **gallery:** add BookshelfSpine component and click/context-menu support to BookshelfView and SpreadDeckView ([a33a6e6](https://github.com/knackstedt/ember/commit/a33a6e671f566aae986ef36e28ae5f63cfc37b3d))
* **gaming:** add navigation rail with platform groups and advanced filtering to games tab ([84ab9c8](https://github.com/knackstedt/ember/commit/84ab9c8dfbd4d02eaa186d747baf80b216289ed7))
* **input:** make evdev device scanning async to prevent blocking main process initialization ([30e35d4](https://github.com/knackstedt/ember/commit/30e35d4aecda54a5033f4c490415eb45cde4c6aa))
* **launcher:** add game launch overlay with window detection, launch state tracking, and failure notifications ([96a7438](https://github.com/knackstedt/ember/commit/96a74381c271388cbf89be23842424c4cd08a0c1))
* **launcher:** add lastPlayed tracking to music/tv and improve window focus handling on game launch failures ([2baf594](https://github.com/knackstedt/ember/commit/2baf5949a47a8c78d64ad9deb0bb415c123ef082))
* **main:** add error dialog for uncaught exceptions and unhandled rejections with copy-to-clipboard support ([e00809a](https://github.com/knackstedt/ember/commit/e00809adacd3e0765cf9d14024abea946068043f))
* **media:** add missing file tracking with background scans, auto-refresh, and batch deletion ([851f0c1](https://github.com/knackstedt/ember/commit/851f0c15a7bd6adbb60d9e83639b000a1adc7b55))
* **music:** add custom Ember Flame visualizer preset with flame-shaped spectrum and treble sparks ([4cf90e0](https://github.com/knackstedt/ember/commit/4cf90e07957eacee45a8d0fb254b1cdfb204100f))
* **music:** add full-screen music player with tabs, keyboard navigation, and seekable progress bar ([95a26e7](https://github.com/knackstedt/ember/commit/95a26e7f1b8039c1d3a270749ebc7c22c8ca11ff))
* **music:** add regenerate thumbnail with improved procedural cover generation and cache-busting ([0214929](https://github.com/knackstedt/ember/commit/0214929f4f86a3bf04a199e44c3f86ba315c8a98))
* **music:** add track context menu with favorite/hide/delete/regenerate actions and persisted player state ([afdbef9](https://github.com/knackstedt/ember/commit/afdbef9cdc5c291e5683f6dd2cffece3a09986bd))
* **music:** add viewMode to scroll effect dependencies to fix virtualizer sync on view changes ([8b19e4b](https://github.com/knackstedt/ember/commit/8b19e4b043b15dff9550f7cfc77b0fcb3abbd554))
* **music:** initialize visualizer with default preset before first render to prevent blank frame ([fbce174](https://github.com/knackstedt/ember/commit/fbce174bcd2333a6c1340b634a31e85dfcadd9ec))
* **music:** remove streaming services integration from music tab ([8158ac9](https://github.com/knackstedt/ember/commit/8158ac997c81a34c79429558d017c1b46d894c41))
* **music:** replace custom visualizers with Butterchurn Milkdrop presets ([b3603b1](https://github.com/knackstedt/ember/commit/b3603b14e52441f9c40968324a1f5d09139e390f))
* **performance:** add async operations and performance monitoring to prevent main thread blocking ([4073f18](https://github.com/knackstedt/ember/commit/4073f18e685abbba2a5a8ebce7803606cecdb3a3))
* **scanners:** add source field to all game scanners and implement scan source filtering with corrupted files policy ([2c1edee](https://github.com/knackstedt/ember/commit/2c1edeebb43eb00e54283e8d136fe66aaf82534b))
* **Settings:** consolidate DataFeed and LocalData tabs into single IntegrationsTab ([3295166](https://github.com/knackstedt/ember/commit/3295166d39666d05da5ad6e4f44011dfc8935833))
* **system-info:** add GPU name fallbacks and mpv/libmpv detection to diagnostics ([ef265d0](https://github.com/knackstedt/ember/commit/ef265d0af3aa5e15d89981cf5e79399c9a50be98))
* **system-info:** add production dependencies list to system info with sorted name/version pairs ([9f87fb7](https://github.com/knackstedt/ember/commit/9f87fb7e7b2ba5f2730d2792baecf3d12769e1ab))
* **uninstall:** add platform-aware uninstall support for games, movies, and music with trash/delete fallback ([4ccaeb5](https://github.com/knackstedt/ember/commit/4ccaeb52fb3266e5c75c798a4b5bce151da7154d))


### Bug Fixes

* correct devtools opening ([e45d942](https://github.com/knackstedt/ember/commit/e45d942907d58ddf7be80985026db513cd0b54fb))

### [0.2.1](https://github.com/knackstedt/ember/compare/v0.2.0...v0.2.1) (2026-06-17)


### Features

* **db:** add frontpageEnabled default to streaming service normalization ([a207c93](https://github.com/knackstedt/ember/commit/a207c93b96dd28b7b9f6f397d66021a668135d8c))
* **input:** add controller alias support, touchpad input handling, and expand controller compatibility ([0242cb8](https://github.com/knackstedt/ember/commit/0242cb87cf01a094d4cffab06871297a2ef01b34))
* **input:** improve evdev device recovery after system sleep/wake with immediate rescan ([18583cb](https://github.com/knackstedt/ember/commit/18583cbd6d2d428c6be5afe8afb08f6ce52dc6d3))
* **launcher:** add Steam game process tracking with playtime, window management, and auto-shutdown ([cb5f96e](https://github.com/knackstedt/ember/commit/cb5f96e491eacaca4118f4c8c00080ec69b5c241))
* **libretro:** add audio mute support and automated thumbnail capture with fallback frame extraction ([09d746c](https://github.com/knackstedt/ember/commit/09d746caf6118dae7e8b00d38fd6a77fe6f37f3a))
* **libretro:** add automatic dual-screen cropping for NDS/3DS thumbnails with solid region detection ([2953ffd](https://github.com/knackstedt/ember/commit/2953ffdf32a5700f2ff4d383df3eec3120437e6e))
* **libretro:** add mouse/pointer input support with analog stick mapping and touch controls for NDS emulation ([f92b477](https://github.com/knackstedt/ember/commit/f92b47746f91261e3cd8bd00d905d87f813b2679))
* **libretro:** add panic recovery to audio callbacks, optimize buffer operations, add audio toggle, and improve thumbnail generation with multi-core fallback ([556a223](https://github.com/knackstedt/ember/commit/556a22323698c26ce319b616508483742e5771d4))
* **libretro:** replace solid region detection with entropy-based screen selection for NDS/3DS thumbnails ([90fd3f9](https://github.com/knackstedt/ember/commit/90fd3f9a4163bd95eac21c97755ec0081b6e345f))
* **repo:** add GitHub issue templates, PR template, contributing guide, code of conduct, and install script ([6719e8b](https://github.com/knackstedt/ember/commit/6719e8b2c07134d18aa4bcdda84b6cb8ebdec116))
* **settings:** add gamePaths configuration for custom game directories and improve scanner path handling ([6b76d02](https://github.com/knackstedt/ember/commit/6b76d02070537caa187b563766cc94cb85f3e070))
* **ui:** add focus trap hook, skeleton loading states, and conditional player rendering ([1d61b77](https://github.com/knackstedt/ember/commit/1d61b777b8d7e229e4ea4afbcf02533a065f0843))
* **ui:** add ImageLightbox component with keyboard/gamepad navigation and integrate into gaming tab screenshots ([73717d3](https://github.com/knackstedt/ember/commit/73717d3052bb4ac0189665d158bf473ad8a0a3e6))
* **ui:** fix HexGridView navigation dependency and remove unnecessary spacer elements ([9fe6e85](https://github.com/knackstedt/ember/commit/9fe6e8509c4819a5bdc327b0035a9be21621cc56))
* **video:** add mpv-based video decoder with hardware acceleration, subtitle/audio track support, and playback controls ([214a15f](https://github.com/knackstedt/ember/commit/214a15f48439a03f9330186eab5dc3396b562b01))
* **website:** replace MDX splash page with custom Astro landing page ([8a31bcb](https://github.com/knackstedt/ember/commit/8a31bcbbbb9cd6ef998e3c607d2ca94321582381))


### Bug Fixes

* **video:** replace nullish coalescing with logical OR for probe title fallback ([c5d720a](https://github.com/knackstedt/ember/commit/c5d720af1dcf53e981d9fe6297b0474a9055ad76))

## [0.2.0](https://github.com/knackstedt/ember/compare/v0.1.1...v0.2.0) (2026-06-14)


### Features

* add more controller base images ([4be728f](https://github.com/knackstedt/ember/commit/4be728f9fc1073a2632be51fe249e74448ea43ae))
* add native video decoder module with FFmpeg and GStreamer backends for hardware-accelerated NV12 decoding ([b4260f1](https://github.com/knackstedt/ember/commit/b4260f10e5b2dce40c4bcca8a69c2e8556a00dd4))
* add remote source support with rclone integration for network media streaming ([d9d1564](https://github.com/knackstedt/ember/commit/d9d15645119b2c63aca91b664eeb2700a7d6f6e8))
* add SharedArrayBuffer support for zero-copy libretro frame delivery with atomic double-buffering ([915e5ae](https://github.com/knackstedt/ember/commit/915e5ae087049c6f7def0ea89ed5d814b9b5fc01))
* **controllers:** add PlayStation button icons to controller UI ([f906653](https://github.com/knackstedt/ember/commit/f9066538f7b27378fe6b56579bdc0714fe67f96c))
* **cursor:** add click ripple animation to virtual cursors ([45d588c](https://github.com/knackstedt/ember/commit/45d588caa85dd2cca8316890c32b4e8e680a58f6))
* **ffmpeg:** add audio playback via Web Audio API and improve frame pacing ([2ebbec2](https://github.com/knackstedt/ember/commit/2ebbec23140aa54264175b069f8bf0ef8074c947))
* **gaming:** add controller navigation for platform dropdown and separate console filter ([544c38c](https://github.com/knackstedt/ember/commit/544c38c27643150b1f634ca5160b7dd96bec56e6))
* **input:** add connection type detection, battery/signal monitoring, and latency tracking ([f8bcf7e](https://github.com/knackstedt/ember/commit/f8bcf7ee245d3b1dfaafda0451436942a8d88e65))
* **input:** add d-pad button repeat and improve analog stick navigation responsiveness ([6d5f4fc](https://github.com/knackstedt/ember/commit/6d5f4fca57b71669fdbd62274ff8442b70fa4d38))
* **input:** add EACCES cooldown and clear on system resume to prevent spam after sleep ([b87e2ac](https://github.com/knackstedt/ember/commit/b87e2ac40b52074b43084897f178528fcf338315))
* **input:** add frame-rate independent cursor movement and configurable mouse speed ([c0365c3](https://github.com/knackstedt/ember/commit/c0365c387085a78cbe4fbb1dddb710f97c171b6c))
* **input:** add GameCube controller support and raw input discovery ([7f92669](https://github.com/knackstedt/ember/commit/7f92669b2334cb39c12a65933e176330ec93005c))
* **input:** migrate to SharedArrayBuffer controller pipeline with worker thread ([3cc9e2f](https://github.com/knackstedt/ember/commit/3cc9e2f85f5caf4e5dc64645185a260d50b0e1da))
* **input:** normalize gamepad axis values in evdev backend ([a1ffa64](https://github.com/knackstedt/ember/commit/a1ffa6478fa1b060725d392aa39d782273a1b364))
* **movies:** show context menu for all sub-tabs instead of local-only ([8ed72db](https://github.com/knackstedt/ember/commit/8ed72db68e7f638a425fc2cead149b1bd4cab618))
* **perf:** add flash thumbnail semaphore, settings cache, and fetch timeouts to improve responsiveness ([7eca6db](https://github.com/knackstedt/ember/commit/7eca6db3897cf0c5bd11471940d36d427dc8008d))
* **remote:** add intermittent availability worker and missing-entry deletion ([aa9365d](https://github.com/knackstedt/ember/commit/aa9365d9001be7f001a79da648333a8d3c094521))
* **settings:** add configurable flash thumbnail concurrency setting ([335ea35](https://github.com/knackstedt/ember/commit/335ea3518179a5614ee5f32cc18e6dc4cd610f36))
* **streaming:** add browser extension support for streaming services ([b6dfa3d](https://github.com/knackstedt/ember/commit/b6dfa3d6c8a6f155dc5e22d28ebd0f0e4c2af24d))
* **streaming:** add frontpage scraping, usage tracking, and controller on-screen keyboard ([d71f6bb](https://github.com/knackstedt/ember/commit/d71f6bb06331be3179fdc0824a72beff04112878))
* **ui:** add BookshelfView and HexGridView gallery layouts with controller navigation ([4c11ab7](https://github.com/knackstedt/ember/commit/4c11ab717246bbf9fd862b50d2a342d21d5fbc84))
* **ui:** add zoom controls and suppress ResizeObserver warnings ([3ac706b](https://github.com/knackstedt/ember/commit/3ac706b1327fa7b41c17e4077a2b224fba4a4c92))
* **ui:** convert GameCube controller background from SVG image to inline React component ([3d83776](https://github.com/knackstedt/ember/commit/3d83776c3cda1ad29a621ab90031da5bdb80aa93))


### Bug Fixes

* **ci:** remove redundant root dependency install step in website workflow ([2c819f3](https://github.com/knackstedt/ember/commit/2c819f37833ba605ded74d814c2a867c12bf1f45))
* **color/cpu:** remove BT.709→sRGB correction; hardware decoder improvements ([5f12c1e](https://github.com/knackstedt/ember/commit/5f12c1e4b886d5d9367021a65f257bdaa37a9219))
* **color:** BT.709→sRGB transfer correction + proper chroma upsampling ([91e72c1](https://github.com/knackstedt/ember/commit/91e72c1856b9fc39ebfe916b6a6272cb8a661daa))
* **color:** derive YCbCr→RGB matrix from actual caps colorimetry ([38060a7](https://github.com/knackstedt/ember/commit/38060a7880e3493ae196ffffffa029eb4495842c))
* **db:** add missing field to SurrealDB schema migration ([7be1e6b](https://github.com/knackstedt/ember/commit/7be1e6b024bfd1b126f2ef7b3863b9f3537736ba))
* **gstreamer:** use VideoInfo for correct NV12 stride/plane extraction ([a70f4ae](https://github.com/knackstedt/ember/commit/a70f4aef5e6d3e9352843d61b24a262c08217001))
* **input:** initialize lastInputTime to 0 instead of Date.now() for new controller states ([fce8ec9](https://github.com/knackstedt/ember/commit/fce8ec953702b70fb64738b3b908cce13ce1386a))
* **renderer:** letterbox video to preserve aspect ratio on any display ([1bd059d](https://github.com/knackstedt/ember/commit/1bd059da4c925d6fb983a6bd8a8856cea4f97018))
* **shader:** correct YUV->RGB for BT.709 limited-range NV12 ([e0aa7f7](https://github.com/knackstedt/ember/commit/e0aa7f73a75650bc59f2f24cd00ab8f3e2e1e250))
* **ui:** move drop-shadow filter to hex container and add padding to prevent clipping ([564a2d8](https://github.com/knackstedt/ember/commit/564a2d8d87f1bcd56ee54e1e347ec89524f22d1d))
* **ui:** remove forced remount key from Virtualizer to prevent grid corruption on deletion ([5acde38](https://github.com/knackstedt/ember/commit/5acde384bc79f56f965ab4459624f0dbc4c13600))
* **video:** stop ghost audio + memory leak from dual playback paths ([2a06d90](https://github.com/knackstedt/ember/commit/2a06d9018aba5034bc68cbb8e7e7258fdc6af076))
* **webgl:** handle HDR content (bt2100-pq / bt2100-hlg / bt2020) ([3b26a90](https://github.com/knackstedt/ember/commit/3b26a90fb5664e1f3c656e8ebb624ed0ab430d22))
* **webgl:** move mat/off logging after variable declaration ([62b62be](https://github.com/knackstedt/ember/commit/62b62be34eb568f0cd74e47e66a2b33b259bd401))
* **webgl:** remove broken tone mapping, keep BT.2020 matrix for HDR ([c737ec4](https://github.com/knackstedt/ember/commit/c737ec4a0697c58aa92b5492097c19fb2c2f6538))

### [0.1.1](https://github.com/knackstedt/ember/compare/v0.1.0...v0.1.1) (2026-06-08)


### Features

* add itch.io integration with butler CLI support for game library management and installation ([ae9c9e1](https://github.com/knackstedt/ember/commit/ae9c9e1f4d05d43375a2e869a6e857a493f45251))
* add multi-controller cursor support with per-device color hues and centralized cursor manager ([f26fba0](https://github.com/knackstedt/ember/commit/f26fba0009d1b579a6c39be98c8ca93b9afc1a69))
* add session hooks system with launch override support and multi-timing execution for game lifecycle events ([e661c44](https://github.com/knackstedt/ember/commit/e661c448c1892340851bf622e88f4b5088156541))
* add SVG module declaration to vite-env.d.ts for TypeScript support ([cf60d4a](https://github.com/knackstedt/ember/commit/cf60d4a7ae99d7460adc14195722bfbe7a891177))
* add VirtualCursor component with animated cursor styles and replace browser controller navigation with gamepad-driven virtual cursor system ([54fcb93](https://github.com/knackstedt/ember/commit/54fcb934929909d17123114504bf3f4efaf57f69))


### Bug Fixes

* build not including required dep ([a11c666](https://github.com/knackstedt/ember/commit/a11c666df5597ec5ed4eb6e84471beedf1276a0e))
