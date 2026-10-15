import type { BatchResult, Texture } from './batch.ts';
import type { Camera2D } from './camera.ts';
import { INSTANCE_BYTES, MATRIX_BYTES } from './renderer.ts';
import type { ClearColor, Renderer, TextureSource } from './renderer.ts';

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

/**
 * The WebGPU backend: one instanced draw per texture group.
 */
export class WebGPURenderer implements Renderer {
  readonly backend = 'webgpu' as const;

  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly sampler: GPUSampler;
  private readonly matrix = new Float32Array(16);
  private readonly textures = new Map<number, { texture: GPUTexture; group: GPUBindGroup }>();
  private instances: GPUBuffer;
  private capacity = 1024;
  private nextTextureId = 1;

  /**
   * @param canvas the canvas to draw to.
   * @param device the GPU device.
   * @param context the canvas' WebGPU context, already configured.
   * @param format the context's texture format.
   * @param clearColor colour to clear to every frame.
   */
  constructor(
    readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    format: GPUTextureFormat,
    private readonly clearColor: ClearColor,
  ) {
    const module = device.createShaderModule({ code: SHADER });
    this.pipeline = device.createRenderPipeline({
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
    this.uniforms = device.createBuffer({
      size: MATRIX_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.instances = this.allocateInstances(this.capacity);
  }

  createTexture(source: TextureSource): Texture {
    const width = source.width;
    const height = source.height;
    const texture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture({ source }, { texture }, [width, height]);
    const group = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: texture.createView() },
      ],
    });
    const id = this.nextTextureId;
    this.nextTextureId += 1;
    this.textures.set(id, { texture, group });
    return { id, width, height };
  }

  deleteTexture(texture: Texture): void {
    const entry = this.textures.get(texture.id);
    if (entry === undefined) return;
    entry.texture.destroy();
    this.textures.delete(texture.id);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  render(camera: Camera2D, batch: BatchResult): void {
    const device = this.device;
    if (batch.count > this.capacity) {
      this.instances.destroy();
      this.capacity = Math.max(batch.count, this.capacity * 2);
      this.instances = this.allocateInstances(this.capacity);
    }
    device.queue.writeBuffer(this.uniforms, 0, camera.viewProjection(this.matrix));
    if (batch.count > 0) device.queue.writeBuffer(this.instances, 0, batch.data);
    const encoder = device.createCommandEncoder();
    const [r, g, b, a] = this.clearColor;
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r, g, b, a },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    if (batch.count > 0) {
      pass.setPipeline(this.pipeline);
      pass.setVertexBuffer(0, this.instances);
      for (const group of batch.groups) {
        const entry = this.textures.get(group.texture.id);
        if (entry === undefined) continue;
        pass.setBindGroup(0, entry.group);
        pass.draw(4, group.count, 0, group.start);
      }
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    for (const entry of this.textures.values()) entry.texture.destroy();
    this.textures.clear();
    this.instances.destroy();
    this.uniforms.destroy();
    this.context.unconfigure();
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
  const adapter = await gpu.requestAdapter();
  if (adapter === null) return undefined;
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (context === null) return undefined;
  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });
  return new WebGPURenderer(canvas, device, context, format, clearColor);
}
