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

// BT.709 limited-range YCbCr -> RGB
// Y in [16/255, 235/255]; Cb/Cr centred on 128/255 (range 16-240).
// The 1.164 factor restores the full luma swing; coefficients match the
// ITU-R BT.709 limited-range matrix.
vec3 yuv2rgb(float y, float u, float v) {
  float yy = 1.164 * (y - 16.0 / 255.0);
  float r = yy + 1.793 * v;
  float g = yy - 0.213 * u - 0.533 * v;
  float b = yy + 2.112 * u;
  return vec3(r, g, b);
}

void main() {
  float y = texture2D(u_y, v_uv).r;
  vec2 uv = texture2D(u_uv, v_uv).ra - vec2(0.5, 0.5);
  vec3 rgb = yuv2rgb(y, uv.r, uv.g);
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
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

export class WebGLVideoRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private posLoc: number;
  private yLoc: WebGLUniformLocation | null;
  private uvLoc: WebGLUniformLocation | null;
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
    this.yLoc = gl.getUniformLocation(prog, "u_y");
    this.uvLoc = gl.getUniformLocation(prog, "u_uv");

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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.useProgram(prog);
    gl.uniform1i(this.yLoc, 0);
    gl.uniform1i(this.uvLoc, 1);

    gl.clearColor(0, 0, 0, 1);
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
    const videoAspect  = width  / height;
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
