# Shader & DLL Injection

Ember HTPC supports two methods of shader injection for Windows games (both Steam and non-Steam):

1. **Vulkan Layer Injection** — A custom Vulkan layer (`VK_LAYER_ember_shader`) that intercepts `vkQueuePresentKHR` and applies post-processing shaders.
2. **Wine DLL Override** — Uses `WINEDLLOVERRIDES` to inject custom DLLs (e.g. ReShade) into the Wine/Proton prefix.

Both methods are **opt-in per game** and can be configured in the game detail panel.

## Architecture

### Non-Steam Windows Games

Non-Steam Windows games are launched with `umu-run` by default. Environment variables for shader injection are passed directly to the spawned process:

```
umu-run /path/to/game.exe
  VK_INSTANCE_LAYERS=VK_LAYER_ember_shader
  VK_LAYER_PATH=/path/to/layer/dir
  EMBER_SHADER_PRESET=crt
  EMBER_SHADER_INTENSITY=0.8
  WINEDLLOVERRIDES=dxgi=n,b;d3d11=n,b
```

Custom DLLs are copied to the Wine prefix's `system32` directory before launch.

### Steam Games

Steam games cannot have environment variables injected directly when Steam is already running. Instead, Ember uses Proton's `user_settings.py` mechanism:

1. Before launch, Ember writes a `user_settings.py` file to the Proton prefix (`steamapps/compatdata/<appid>/pfx/user_settings.py`).
2. The file sets the required environment variables (Vulkan layer, DLL overrides).
3. Proton reads this file when starting the game and applies the env vars to the game process.
4. When the game closes, Ember removes the `user_settings.py` file.

**Conflict Handling**: If a non-Ember `user_settings.py` already exists, Ember prompts the user to override it. The original file is backed up to `user_settings.py.ember-backup` and restored when the game closes.

Ember marks its `user_settings.py` files with a comment header:
```python
# EMBER_SHADER_INJECTION_V1
```

## Vulkan Layer

### Building

```bash
cd native/vulkan-layer
make
```

### Installing

```bash
cd native/vulkan-layer
make install
```

This copies the layer shared library and manifest JSON to `~/.local/share/vulkan/explicit_layer.d/`.

### How It Works

The layer is a Vulkan explicit layer that:
- Intercepts `vkCreateInstance` and `vkCreateDevice` to insert itself into the dispatch chain
- Intercepts `vkQueuePresentKHR` to apply post-processing shaders before presenting
- Reads `EMBER_SHADER_PRESET` env var to select the shader preset
- Reads `EMBER_SHADER_INTENSITY` env var (0-1) to control shader strength

### Available Presets

| Preset | Description |
|--------|-------------|
| `crt` | CRT scanline effect |
| `bloom` | Bloom glow effect |
| `color-grade` | Color grading |
| `fxaa` | Fast approximate anti-aliasing |
| `cas` | Contrast adaptive sharpening |

## DLL Override / Custom DLL Injection

This method allows injecting custom DLLs (like ReShade) into Wine/Proton games:

1. **DLL Override List**: Specify which DLLs should be loaded as native (e.g. `dxgi.dll`, `d3d11.dll`). These are set via `WINEDLLOVERRIDES` with `n,b` (native, builtin) priority.
2. **Custom DLL Paths**: Specify file paths to custom DLL files. These are copied to the Wine prefix's `drive_c/windows/system32/` directory before the game launches.

## Per-Game Configuration

In the game detail panel (for Windows and Steam games), you'll find:

- **Vulkan Layer Shader** checkbox — enables the Ember Vulkan layer with a preset selector and intensity slider
- **DLL Override (ReShade / Mods)** checkbox — enables DLL override with a comma-separated DLL list and custom DLL path textarea

## Global Defaults

Global default injection settings can be configured in `AppSettings`:
- `defaultVulkanShader` — Default Vulkan shader config applied to all games
- `defaultDllInjection` — Default DLL injection config applied to all games
- `vulkanLayerPath` — Override path to the Vulkan layer shared library

Per-game settings override global defaults.

## Files

| File | Purpose |
|------|---------|
| `src/shared/types.ts` | Type definitions (`VulkanShaderConfig`, `DllInjectionConfig`, `GameInjectionConfig`) |
| `src/main/services/shader-injection.service.ts` | Core injection service (env vars, user_settings.py, DLL copy) |
| `src/main/services/launcher.service.ts` | Launch integration (injection env merge, user_settings.py lifecycle) |
| `src/main/scanners/steam.scanner.ts` | Steam scanner (stores `installPath`, `mainExe`) |
| `src/main/ipc/index.ts` | IPC handlers for injection config |
| `src/preload/index.ts` | Preload bridge API |
| `src/renderer/src/tabs/Gaming/index.tsx` | UI for per-game injection settings |
| `native/vulkan-layer/layer.cpp` | Vulkan layer C++ source |
| `native/vulkan-layer/VkLayer_ember_shader.json` | Vulkan layer manifest |
| `native/vulkan-layer/Makefile` | Build & install |

## System Dependencies

- `umu-run` — Unified Proton/Wine launcher for non-Steam games
- Vulkan SDK or `libvulkan-dev` — For building the Vulkan layer
- `wine` — Fallback if `umu-run` is not installed
- Proton (via Steam) — For Steam games
