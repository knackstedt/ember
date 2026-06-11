# No Unicode Icons

**Applies to:** All source files (`src/**/*.{ts,tsx}`)

## Rule

Do not use Unicode emoji or symbol characters as UI icons. Instead, use actual SVG icons — preferably from `lucide-react` or inline SVG components.

## Why

- Unicode icons render inconsistently across platforms and fonts
- They are inaccessible and cannot be styled (color, size) with CSS
- SVG icons are crisp at any size and support theming

## What to avoid

```tsx
// Bad — Unicode icons
<span>🎮</span>
<button>▶ Play</button>
<span>✕</span>
```

## What to use instead

```tsx
// Good — lucide-react icons
import { Gamepad2, Play, X } from "lucide-react";

<Gamepad2 size={16} />
<button><Play size={14} /> Play</button>
<X size={12} />
```

## Allowed exceptions

- The em dash (`—`) used as punctuation in text labels is acceptable
- Keyboard key labels in the on-screen keyboard should use plain text (`DEL`, `OK`, `SHIFT`) instead of symbols

## Enforcement

Before committing changes, grep for Unicode characters in string literals inside `src/**/*.tsx`:

```bash
grep -rP "['\"][^'\"\x00-\x7F]['\"]" src/renderer/src/
```

If any matches are found, replace them with appropriate `lucide-react` icons or inline SVG.
