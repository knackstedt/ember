# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

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
