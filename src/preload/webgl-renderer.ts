/**
 * WebGL renderer for NV12 frames (preload version).
 *
 * Uploads Y and UV planes as two separate textures and performs
 * YUV→RGB conversion in the fragment shader.
 */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, -a_pos.y * 0.5 + 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_y;
uniform sampler2D u_uv;
uniform vec2 u_uv_size;  // (videoW/2, videoH/2) — UV texture dimensions in texels
uniform mat3 u_yuv_mat;  // column-major YCbCr->RGB matrix (set by setColorimetry)
uniform vec3 u_yuv_off;  // [yOff, cbOff, crOff]

// ===========================================================================
// 4:2:0 -> 4:4:4 chroma upsampling
// ===========================================================================
// NV12 from H.264/H.265 uses MPEG-2 type-1 co-siting:
//   horizontal: chroma co-sited at the LEFT (even) luma column, not centred.
//   vertical:   chroma centred between two luma rows (already correct).
//
// Hardware bilinear sampling at v_uv has a 0.25-texel horizontal position
// error because the sampler assumes chroma is centred in the 2x2 luma block.
// Fix: shift +0.25 chroma texels right and reconstruct with four NEAREST
// samples so we control every tap position exactly.
vec2 upsampleUV(vec2 lumaUV) {
  // Horizontal co-siting correction (+0.25 chroma texels = +0.5 luma pixels)
  vec2 uv = lumaUV + vec2(0.25 / u_uv_size.x, 0.0);

  // Texel-centre coordinates for the floor tap
  vec2 tc = uv * u_uv_size - 0.5;
  vec2 f  = fract(tc);
  vec2 p  = (floor(tc) + 0.5) / u_uv_size;
  vec2 d  = 1.0 / u_uv_size;

  // Four NEAREST samples — UV texture is set to NEAREST in the JS constructor
  // so each fetch is the discrete texel value, and we blend manually.
  vec2 s00 = texture2D(u_uv, p                  ).ra;
  vec2 s10 = texture2D(u_uv, p + vec2(d.x, 0.0)).ra;
  vec2 s01 = texture2D(u_uv, p + vec2(0.0, d.y)).ra;
  vec2 s11 = texture2D(u_uv, p + d              ).ra;

  return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
}

// ===========================================================================
// Transfer-function correction: BT.709 encoded -> linear -> sRGB encoded
// ===========================================================================
// Chromium's compositor treats canvas pixels as sRGB.  BT.709 and sRGB share
// the same primaries but differ in their transfer functions:
//
//   sRGB   breakpoint 0.0031308 linear (encoded ~0.040), exponent 1/2.4
//   BT.709 breakpoint 0.018     linear (encoded  0.081), exponent 1/0.45
//
// Without this correction the compositor decodes the BT.709 "linear segment"
// (0.040-0.081 encoded) using the sRGB gamma curve instead, causing visible
// shadow crush and mid-tone shifts compared to players like mpv/Celluloid.
//
// Cost: ~10 ALU ops per pixel — completely negligible on any modern GPU.

// BT.709 EOTF: gamma-encoded BT.709 -> linear light
vec3 eotf_bt709(vec3 v) {
  return mix(v / 4.5,
             pow((v + 0.099) / 1.099, vec3(1.0 / 0.45)),
             step(vec3(0.081), v));
}

// sRGB OETF: linear light -> sRGB-encoded (matches Chromium compositor)
vec3 oetf_srgb(vec3 v) {
  return mix(v * 12.92,
             1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055,
             step(vec3(0.0031308), v));
}

void main() {
  float y  = texture2D(u_y, v_uv).r;
  vec2  uv = upsampleUV(v_uv);

  // YCbCr -> BT.709-encoded RGB
  vec3 rgb = clamp(u_yuv_mat * (vec3(y, uv.x, uv.y) - u_yuv_off), 0.0, 1.0);

  // BT.709 encoded -> linear light -> sRGB encoded
  rgb = oetf_srgb(eotf_bt709(rgb));

  gl_FragColor = vec4(rgb, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vert);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, frag);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${info}`);
  }
  return prog;
}

// ---------------------------------------------------------------------------
// YUV→RGB matrix helpers
// ---------------------------------------------------------------------------

/**
 * Parse the GStreamer colorimetry string and return the column-major mat3
 * (Float32Array[9]) and vec3 offset (Float32Array[3]) ready for
 * gl.uniformMatrix3fv / gl.uniform3fv.
 *
 * GStreamer colorimetry can be a shorthand ("bt709", "bt601") or a
 * detailed four-field string "primaries:transfer:matrix:range" where
 * matrix values are: 1=RGB, 2=FCC, 3=BT709, 4=BT601, 5=SMPTE240M,
 * 6=BT2020 and range values are: 1=full(0-255), 2=limited(16-235).
 */
function yuvMatrixFromColorimetry(colorimetry: string): {
  mat: Float32Array;
  off: Float32Array;
} {
  const lower = colorimetry.toLowerCase();
  const parts = lower.split(":");

  // --- detect color range ---
  let limited = true; // default: limited (studio-swing, most video content)
  if (parts.length === 4) {
    const range = parseInt(parts[3], 10);
    if (range === 1) limited = false; // GST_VIDEO_COLOR_RANGE_0_255 = full
    if (range === 2) limited = true;  // GST_VIDEO_COLOR_RANGE_16_235 = limited
  } else if (lower.includes("full")) {
    limited = false;
  }

  // --- detect color matrix ---
  type Matrix = "bt601" | "bt709" | "bt2020";
  let matrix: Matrix = "bt709"; // safe HD default
  if (parts.length === 4) {
    const m = parseInt(parts[2], 10);
    if (m === 4) matrix = "bt601";
    else if (m === 3 || m === 5) matrix = "bt709";
    else if (m === 6) matrix = "bt2020";
  } else if (lower.includes("bt601") || lower.includes("sdtv") || lower.includes("smpte170")) {
    matrix = "bt601";
  } else if (lower.includes("bt2020") || lower.includes("2020")) {
    matrix = "bt2020";
  }

  console.log(`[WebGL] colorimetry="${colorimetry}" → matrix=${matrix}, limited=${limited}`);

  // --- build the 3×3 matrix ---
  // The GLSL mat3 is column-major: mat[col][row].
  // We want:  rgb = M * (yuv - off)
  // where yuv = [Y, Cb, Cr], off = [yOff, cbOff, crOff].
  //
  // Row layout:   R = M[0][0]*Yd + M[1][0]*Cbd + M[2][0]*Crd
  //               G = M[0][1]*Yd + M[1][1]*Cbd + M[2][1]*Crd
  //               B = M[0][2]*Yd + M[1][2]*Cbd + M[2][2]*Crd
  //
  // col0 = Y coefficients  [R_y, G_y, B_y]
  // col1 = Cb coefficients [R_cb, G_cb, B_cb]
  // col2 = Cr coefficients [R_cr, G_cr, B_cr]
  //
  // Standard limited-range: all three rows share the same Y gain (1.164).
  // Full-range: Y gain = 1, yOff = 0.

  const yGain = limited ? 1.164 : 1.0;
  const yOff  = limited ? 16 / 255 : 0.0;
  const cOff  = 128 / 255; // Cb/Cr are always centred at 128 regardless of range

  // Chroma coefficients (same for limited and full range — the range only
  // changes the luma offset/gain, not the colour difference factors).
  let rCr: number, gCb: number, gCr: number, bCb: number;
  if (matrix === "bt601") {
    rCr = 1.596; gCb = -0.392; gCr = -0.813; bCb = 2.017;
  } else if (matrix === "bt2020") {
    rCr = 1.678; gCb = -0.188; gCr = -0.652; bCb = 2.142;
  } else {
    // BT.709 (default)
    rCr = 1.793; gCb = -0.213; gCr = -0.533; bCb = 2.112;
  }

  // Float32Array in column-major order for gl.uniformMatrix3fv:
  const mat = new Float32Array([
    yGain, yGain, yGain, // col 0: Y  → R, G, B
    0,     gCb,   bCb,   // col 1: Cb → R, G, B
    rCr,   gCr,   0,     // col 2: Cr → R, G, B
  ]);
  const off = new Float32Array([yOff, cOff, cOff]);
  return { mat, off };
}

export class WebGLVideoRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private posLoc: number;
  private yLoc: WebGLUniformLocation | null;
  private uvLoc: WebGLUniformLocation | null;
  private matLoc: WebGLUniformLocation | null;
  private offLoc: WebGLUniformLocation | null;
  private uvSizeLoc: WebGLUniformLocation | null;
  private texY: WebGLTexture;
  private texUV: WebGLTexture;
  private buf: WebGLBuffer;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL not available");
    this.gl = gl;

    canvas.addEventListener("webglcontextlost", (e) => {
      console.error("[WebGL] Context lost — video playback will freeze until context is restored.", e);
    });
    canvas.addEventListener("webglcontextrestored", () => {
      console.log("[WebGL] Context restored.");
    });

    const prog = createProgram(gl, VERT, FRAG);
    this.program = prog;
    this.posLoc = gl.getAttribLocation(prog, "a_pos");
    this.yLoc   = gl.getUniformLocation(prog, "u_y");
    this.uvLoc  = gl.getUniformLocation(prog, "u_uv");
    this.matLoc    = gl.getUniformLocation(prog, "u_yuv_mat");
    this.offLoc    = gl.getUniformLocation(prog, "u_yuv_off");
    this.uvSizeLoc = gl.getUniformLocation(prog, "u_uv_size");

    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    this.texY = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texY);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.texUV = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texUV);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // NEAREST: the shader does its own 4-tap bilinear with explicit sample
    // positions that include the H.264/H.265 co-siting correction.
    // LINEAR would add a second bilinear pass on top of our manual one,
    // blurring the reconstruction and defeating the co-siting fix.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.useProgram(prog);
    gl.uniform1i(this.yLoc, 0);
    gl.uniform1i(this.uvLoc, 1);

    // Seed BT.709 limited-range defaults; overwritten by setColorimetry()
    // once the decoder reports the real caps colorimetry.
    const defaultCm = yuvMatrixFromColorimetry("bt709");
    gl.uniformMatrix3fv(this.matLoc, false, defaultCm.mat);
    gl.uniform3fv(this.offLoc, defaultCm.off);

    gl.clearColor(0, 0, 0, 1);
  }

  // Pixel-aspect-ratio correction: display aspect = (width * parN/parD) / height.
  // Stored as a ratio (not individual n/d) to keep render() simple.
  // 0 means "use coded dimensions" (default for square pixels).
  private _parRatio = 0;

  /**
   * Call once after opening the file, passing the colorimetry string from
   * the decoder metadata (e.g. "bt709", "bt601", "2:4:5:1") and the
   * pixel-aspect-ratio from caps (1/1 for square pixels).
   * The renderer computes the correct YCbCr→RGB matrix and uploads it,
   * and caches the PAR for use in render().
   */
  setColorimetry(colorimetry: string, parN = 1, parD = 1) {
    const { gl } = this;
    gl.useProgram(this.program);
    const { mat, off } = yuvMatrixFromColorimetry(colorimetry);
    gl.uniformMatrix3fv(this.matLoc, false, mat);
    gl.uniform3fv(this.offLoc, off);
    // Store PAR ratio — only non-trivial when parN !== parD
    this._parRatio = (parN === parD || parD === 0) ? 0 : parN / parD;
  }

  /**
   * Call once after the canvas is mounted and whenever the video dimensions
   * are known.  The canvas backing-store is set to its CSS layout size (×dpr)
   * so one CSS pixel == one physical pixel.  If the canvas hasn't been laid
   * out yet (clientWidth === 0) we fall back to the video dimensions so the
   * element has a sensible initial size.
   */
  resize(videoWidth: number, videoHeight: number) {
    const { canvas, gl } = this;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth  || videoWidth;
    const cssH = canvas.clientHeight || videoHeight;
    canvas.width  = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  render(y: Uint8Array, uv: Uint8Array, width: number, height: number) {
    const { gl, canvas } = this;

    // Keep the canvas backing-store in sync with its CSS display size.
    // This must happen every frame because the window (or container) may be
    // resized at any time.  Changing canvas.width/height only when the size
    // actually differs avoids the expensive framebuffer recreation on every frame.
    const dpr = window.devicePixelRatio || 1;
    const backW = Math.max(1, Math.floor((canvas.clientWidth  || width)  * dpr));
    const backH = Math.max(1, Math.floor((canvas.clientHeight || height) * dpr));
    if (canvas.width !== backW || canvas.height !== backH) {
      canvas.width  = backW;
      canvas.height = backH;
    }

    // Letterbox / pillarbox: fit the video inside the canvas while preserving
    // the video's own aspect ratio.  The remainder of the canvas is painted
    // black.
    // Apply pixel-aspect-ratio correction for anamorphic sources (PAR ≠ 1:1).
    const videoAspect = this._parRatio
      ? (width * this._parRatio) / height
      : width / height;
    const canvasAspect = backW / backH;
    let vx: number, vy: number, vw: number, vh: number;
    if (videoAspect > canvasAspect) {
      // Video is wider than the canvas → horizontal bars top and bottom.
      vw = backW;
      vh = Math.round(backW / videoAspect);
      vx = 0;
      vy = Math.round((backH - vh) / 2);
    } else {
      // Video is taller than the canvas → vertical bars left and right.
      vh = backH;
      vw = Math.round(backH * videoAspect);
      vx = Math.round((backW - vw) / 2);
      vy = 0;
    }

    // Clear the full canvas to black so the letterbox bars are painted.
    gl.viewport(0, 0, backW, backH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Constrain subsequent rendering to the video area only.
    gl.viewport(vx, vy, vw, vh);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texY);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.LUMINANCE,
      width, height, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, y
    );

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texUV);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA,
      width >> 1, height >> 1, 0,
      gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, uv
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(this.program);
    gl.uniform1i(this.yLoc, 0);
    gl.uniform1i(this.uvLoc, 1);
    gl.uniform2f(this.uvSizeLoc, width >> 1, height >> 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    const { gl } = this;
    gl.deleteTexture(this.texY);
    gl.deleteTexture(this.texUV);
    gl.deleteBuffer(this.buf);
    gl.deleteProgram(this.program);
  }
}
