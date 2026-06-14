# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

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
