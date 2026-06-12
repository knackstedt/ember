---
title: Windows Games via Wine
description: Run Windows games discovered by Ember's scanner.
---

Ember can discover and launch Windows `.exe` games found by the Windows game scanner (for example, Heroic backups or manual installs in `~/Games`).

## Installing Wine

**Debian / Ubuntu**
```bash
sudo apt install wine
```

**Fedora**
```bash
sudo dnf install wine
```

**Arch**
```bash
sudo pacman -S wine
```

## How it works

1. Ember scans configured directories for `.exe` files
2. When you select a Windows game, it launches via `wine`
3. The game runs under Wine's compatibility layer

## Tips

- For best results, use Wine-GE or Proton-GE for modern titles
- Some games may require additional Wine dependencies (install via `winetricks`)
- Consider using Lutris or Heroic for complex setups; Ember can launch those titles natively
