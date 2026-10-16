import type { BatchResult, Texture } from './batch.ts';
import type { Camera2D } from './camera.ts';
import { RendererEvents } from './context-loss.ts';
import type { RendererEvent } from './context-loss.ts';
import { INSTANCE_BYTES, MATRIX_BYTES } from './renderer.ts';
import type { ClearColor, RenderOptions, Renderer, TextureSource } from './renderer.ts';

const SHADER = `
struct Uniforms { viewProj : mat4x4<f32> };
@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var spriteSampler : sampler;
@group(0) @binding(2) var spriteTexture : texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) color : vec4<f32>,
};

@vertex
fn vertexMain(
  @builtin(vertex_index) index : u32,
  @location(0) posSize : vec4<f32>,
  @location(1) rotOriginU : vec4<f32>,
  @location(2) vUvVh : vec3<f32>,
  @location(3) color : vec4<f32>,
) -> VertexOutput {
  let corner = vec2<f32>(f32(index & 1u), f32(index >> 1u));
  let local = (corner - rotOriginU.yz) * posSize.zw;
  let c = cos(rotOriginU.x);
  let s = sin(rotOriginU.x);
  let rotated = vec2<f32>(local.x * c - local.y * s, local.x * s + local.y * c);
  var out : VertexOutput;
  out.position = uniforms.viewProj * vec4<f32>(posSize.xy + rotated, 0.0, 1.0);
  out.uv = vec2<f32>(rotOriginU.w + corner.x * vUvVh.y, vUvVh.x + corner.y * vUvVh.z);
  out.color = vec4<f32>(color.w, color.z, color.y, color.x);
  return out;
}

@fragment
fn fragmentMain(input : VertexOutput) -> @location(0) vec4<f32> {
  let color = textureSample(spriteTexture, spriteSampler, input.uv) * input.color;
  return vec4<f32>(color.rgb * color.a, color.a);
}
`;

interface Resources {
  readonly pipeline: GPURenderPipeline;
  readonly uniforms: GPUBuffer;
  readonly sampler: GPUSampler;
}

interface TextureEntry {
  texture: GPUTexture | undefined;
  group: GPUBindGroup | undefined;
  readonly source: TextureSource;
  readonly width: number;
  readonly height: number;
}

/**
 * A new device and the canvas format to use after the old one was lost.
 */
export interface GpuConnection {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
}

/**
 * The WebGPU backend: one instanced draw per texture group.
 *
 * When the device is lost (`device.lost`) drawing pauses. If a way to get a new device was given
 * (it is, when made by {@link createWebGPURenderer}) the renderer asks for one, rebuilds the
 * pipeline and re-uploads every texture from the images they came from.
 */
export class WebGPURenderer implements Renderer {
  readonly backend = 'webgpu' as const;

  private resources: Resources;
  private readonly matrix = new Float32Array(16);
  private readonly textures = new Map<number, TextureEntry>();
  private readonly events = new RendererEvents();
  private instances: GPUBuffer;
  private capacity = 1024;
  private nextTextureId = 1;
  private isLost = false;
  private destroyed = false;

  /**
   * @param canvas the canvas to draw to.
   * @param device the GPU device.
   * @param context the canvas' WebGPU context, already configured.
   * @param format the context's texture format.
   * @param clearColor colour to clear to every frame.
   * @param reconnect gets a new device after a loss. Without it a lost device stays lost.
   */
  constructor(
    readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private device: GPUDevice,
    private readonly context: GPUCanvasContext,
    format: GPUTextureFormat,
    private readonly clearColor: ClearColor,
    private readonly reconnect?: () => Promise<GpuConnection>,
  ) {
    this.resources = this.build(format);
    this.instances = this.allocateInstances(this.capacity);
    this.watch(device);
  }

  get lost(): boolean {
    return this.isLost;
  }

  on(event: RendererEvent, listener: () => void): () => void {
    return this.events.on(event, listener);
  }

  /**
   * Tries to get a new device after a loss. Called by the renderer itself right after the loss;
   * call it again if that failed (for example when the GPU was still resetting).
   *
   * @returns whether the renderer is working again.
   */
  async restore(): Promise<boolean> {
    if (!this.isLost || this.reconnect === undefined || this.destroyed) return !this.isLost;
    let connection: GpuConnection;
    try {
      connection = await this.reconnect();
    } catch {
      return false;
    }
    if (this.gone) return false;
    this.device = connection.device;
    this.context.configure({
      device: connection.device,
      format: connection.format,
      alphaMode: 'premultiplied',
    });
    this.resources = this.build(connection.format);
    this.capacity = 1024;
    this.instances = this.allocateInstances(this.capacity);
    for (const entry of this.textures.values()) this.upload(entry);
    this.isLost = false;
    this.watch(connection.device);
    this.events.emit('contextrestored');
    return true;
  }

  createTexture(source: TextureSource): Texture {
    const id = this.nextTextureId;
    this.nextTextureId += 1;
    const entry: TextureEntry = {
      texture: undefined,
      group: undefined,
      source,
      width: source.width,
      height: source.height,
    };
    if (!this.isLost) this.upload(entry);
    this.textures.set(id, entry);
    return { id, width: entry.width, height: entry.height };
  }

  deleteTexture(texture: Texture): void {
    const entry = this.textures.get(texture.id);
    if (entry === undefined) return;
    entry.texture?.destroy();
    this.textures.delete(texture.id);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  render(camera: Camera2D, batch: BatchResult, options: RenderOptions = {}): void {
    if (this.isLost) return;
    const device = this.device;
    const { pipeline, uniforms } = this.resources;
    if (batch.count > this.capacity) {
      this.instances.destroy();
      this.capacity = Math.max(batch.count, this.capacity * 2);
      this.instances = this.allocateInstances(this.capacity);
    }
    device.queue.writeBuffer(uniforms, 0, camera.viewProjection(this.matrix));
    if (batch.count > 0) device.queue.writeBuffer(this.instances, 0, batch.data);
    const encoder = device.createCommandEncoder();
    const [r, g, b, a] = this.clearColor;
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r, g, b, a },
          loadOp: options.clear === false ? 'load' : 'clear',
          storeOp: 'store',
        },
      ],
    });
    if (batch.count > 0) {
      const region = options.viewport;
      if (region !== undefined) {
        pass.setViewport(region.x, region.y, region.width, region.height, 0, 1);
        pass.setScissorRect(region.x, region.y, region.width, region.height);
      }
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, this.instances);
      for (const group of batch.groups) {
        const bindGroup = this.textures.get(group.texture.id)?.group;
        if (bindGroup === undefined) continue;
        pass.setBindGroup(0, bindGroup);
        pass.draw(4, group.count, 0, group.start);
      }
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    this.destroyed = true;
    this.events.clear();
    for (const entry of this.textures.values()) entry.texture?.destroy();
    this.textures.clear();
    this.instances.destroy();
    this.resources.uniforms.destroy();
    this.context.unconfigure();
  }

  private build(format: GPUTextureFormat): Resources {
    const device = this.device;
    const module = device.createShaderModule({ code: SHADER });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: INSTANCE_BYTES,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'float32x4' },
              { shaderLocation: 2, offset: 32, format: 'float32x3' },
              { shaderLocation: 3, offset: 44, format: 'unorm8x4' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-strip' },
    });
    const uniforms = device.createBuffer({
      size: MATRIX_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    return { pipeline, uniforms, sampler };
  }

  private upload(entry: TextureEntry): void {
    const { pipeline, uniforms, sampler } = this.resources;
    const { width, height, source } = entry;
    const texture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture({ source }, { texture }, [width, height]);
    entry.texture = texture;
    entry.group = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.createView() },
      ],
    });
  }

  private watch(device: GPUDevice): void {
    const handle = (info: GPUDeviceLostInfo): void => {
      if (this.destroyed || device !== this.device || info.reason === 'destroyed') return;
      this.isLost = true;
      for (const entry of this.textures.values()) {
        entry.texture = undefined;
        entry.group = undefined;
      }
      this.events.emit('contextlost');
      void this.restore();
    };
    void device.lost.then(handle);
  }

  private get gone(): boolean {
    return this.destroyed;
  }

  private allocateInstances(capacity: number): GPUBuffer {
    return this.device.createBuffer({
      size: capacity * INSTANCE_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
}

/**
 * Creates a WebGPU renderer, or returns `undefined` when WebGPU is not available.
 */
export async function createWebGPURenderer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  clearColor: ClearColor,
): Promise<WebGPURenderer | undefined> {
  const gpu = (globalThis as { navigator?: { gpu?: GPU } }).navigator?.gpu;
  if (gpu === undefined) return undefined;
  const connect = async (): Promise<GpuConnection | undefined> => {
    const adapter = await gpu.requestAdapter();
    if (adapter === null) return undefined;
    const device = await adapter.requestDevice();
    return { device, format: gpu.getPreferredCanvasFormat() };
  };
  const first = await connect();
  if (first === undefined) return undefined;
  const context = canvas.getContext('webgpu');
  if (context === null) return undefined;
  context.configure({ device: first.device, format: first.format, alphaMode: 'premultiplied' });
  const reconnect = async (): Promise<GpuConnection> => {
    const next = await connect();
    if (next === undefined) throw new Error('WebGPU: no adapter after device loss');
    return next;
  };
  return new WebGPURenderer(canvas, first.device, context, first.format, clearColor, reconnect);
}
