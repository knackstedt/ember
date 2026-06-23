export function coerceResolution(raw?: string): string | undefined {
  if (!raw) return undefined;
  const width = parseInt(raw.split("x")[0], 10);
  if (!width || isNaN(width)) return raw;

  const tiers = [
    { min: 7680, label: "8K" },
    { min: 3840, label: "4K" },
    { min: 2560, label: "1440p" },
    { min: 1920, label: "1080p" },
    { min: 1280, label: "720p" },
    { min: 854, label: "480p" },
    { min: 640, label: "360p" },
    { min: 426, label: "240p" },
  ];

  for (const tier of tiers) {
    if (width >= tier.min) return tier.label;
  }

  return `${width}p`;
}
