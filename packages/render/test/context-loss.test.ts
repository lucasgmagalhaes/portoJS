import { beforeAll, describe, expect, it } from 'vitest';
import { Camera2D, SpriteBatch, WebGPURenderer } from '../src/index.ts';
import type { GpuConnection } from '../src/index.ts';

interface Deferred {
  promise: Promise<GPUDeviceLostInfo>;
  resolve: (info: GPUDeviceLostInfo) => void;
}

function deferred(): Deferred {
  let resolve: (info: GPUDeviceLostInfo) => void = () => undefined;
  const promise = new Promise<GPUDeviceLostInfo>((done) => void (resolve = done));
  return { promise, resolve };
}

class FakeDevice {
  readonly lostSignal = deferred();
  readonly lost = this.lostSignal.promise;
  readonly pipelines = { count: 0 };
  readonly textures: { destroyed: boolean }[] = [];
  readonly writes: number[] = [];
  readonly submits: number[] = [];
  readonly queue = {
    copyExternalImageToTexture: () => undefined,
    writeBuffer: () => void this.writes.push(1),
    submit: () => void this.submits.push(1),
  };
  createShaderModule = () => ({});
  createRenderPipeline = () => {
    this.pipelines.count++;
    return { getBindGroupLayout: () => ({}) };
  };
  createBuffer = () => ({ destroy: () => undefined });
  createSampler = () => ({});
  createTexture = () => {
    const texture = { destroyed: false, createView: () => ({}), destroy: () => void (texture.destroyed = true) };
    this.textures.push(texture);
    return texture;
  };
  createBindGroup = () => ({});
  createCommandEncoder = () => ({
    beginRenderPass: () => ({
      setPipeline: () => undefined,
      setVertexBuffer: () => undefined,
      setBindGroup: () => undefined,
      setViewport: () => undefined,
      setScissorRect: () => undefined,
      draw: () => undefined,
      end: () => undefined,
    }),
    finish: () => ({}),
  });
  lose(reason: 'unknown' | 'destroyed' = 'unknown'): void {
    this.lostSignal.resolve({ reason, message: '' } as GPUDeviceLostInfo);
  }
}

class FakeContext {
  configured: unknown[] = [];
  configure = (config: unknown): void => void this.configured.push(config);
  unconfigure = (): void => undefined;
  getCurrentTexture = () => ({ createView: () => ({}) });
}

beforeAll(() => {
  Object.assign(globalThis, {
    GPUBufferUsage: { UNIFORM: 1, COPY_DST: 2, VERTEX: 4 },
    GPUTextureUsage: { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 },
  });
});

const source = { width: 4, height: 4 } as unknown as ImageBitmap;
const canvas = {} as unknown as HTMLCanvasElement;

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function make(reconnect?: () => Promise<GpuConnection>) {
  const device = new FakeDevice();
  const context = new FakeContext();
  const renderer = new WebGPURenderer(
    canvas,
    device as unknown as GPUDevice,
    context as unknown as GPUCanvasContext,
    'bgra8unorm',
    [0, 0, 0, 1],
    reconnect,
  );
  return { device, context, renderer };
}

describe('WebGPURenderer context loss', () => {
  it('pauses drawing, gets a new device and re-uploads textures', async () => {
    const next = new FakeDevice();
    const { device, context, renderer } = make(() =>
      Promise.resolve({ device: next as unknown as GPUDevice, format: 'rgba8unorm' }),
    );
    const events: string[] = [];
    renderer.on('contextlost', () => events.push(`lost:${String(renderer.lost)}`));
    renderer.on('contextrestored', () => events.push(`restored:${String(renderer.lost)}`));
    const texture = renderer.createTexture(source);
    const batch = new SpriteBatch(4);
    batch.add(texture, { x: 0, y: 0, width: 1, height: 1 });
    renderer.render(new Camera2D(10, 10), batch.build());
    expect(device.submits).toHaveLength(1);

    device.lose();
    await settle();
    expect(events).toEqual(['lost:true', 'restored:false']);
    expect(renderer.lost).toBe(false);
    expect(next.pipelines.count).toBe(1);
    expect(next.textures).toHaveLength(1);
    expect(context.configured).toHaveLength(1);
    expect(context.configured[0]).toMatchObject({ device: next, format: 'rgba8unorm' });

    renderer.render(new Camera2D(10, 10), batch.build());
    expect(next.submits).toHaveLength(1);
    expect(device.submits).toHaveLength(1);
  });

  it('draws nothing while lost and uploads textures made meanwhile on restore', async () => {
    const next = new FakeDevice();
    let release: (connection: GpuConnection) => void = () => undefined;
    const { device, renderer } = make(
      () => new Promise<GpuConnection>((resolve) => void (release = resolve)),
    );
    device.lose();
    await settle();
    expect(renderer.lost).toBe(true);
    const texture = renderer.createTexture(source);
    const batch = new SpriteBatch(4);
    batch.add(texture, { x: 0, y: 0, width: 1, height: 1 });
    renderer.render(new Camera2D(10, 10), batch.build());
    expect(device.submits).toHaveLength(0);
    release({ device: next as unknown as GPUDevice, format: 'rgba8unorm' });
    await settle();
    expect(renderer.lost).toBe(false);
    expect(next.textures).toHaveLength(1);
  });

  it('stays lost when reconnecting fails, and restore() can try again', async () => {
    const next = new FakeDevice();
    let attempts = 0;
    const { device, renderer } = make(() => {
      attempts++;
      return attempts === 1
        ? Promise.reject(new Error('gpu busy'))
        : Promise.resolve({ device: next as unknown as GPUDevice, format: 'rgba8unorm' });
    });
    device.lose();
    await settle();
    expect(renderer.lost).toBe(true);
    expect(await renderer.restore()).toBe(true);
    expect(renderer.lost).toBe(false);
    expect(attempts).toBe(2);
  });

  it('ignores a device it destroyed itself and renderers that cannot reconnect', async () => {
    const first = make(() => Promise.reject(new Error('should not be called')));
    first.device.lose('destroyed');
    await settle();
    expect(first.renderer.lost).toBe(false);
    const second = make();
    second.device.lose();
    await settle();
    expect(second.renderer.lost).toBe(true);
    expect(await second.renderer.restore()).toBe(false);
  });

  it('does not restore after destroy and stops notifying', async () => {
    const next = new FakeDevice();
    const { device, renderer } = make(() =>
      Promise.resolve({ device: next as unknown as GPUDevice, format: 'rgba8unorm' }),
    );
    const events: string[] = [];
    renderer.on('contextrestored', () => events.push('restored'));
    renderer.destroy();
    device.lose();
    await settle();
    expect(events).toEqual([]);
    expect(next.pipelines.count).toBe(0);
  });
});
