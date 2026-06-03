export const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

export function wrapFragmentBody(body: string): string {
  return `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_source;
uniform vec2 u_resolution;
uniform float u_intensity;
uniform float u_time;
uniform int u_format;

${body}

void main() {
  vec2 uv = v_texCoord;
  vec4 color;
  if (u_format == 1) {
    // XRGB8888 (little-endian BGRA) — swizzle B/R
    vec4 raw = texture2D(u_source, uv);
    color = vec4(raw.b, raw.g, raw.r, 1.0);
  } else {
    color = texture2D(u_source, uv);
  }
  gl_FragColor = applyFilter(color, uv, u_resolution, u_intensity, u_time);
}
`;
}

export interface ShaderPreset {
  id: string;
  name: string;
  fragmentBody: string;
}

export const SHADER_PRESETS: ShaderPreset[] = [
  {
    id: "none",
    name: "None",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  return color;
}
`,
  },
  {
    id: "crt-easymode",
    name: "CRT Easymode",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec2 coord = uv * resolution;
  float scanline = sin(coord.y * 3.14159 * 0.5) * 0.08 + 0.92;
  float mask = sin(coord.x * 3.14159) * 0.06 + 0.94;
  vec3 c = color.rgb * scanline * mask;
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },
  {
    id: "crt-lottes",
    name: "CRT Lottes",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec2 coord = uv * resolution;
  float scanline = sin(coord.y * 3.14159 * 0.75) * 0.15 + 0.85;
  float mask = sin(coord.x * 3.14159 * 0.5) * 0.1 + 0.9;
  float curvature = 1.0 - length((uv - 0.5) * 0.8);
  curvature = max(curvature, 0.3);
  vec3 c = color.rgb * scanline * mask * curvature;
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },
  {
    id: "scanlines",
    name: "Scanlines",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  float scanline = sin(uv.y * resolution.y * 3.14159) * 0.5 + 0.5;
  scanline = scanline * 0.3 + 0.7;
  vec3 c = color.rgb * scanline;
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },
  {
    id: "bloom",
    name: "Bloom",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec3 c = color.rgb;
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 bloom = c * max(luma - 0.5, 0.0) * 2.0;
  return vec4(mix(c, c + bloom, intensity), color.a);
}
`,
  },
  {
    id: "lcd-grid",
    name: "LCD Grid",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec2 grid = fract(uv * resolution / 3.0);
  float gridMask = step(0.05, grid.x) * step(0.05, grid.y);
  vec3 c = color.rgb * (gridMask * 0.3 + 0.7);
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },
  {
    id: "warm",
    name: "Warm",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  mat3 warmMat = mat3(
    1.1, 0.1, 0.0,
    0.1, 1.0, 0.0,
    0.0, 0.0, 0.9
  );
  vec3 c = warmMat * color.rgb;
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },
  {
    id: "greyscale",
    name: "Greyscale",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 c = vec3(luma);
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },

  // --- CRT / Retro ---
  {
    id: "crt-geom",
    name: "CRT Geom",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec2 curve = (uv - 0.5) * 2.0;
  vec2 curved = curve * (1.0 + dot(curve, curve) * 0.05);
  vec2 warpedUV = curved * 0.5 + 0.5;
  if (warpedUV.x < 0.0 || warpedUV.x > 1.0 || warpedUV.y < 0.0 || warpedUV.y > 1.0)
    return vec4(0.0, 0.0, 0.0, 1.0);
  vec2 coord = warpedUV * resolution;
  float scanline = sin(coord.y * 3.14159 * 0.5) * 0.12 + 0.88;
  float mask = sin(coord.x * 3.14159 * 0.33) * 0.08 + 0.92;
  vec4 src = texture2D(u_source, warpedUV);
  if (u_format == 1) { float tmp = src.r; src.r = src.b; src.b = tmp; }
  vec3 c = src.rgb * scanline * mask;
  return vec4(mix(src.rgb, c, intensity), 1.0);
}
`,
  },
  {
    id: "slot-mask",
    name: "Slot Mask",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec2 coord = uv * resolution;
  float col = mod(floor(coord.x / 3.0), 3.0);
  vec3 mask = vec3(1.0);
  if (col < 0.5)      mask = vec3(1.0, 0.7, 0.7);
  else if (col < 1.5) mask = vec3(0.7, 1.0, 0.7);
  else                mask = vec3(0.7, 0.7, 1.0);
  float scanline = sin(coord.y * 3.14159 * 0.5) * 0.1 + 0.9;
  vec3 c = color.rgb * mask * scanline;
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },
  {
    id: "phosphor",
    name: "Phosphor Persistence",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec2 coord = uv * resolution;
  float scanline = sin(coord.y * 3.14159 * 0.5) * 0.1 + 0.9;
  // Simulate phosphor green tint + persistence glow
  vec3 phosphor = color.rgb * vec3(0.85, 1.05, 0.85);
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  phosphor += vec3(0.0, luma * 0.12, 0.0);
  vec3 c = phosphor * scanline;
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },

  // --- LCD / Handheld ---
  {
    id: "gb-dmg",
    name: "Game Boy (DMG)",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  // 4-shade DMG palette: darkest to lightest
  vec3 p0 = vec3(0.060, 0.102, 0.035);
  vec3 p1 = vec3(0.188, 0.298, 0.102);
  vec3 p2 = vec3(0.522, 0.651, 0.259);
  vec3 p3 = vec3(0.608, 0.737, 0.055);
  vec3 dmg;
  if      (luma < 0.25) dmg = p0;
  else if (luma < 0.50) dmg = p1;
  else if (luma < 0.75) dmg = p2;
  else                  dmg = p3;
  vec2 grid = fract(uv * resolution / 2.0);
  float pixel = step(0.08, grid.x) * step(0.08, grid.y);
  dmg *= pixel * 0.15 + 0.85;
  return vec4(mix(color.rgb, dmg, intensity), color.a);
}
`,
  },
  {
    id: "gba-lcd",
    name: "GBA LCD",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  // GBA had a slightly washed-out, blue-tinted LCD
  vec3 gba = color.rgb * vec3(0.82, 0.88, 1.0);
  gba = pow(gba, vec3(1.15));
  vec2 grid = fract(uv * resolution / 2.0);
  float pixel = step(0.06, grid.x) * step(0.06, grid.y);
  gba *= pixel * 0.12 + 0.88;
  return vec4(mix(color.rgb, gba, intensity), color.a);
}
`,
  },
  {
    id: "lcd-ghosting",
    name: "LCD Ghosting",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  // Smear luma horizontally to mimic slow-pixel LCD ghosting
  vec2 offset = vec2(2.0 / resolution.x, 0.0);
  vec4 prev = texture2D(u_source, uv - offset);
  if (u_format == 1) { float t = prev.r; prev.r = prev.b; prev.b = t; }
  vec3 ghost = mix(color.rgb, prev.rgb, 0.35);
  return vec4(mix(color.rgb, ghost, intensity), color.a);
}
`,
  },

  // --- Pixel Art / Sharpening ---
  {
    id: "sharp-bilinear",
    name: "Sharp Bilinear",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  // Sub-pixel sharp sampling: clamp within pixel center
  vec2 texel = uv * resolution;
  vec2 frac = fract(texel);
  vec2 clamped = texel - frac + clamp(frac * 4.0, 0.0, 1.0) * 0.5 + 0.25;
  vec4 sharp = texture2D(u_source, clamped / resolution);
  if (u_format == 1) { float t = sharp.r; sharp.r = sharp.b; sharp.b = t; }
  return vec4(mix(color.rgb, sharp.rgb, intensity), color.a);
}
`,
  },
  {
    id: "nearest",
    name: "Nearest (Crisp Pixels)",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec2 texel = floor(uv * resolution) + 0.5;
  vec4 crisp = texture2D(u_source, texel / resolution);
  if (u_format == 1) { float t = crisp.r; crisp.r = crisp.b; crisp.b = t; }
  return vec4(mix(color.rgb, crisp.rgb, intensity), color.a);
}
`,
  },
  {
    id: "unsharp-mask",
    name: "Unsharp Mask",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec2 d = 1.0 / resolution;
  vec3 blur = (
    texture2D(u_source, uv + vec2(-d.x, 0.0)).rgb +
    texture2D(u_source, uv + vec2( d.x, 0.0)).rgb +
    texture2D(u_source, uv + vec2(0.0, -d.y)).rgb +
    texture2D(u_source, uv + vec2(0.0,  d.y)).rgb
  ) * 0.25;
  vec3 sharp = color.rgb + (color.rgb - blur) * 1.5;
  return vec4(mix(color.rgb, clamp(sharp, 0.0, 1.0), intensity), color.a);
}
`,
  },

  // --- Bloom / Glow ---
  {
    id: "halation",
    name: "Halation",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec2 d = 3.0 / resolution;
  vec3 glow = vec3(0.0);
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      vec2 offset = vec2(float(x), float(y)) * d;
      glow += texture2D(u_source, uv + offset).rgb;
    }
  }
  glow /= 25.0;
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 c = color.rgb + glow * max(luma - 0.4, 0.0) * 1.5;
  return vec4(mix(color.rgb, clamp(c, 0.0, 1.0), intensity), color.a);
}
`,
  },
  {
    id: "glow-border",
    name: "Glow Border",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 glowColor = color.rgb * max(luma - 0.45, 0.0) * 3.0;
  vec2 d = 2.0 / resolution;
  vec3 spread = vec3(0.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      spread += texture2D(u_source, uv + vec2(float(i), float(j)) * d).rgb;
    }
  }
  spread /= 9.0;
  float spreadLuma = dot(spread, vec3(0.299, 0.587, 0.114));
  vec3 c = color.rgb + spread * max(spreadLuma - 0.4, 0.0) * 1.8;
  return vec4(mix(color.rgb, clamp(c, 0.0, 1.0), intensity), color.a);
}
`,
  },

  // --- Color Grading ---
  {
    id: "cool",
    name: "Cool",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec3 c = color.rgb * vec3(0.85, 0.92, 1.12);
  return vec4(mix(color.rgb, clamp(c, 0.0, 1.0), intensity), color.a);
}
`,
  },
  {
    id: "vivid",
    name: "Vivid",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 c = mix(vec3(luma), color.rgb, 1.5);
  c = pow(clamp(c, 0.0, 1.0), vec3(0.9));
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },
  {
    id: "muted",
    name: "Muted / Film",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 c = mix(vec3(luma), color.rgb, 0.75);
  // Lift blacks slightly
  c = c * 0.88 + 0.06;
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },
  {
    id: "sepia",
    name: "Sepia",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 c = vec3(luma * 1.12, luma * 0.92, luma * 0.72);
  return vec4(mix(color.rgb, clamp(c, 0.0, 1.0), intensity), color.a);
}
`,
  },
  {
    id: "night-mode",
    name: "Night Mode",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  vec3 c = color.rgb * vec3(0.9, 0.75, 0.55);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.1));
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },
  {
    id: "gamma-correct",
    name: "Gamma Correct (2.2)",
    fragmentBody: `
vec4 applyFilter(vec4 color, vec2 uv, vec2 resolution, float intensity, float time) {
  // Many retro systems output linear light; apply sRGB gamma
  vec3 c = pow(clamp(color.rgb, 0.0, 1.0), vec3(1.0 / 2.2));
  return vec4(mix(color.rgb, c, intensity), color.a);
}
`,
  },
];

export function getShaderPreset(id: string): ShaderPreset | undefined {
  return SHADER_PRESETS.find((s) => s.id === id);
}
