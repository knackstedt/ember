---
title: Controllers & Input
description: Set up gamepads and controller navigation.
---

Ember reads controller events directly from `/dev/input/event*` using a pure Node.js binary reader. This gives low-latency input without relying on higher-level abstraction layers.

## Required setup

Your user must be a member of the `input` group to access device nodes without root.

**All distros:**
```bash
sudo usermod -aG input $USER
```

:::caution[Log out required]
After adding yourself to the `input` group, **log out and back in** for the change to take effect.
:::

## Supported controllers

Most standard USB and Bluetooth gamepads are supported, including:

- Xbox One / Series controllers
- PlayStation 4 / 5 controllers
- Nintendo Switch Pro Controller
- Generic XInput-style gamepads

## Navigation

Ember is designed to be fully navigable by controller:

- **D-pad / Left stick** — navigate menus
- **A / Cross** — select
- **B / Circle** — back
- **Start** — pause / menu
- **Shoulder buttons** — page left / right in grids

No keyboard or mouse is required for normal use.
