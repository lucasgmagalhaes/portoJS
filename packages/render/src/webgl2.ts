import type { BatchResult, Texture } from './batch.ts';
import type { Camera2D } from './camera.ts';
import { RendererEvents } from './context-loss.ts';
import type { RendererEvent } from './context-loss.ts';
import { INSTANCE_BYTES } from './renderer.ts';
import type { ClearColor, RenderOptions, Renderer, TextureSource } from './renderer.ts';

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 iPosSize;
layout(location = 2) in vec4 iRotOriginU;
layout(location = 3) in vec3 iVUvVh;
layout(location = 4) in vec4 iColor;
uniform mat4 uViewProj;
out vec2 vUv;
out vec4 vColor;
void main() {
  vec2 local = (aCorner - iRotOriginU.yz) * iPosSize.zw;
  float c = cos(iRotOriginU.x);
  float s = sin(iRotOriginU.x);
  vec2 rotated = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  gl_Position = uViewProj * vec4(iPosSize.xy + rotated, 0.0, 1.0);
  vUv = vec2(iRotOriginU.w + aCorner.x * iVUvVh.y, iVUvVh.x + aCorner.y * iVUvVh.z);
  vColor = vec4(iColor.a, iColor.b, iColor.g, iColor.r);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
in vec4 vColor;
out vec4 outColor;
void main() {
  vec4 color = texture(uTexture, vUv) * vColor;
  outColor = vec4(color.rgb * color.a, color.a);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error('WebGL2: could not create a shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`WebGL2: shader failed to compile: ${log}`);
  }
  return shader;
}

interface Resources {
  readonly program: WebGLProgram;
  readonly quad: WebGLBuffer;
  readonly instances: WebGLBuffer;
  readonly vao: WebGLVertexArrayObject;
  readonly viewProj: WebGLUniformLocation | null;
}

interface TextureEntry {
  handle: WebGLTexture | undefined;
  readonly source: TextureSource;
  readonly width: number;
  readonly height: number;
}

/**
 * The WebGL2 backend: instanced quads, one draw call per texture group.
 *
 * When the browser takes the context away (`webglcontextlost`) drawing pauses; when it gives it
 * back the program, buffers and every texture are rebuilt from the images they came from.
 */
export class WebGL2Renderer implements Renderer {
  readonly backend = 'webgl2' as const;

  private resources: Resources;
  private readonly matrix = new Float32Array(16);
  private readonly textures = new Map<number, TextureEntry>();
  private readonly events = new RendererEvents();
  private capacity = 0;
  private nextTextureId = 1;
  private isLost = false;

  /**
   * @param canvas the canvas to draw to.
   * @param gl a WebGL2 context of that canvas.
   * @param clearColor colour to clear to every frame.
   */
  constructor(
    readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly gl: WebGL2RenderingContext,
    private readonly clearColor: ClearColor,
  ) {
    this.resources = this.build();
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  get lost(): boolean {
    return this.isLost;
  }

  on(event: RendererEvent, listener: () => void): () => void {
    return this.events.on(event, listener);
  }

  createTexture(source: TextureSource): Texture {
    const id = this.nextTextureId;
    this.nextTextureId += 1;
    const entry: TextureEntry = {
      handle: undefined,
      source,
      width: source.width,
      height: source.height,
    };
    if (!this.isLost) entry.handle = this.upload(source);
    this.textures.set(id, entry);
    return { id, width: entry.width, height: entry.height };
  }

  deleteTexture(texture: Texture): void {
    const entry = this.textures.get(texture.id);
    if (entry === undefined) return;
    if (entry.handle !== undefined) this.gl.deleteTexture(entry.handle);
    this.textures.delete(texture.id);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  render(camera: Camera2D, batch: BatchResult, options: RenderOptions = {}): void {
    if (this.isLost) return;
    const gl = this.gl;
    const { program, instances, vao, viewProj } = this.resources;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, width, height);
    if (options.clear !== false) {
      gl.clearColor(...this.clearColor);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (batch.count === 0) return;
    const region = options.viewport;
    if (region !== undefined) {
      const bottom = height - region.y - region.height;
      gl.viewport(region.x, bottom, region.width, region.height);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(region.x, bottom, region.width, region.height);
    }
    gl.useProgram(program);
    gl.uniformMatrix4fv(viewProj, false, camera.viewProjection(this.matrix));
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    if (batch.count > this.capacity) {
      this.capacity = Math.max(batch.count, this.capacity * 2);
      gl.bufferData(gl.ARRAY_BUFFER, this.capacity * INSTANCE_BYTES, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.data);
    for (const group of batch.groups) {
      const handle = this.textures.get(group.texture.id)?.handle;
      if (handle === undefined) continue;
      gl.bindTexture(gl.TEXTURE_2D, handle);
      this.pointInstances(group.start * INSTANCE_BYTES);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, group.count);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, width, height);
  }

  destroy(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.events.clear();
    const gl = this.gl;
    for (const entry of this.textures.values()) {
      if (entry.handle !== undefined) gl.deleteTexture(entry.handle);
    }
    this.textures.clear();
    const { quad, instances, vao, program } = this.resources;
    gl.deleteBuffer(quad);
    gl.deleteBuffer(instances);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
  }

  private build(): Resources {
    const gl = this.gl;
    const program = gl.createProgram();
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      throw new Error(`WebGL2: program failed to link: ${gl.getProgramInfoLog(program) ?? ''}`);
    }
    const viewProj = gl.getUniformLocation(program, 'uViewProj');
    const vao = gl.createVertexArray();
    const quad = gl.createBuffer();
    const instances = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    this.pointInstances(0);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.capacity = 0;
    return { program, quad, instances, vao, viewProj };
  }

  private upload(source: TextureSource): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private readonly onLost = (event: Event): void => {
    event.preventDefault();
    this.isLost = true;
    for (const entry of this.textures.values()) entry.handle = undefined;
    this.events.emit('contextlost');
  };

  private readonly onRestored = (): void => {
    this.resources = this.build();
    for (const entry of this.textures.values()) entry.handle = this.upload(entry.source);
    this.isLost = false;
    this.events.emit('contextrestored');
  };

  private pointInstances(offset: number): void {
    const gl = this.gl;
    const stride = INSTANCE_BYTES;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, offset + 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, offset + 32);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, stride, offset + 44);
    gl.vertexAttribDivisor(4, 1);
  }
}

/**
 * Creates a WebGL2 renderer, or returns `undefined` when the canvas cannot give a WebGL2 context.
 */
export function createWebGL2Renderer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  clearColor: ClearColor,
): WebGL2Renderer | undefined {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true });
  if (gl === null) return undefined;
  return new WebGL2Renderer(canvas, gl, clearColor);
}
