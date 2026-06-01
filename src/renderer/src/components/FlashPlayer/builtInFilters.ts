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
];

export function getBuiltInFilter(id: string): BuiltInFilter | undefined {
  return BUILT_IN_FILTERS.find((f) => f.id === id);
}

export function wrapFilterBody(body: string): string {
  return FILTER_TEMPLATE(body);
}
