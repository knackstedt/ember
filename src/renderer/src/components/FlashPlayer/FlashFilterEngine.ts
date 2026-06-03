import { VERTEX_SHADER, wrapFilterBody, getBuiltInFilter } from "./builtInFilters";

export interface FilterState {
  id: string;
  name: string;
  fragmentSource: string;
  intensity: number;
}

export class FlashFilterEngine {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private animationId = 0;
  private sourceCanvas: HTMLCanvasElement | null = null;
  private targetCanvas: HTMLCanvasElement;
  private currentFilter: FilterState | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private startTime = performance.now();
  private pixelateSize = 4;
  private ditherLevels = 4;
  private _running = false;
  private _disposed = false;
  private _visibilityHandler: (() => void) | null = null;

  constructor(targetCanvas: HTMLCanvasElement) {
    this.targetCanvas = targetCanvas;
    this.init();
    this._visibilityHandler = () => {
      if (document.hidden) {
        this.stop();
      } else if (this._running) {
        this.start();
      }
    };
    document.addEventListener("visibilitychange", this._visibilityHandler);
  }

  private init() {
    const gl = this.targetCanvas.getContext("webgl", {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
    });
    if (!gl) {
      console.error("[FlashFilterEngine] WebGL not available");
      return;
    }
    this.gl = gl;

    // Fullscreen quad (clip space)
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    // Flip V so Canvas top-left (0,0) maps to WebGL texture bottom-left
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.compileProgram(VERTEX_SHADER, wrapFilterBody(getBuiltInFilter("none")!.fragmentBody));
    this.start();
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(
        `[FlashFilterEngine] Shader compile error: ${gl.getShaderInfoLog(shader)}`
      );
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private compileProgram(vertexSource: string, fragmentSource: string) {
    const gl = this.gl;
    if (!gl) return;
    if (this.program) {
      gl.deleteProgram(this.program);
    }
    const vs = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vs || !fs) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(`[FlashFilterEngine] Program link error: ${gl.getProgramInfoLog(program)}`);
      gl.deleteProgram(program);
      return;
    }

    this.program = program;
    gl.useProgram(program);

    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texLoc = gl.getAttribLocation(program, "a_texCoord");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    this.uniforms = {
      u_source: gl.getUniformLocation(program, "u_source"),
      u_resolution: gl.getUniformLocation(program, "u_resolution"),
      u_intensity: gl.getUniformLocation(program, "u_intensity"),
      u_time: gl.getUniformLocation(program, "u_time"),
      u_pixelateSize: gl.getUniformLocation(program, "u_pixelateSize"),
      u_ditherLevels: gl.getUniformLocation(program, "u_ditherLevels"),
    };

    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }

  setSourceCanvas(canvas: HTMLCanvasElement) {
    this.sourceCanvas = canvas;
  }

  setFilter(id: string, customContent?: string) {
    const builtIn = getBuiltInFilter(id);
    if (builtIn) {
      this.currentFilter = {
        id: builtIn.id,
        name: builtIn.name,
        fragmentSource: wrapFilterBody(builtIn.fragmentBody),
        intensity: this.currentFilter?.intensity ?? 1.0,
      };
    } else if (customContent) {
      this.currentFilter = {
        id,
        name: id,
        fragmentSource: wrapFilterBody(customContent),
        intensity: this.currentFilter?.intensity ?? 1.0,
      };
    } else {
      this.currentFilter = null;
      return;
    }
    this.compileProgram(VERTEX_SHADER, this.currentFilter.fragmentSource);
  }

  setIntensity(value: number) {
    if (this.currentFilter) {
      this.currentFilter.intensity = Math.max(0, Math.min(1, value));
    }
  }

  setPixelateSize(value: number) {
    this.pixelateSize = Math.max(1, Math.min(128, value));
  }

  setDitherLevels(value: number) {
    this.ditherLevels = Math.max(2, Math.min(16, Math.floor(value)));
  }

  getFilterId(): string | null {
    return this.currentFilter?.id ?? null;
  }

  private render = () => {
    const gl = this.gl;
    if (!gl || !this.sourceCanvas) return;

    const src = this.sourceCanvas;
    const dst = this.targetCanvas;

    // Match target canvas size to source (or container)
    const displayWidth = src.clientWidth || src.width;
    const displayHeight = src.clientHeight || src.height;
    if (dst.width !== displayWidth || dst.height !== displayHeight) {
      dst.width = displayWidth;
      dst.height = displayHeight;
      gl.viewport(0, 0, displayWidth, displayHeight);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

    if (this.program) {
      gl.useProgram(this.program);
      gl.uniform1i(this.uniforms.u_source, 0);
      gl.uniform2f(this.uniforms.u_resolution, displayWidth, displayHeight);
      gl.uniform1f(
        this.uniforms.u_intensity,
        this.currentFilter?.intensity ?? 1.0
      );
      gl.uniform1f(
        this.uniforms.u_time,
        (performance.now() - this.startTime) / 1000.0
      );
      gl.uniform1f(this.uniforms.u_pixelateSize, this.pixelateSize);
      gl.uniform1f(this.uniforms.u_ditherLevels, this.ditherLevels);
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  private loop = () => {
    this.render();
    this.animationId = requestAnimationFrame(this.loop);
  };

  start() {
    if (this._disposed) return;
    this._running = true;
    if (this.animationId || document.hidden) return;
    this.animationId = requestAnimationFrame(this.loop);
  }

  stop() {
    this._running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  dispose() {
    this._disposed = true;
    this.stop();
    if (this._visibilityHandler) {
      document.removeEventListener("visibilitychange", this._visibilityHandler);
      this._visibilityHandler = null;
    }
    const gl = this.gl;
    if (gl) {
      if (this.program) gl.deleteProgram(this.program);
      if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
      if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
      if (this.texture) gl.deleteTexture(this.texture);
    }
    this.gl = null;
    this.program = null;
    this.positionBuffer = null;
    this.texCoordBuffer = null;
    this.texture = null;
  }
}
