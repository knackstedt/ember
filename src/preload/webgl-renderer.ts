/**
 * WebGL renderer for RGBA frames (preload version).
 *
 * Uploads a single RGBA texture and blits it to the canvas
 * with letterboxing to preserve the video's aspect ratio.
 */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
uniform vec2 u_scale;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, -a_pos.y * 0.5 + 0.5);
  gl_Position = vec4(a_pos * u_scale, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() {
  gl_FragColor = vec4(texture2D(u_tex, v_uv).rgb, 1.0);
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

const RENDERER_BUILD_ID = "webgl-2025-06-12-letterbox";

export class WebGLVideoRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private posLoc: number;
  private texLoc: WebGLUniformLocation | null;
  private scaleLoc: WebGLUniformLocation | null;
  private tex: WebGLTexture;
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
    this.texLoc = gl.getUniformLocation(prog, "u_tex");
    this.scaleLoc = gl.getUniformLocation(prog, "u_scale");

    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.useProgram(prog);
    gl.uniform1i(this.texLoc, 0);

    gl.clearColor(0, 0, 0, 1);
  }

  resize(width: number, height: number) {
    const { canvas, gl } = this;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  render(rgba: Uint8Array, width: number, height: number) {
    const { gl, canvas } = this;

    // Letterbox: compute scale so the video quad preserves its
    // aspect ratio inside the canvas viewport.
    const canvasAspect = canvas.width / canvas.height;
    const videoAspect = width / height;
    let scaleX = 1;
    let scaleY = 1;
    if (canvasAspect > videoAspect) {
      // Canvas is wider than video — black bars on left/right
      scaleX = videoAspect / canvasAspect;
    } else {
      // Canvas is taller than video — black bars on top/bottom
      scaleY = canvasAspect / videoAspect;
    }

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      rgba
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(this.program);
    gl.uniform1i(this.texLoc, 0);
    gl.uniform2f(this.scaleLoc, scaleX, scaleY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    const { gl } = this;
    gl.deleteTexture(this.tex);
    gl.deleteBuffer(this.buf);
    gl.deleteProgram(this.program);
  }
}
