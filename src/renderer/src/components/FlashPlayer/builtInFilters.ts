export const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_texCoord;
}
`;

const FILTER_TEMPLATE = (body: string) => `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_resolution;
uniform float u_intensity;
uniform float u_time;
uniform float u_pixelateSize;
uniform float u_ditherLevels;

${body}

void main() {
  vec4 original = texture2D(u_source, v_uv);
  vec4 filtered = filterEffect(original, v_uv, u_source, u_resolution);
  gl_FragColor = mix(original, filtered, u_intensity);
}
`;

export interface BuiltInFilter {
  id: string;
  name: string;
  fragmentBody: string;
}

export const BUILT_IN_FILTERS: BuiltInFilter[] = [
  {
    id: "none",
    name: "None",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  return color;
}`,
  },
  {
    id: "dither",
    name: "Ordered Dither",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  int x = int(mod(gl_FragCoord.x, 4.0));
  int y = int(mod(gl_FragCoord.y, 4.0));
  int v;
  if      (x==0 && y==0) v = 0;
  else if (x==1 && y==0) v = 8;
  else if (x==2 && y==0) v = 2;
  else if (x==3 && y==0) v = 10;
  else if (x==0 && y==1) v = 12;
  else if (x==1 && y==1) v = 4;
  else if (x==2 && y==1) v = 14;
  else if (x==3 && y==1) v = 6;
  else if (x==0 && y==2) v = 3;
  else if (x==1 && y==2) v = 11;
  else if (x==2 && y==2) v = 1;
  else if (x==3 && y==2) v = 9;
  else if (x==0 && y==3) v = 15;
  else if (x==1 && y==3) v = 7;
  else if (x==2 && y==3) v = 13;
  else                   v = 5;
  float levels = u_ditherLevels;
  float threshold = (float(v) / 16.0 - 0.5) / levels;
  vec3 c = floor((color.rgb + threshold) * levels) / levels;
  return vec4(c, color.a);
}`,
  },
  {
    id: "edge-detect",
    name: "Edge Detect",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  vec2 texel = 1.0 / resolution;
  vec4 n[9];
  n[0] = texture2D(source, uv + vec2(-texel.x, -texel.y));
  n[1] = texture2D(source, uv + vec2( 0.0, -texel.y));
  n[2] = texture2D(source, uv + vec2( texel.x, -texel.y));
  n[3] = texture2D(source, uv + vec2(-texel.x,  0.0));
  n[4] = texture2D(source, uv);
  n[5] = texture2D(source, uv + vec2( texel.x,  0.0));
  n[6] = texture2D(source, uv + vec2(-texel.x,  texel.y));
  n[7] = texture2D(source, uv + vec2( 0.0,  texel.y));
  n[8] = texture2D(source, uv + vec2( texel.x,  texel.y));
  vec4 sobelEdgeH = n[2] + (2.0 * n[5]) + n[8] - (n[0] + (2.0 * n[3]) + n[6]);
  vec4 sobelEdgeV = n[0] + (2.0 * n[1]) + n[2] - (n[6] + (2.0 * n[7]) + n[8]);
  vec3 edge = sqrt((sobelEdgeH.rgb * sobelEdgeH.rgb) + (sobelEdgeV.rgb * sobelEdgeV.rgb));
  float e = length(edge);
  return vec4(vec3(e), color.a);
}`,
  },
  {
    id: "scanlines",
    name: "Scanlines",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  vec3 c = texture2D(source, uv).rgb;
  float scanline = sin(uv.y * resolution.y * 3.14159265) * 0.5 + 0.5;
  scanline = pow(scanline, 0.6);
  float mask = sin(uv.x * resolution.x * 3.14159265) * 0.5 + 0.5;
  mask = pow(mask, 0.7);
  c *= scanline * 0.4 + 0.6;
  c *= mask * 0.15 + 0.85;
  return vec4(c, color.a);
}`,
  },
  {
    id: "crt",
    name: "CRT Emulation",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  vec2 centered = uv * 2.0 - 1.0;
  vec2 offset = centered * centered * centered * 0.025;
  vec2 warped = (centered - offset) * 0.5 + 0.5;
  vec3 c = texture2D(source, warped).rgb;
  if (warped.x < 0.0 || warped.x > 1.0 || warped.y < 0.0 || warped.y > 1.0) {
    return vec4(0.0, 0.0, 0.0, 1.0);
  }
  float scanline = sin(warped.y * resolution.y * 3.14159265) * 0.5 + 0.5;
  scanline = pow(scanline, 0.5);
  c *= scanline * 0.25 + 0.75;
  float vig = 1.0 - dot(centered, centered) * 0.4;
  c *= vig;
  c *= 1.15;
  c.r *= 1.05;
  c.b *= 1.1;
  return vec4(c, color.a);
}`,
  },
  {
    id: "pixelate",
    name: "Pixelate",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  float blockCount = min(resolution.x, resolution.y) / u_pixelateSize;
  vec2 stepped = floor(uv * blockCount) / blockCount;
  return texture2D(source, stepped);
}`,
  },
  {
    id: "grayscale",
    name: "Grayscale",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  return vec4(vec3(gray), color.a);
}`,
  },
  {
    id: "invert",
    name: "Invert",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  return vec4(1.0 - color.rgb, color.a);
}`,
  },
  {
    id: "posterize",
    name: "Posterize",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  vec3 c = floor(color.rgb * 4.0 + 0.5) / 4.0;
  return vec4(c, color.a);
}`,
  },
  {
    id: "chromatic",
    name: "Chromatic Aberration",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  float amount = 3.0 / resolution.x;
  float r = texture2D(source, uv + vec2(amount, 0.0)).r;
  float g = texture2D(source, uv).g;
  float b = texture2D(source, uv - vec2(amount, 0.0)).b;
  return vec4(r, g, b, color.a);
}`,
  },
  {
    id: "sepia",
    name: "Sepia",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  vec3 c = color.rgb;
  vec3 sepia = vec3(
    dot(c, vec3(0.393, 0.769, 0.189)),
    dot(c, vec3(0.349, 0.686, 0.168)),
    dot(c, vec3(0.272, 0.534, 0.131))
  );
  return vec4(sepia, color.a);
}`,
  },
  {
    id: "bloom",
    name: "Bloom",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  vec2 texel = 1.0 / resolution;
  vec3 glow = vec3(0.0);
  glow += texture2D(source, uv + vec2(-texel.x, -texel.y)).rgb * 0.0625;
  glow += texture2D(source, uv + vec2( 0.0,     -texel.y)).rgb * 0.125;
  glow += texture2D(source, uv + vec2( texel.x,  -texel.y)).rgb * 0.0625;
  glow += texture2D(source, uv + vec2(-texel.x,  0.0     )).rgb * 0.125;
  glow += color.rgb                                          * 0.25;
  glow += texture2D(source, uv + vec2( texel.x,  0.0     )).rgb * 0.125;
  glow += texture2D(source, uv + vec2(-texel.x,  texel.y )).rgb * 0.0625;
  glow += texture2D(source, uv + vec2( 0.0,       texel.y )).rgb * 0.125;
  glow += texture2D(source, uv + vec2( texel.x,  texel.y )).rgb * 0.0625;
  vec3 bright = max(glow - 0.6, vec3(0.0));
  return vec4(color.rgb + bright * 1.2, color.a);
}`,
  },
  {
    id: "noise",
    name: "Film Grain",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  float x = gl_FragCoord.x / 12.9898;
  float y = gl_FragCoord.y / 78.233;
  float grain = fract(sin(dot(vec2(x, y), vec2(12.9898, 78.233))) * 43758.5453);
  grain = (grain - 0.5) * 0.15;
  return vec4(color.rgb + grain, color.a);
}`,
  },
  {
    id: "sharpen",
    name: "Sharpen",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  vec2 texel = 1.0 / resolution;
  vec3 blurred = texture2D(source, uv + vec2(-texel.x, -texel.y)).rgb * 0.0625;
  blurred += texture2D(source, uv + vec2( 0.0,     -texel.y)).rgb * 0.125;
  blurred += texture2D(source, uv + vec2( texel.x,  -texel.y)).rgb * 0.0625;
  blurred += texture2D(source, uv + vec2(-texel.x,  0.0     )).rgb * 0.125;
  blurred += color.rgb                                          * 0.25;
  blurred += texture2D(source, uv + vec2( texel.x,  0.0     )).rgb * 0.125;
  blurred += texture2D(source, uv + vec2(-texel.x,  texel.y )).rgb * 0.0625;
  blurred += texture2D(source, uv + vec2( 0.0,       texel.y )).rgb * 0.125;
  blurred += texture2D(source, uv + vec2( texel.x,  texel.y )).rgb * 0.0625;
  return vec4(color.rgb + (color.rgb - blurred) * 1.5, color.a);
}`,
  },
  {
    id: "blur",
    name: "Gaussian Blur",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  vec2 texel = 1.0 / resolution;
  vec3 c = vec3(0.0);
  c += texture2D(source, uv + vec2(-texel.x, -texel.y)).rgb * 0.0625;
  c += texture2D(source, uv + vec2( 0.0,     -texel.y)).rgb * 0.125;
  c += texture2D(source, uv + vec2( texel.x,  -texel.y)).rgb * 0.0625;
  c += texture2D(source, uv + vec2(-texel.x,  0.0     )).rgb * 0.125;
  c += color.rgb                                          * 0.25;
  c += texture2D(source, uv + vec2( texel.x,  0.0     )).rgb * 0.125;
  c += texture2D(source, uv + vec2(-texel.x,  texel.y )).rgb * 0.0625;
  c += texture2D(source, uv + vec2( 0.0,       texel.y )).rgb * 0.125;
  c += texture2D(source, uv + vec2( texel.x,  texel.y )).rgb * 0.0625;
  return vec4(c, color.a);
}`,
  },
  {
    id: "vignette",
    name: "Vignette",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  vec2 centered = (uv - 0.5) * 2.0;
  float dist = length(centered);
  float vig = 1.0 - smoothstep(0.5, 1.5, dist);
  return vec4(color.rgb * vig, color.a);
}`,
  },
  {
    id: "heatwave",
    name: "Heatwave",
    fragmentBody: `
vec4 filterEffect(vec4 color, vec2 uv, sampler2D source, vec2 resolution) {
  float yShift = sin(uv.x * 20.0 + u_time * 3.0) * 0.003;
  float xShift = cos(uv.y * 15.0 + u_time * 2.0) * 0.002;
  vec2 warped = uv + vec2(xShift, yShift);
  vec3 c = texture2D(source, warped).rgb;
  return vec4(c, color.a);
}`,
  },
];

export function getBuiltInFilter(id: string): BuiltInFilter | undefined {
  return BUILT_IN_FILTERS.find((f) => f.id === id);
}

export function wrapFilterBody(body: string): string {
  return FILTER_TEMPLATE(body);
}
