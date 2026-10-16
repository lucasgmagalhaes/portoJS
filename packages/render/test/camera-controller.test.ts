import { describe, expect, it } from 'vitest';
import { Camera2D, CameraController } from '../src/index.ts';

function make(width = 200, height = 100) {
  const camera = new Camera2D(width, height);
  const controller = new CameraController(camera, { random: () => 1 });
  return { camera, controller };
}

describe('follow', () => {
  it('snaps with no smoothing', () => {
    const { camera, controller } = make();
    controller.follow({ target: () => ({ x: 50, y: 20 }), smoothTime: 0 });
    controller.update(0.016);
    expect([camera.x, camera.y]).toEqual([50, 20]);
  });

  it('closes the gap exponentially and never overshoots', () => {
    const { camera, controller } = make();
    controller.follow({ target: () => ({ x: 100, y: 0 }), smoothTime: 0.5 });
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) {
      controller.update(0.1);
      seen.push(camera.x);
    }
    expect(seen[0]).toBeCloseTo(100 * (1 - Math.exp(-0.2)), 6);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThan(seen[i - 1] ?? 0);
      expect(seen[i]).toBeLessThanOrEqual(100);
    }
    expect(seen.at(-1)).toBeGreaterThan(98);
  });

  it('gives the same result whatever the step size', () => {
    const run = (steps: number): number => {
      const { camera, controller } = make();
      controller.follow({ target: () => ({ x: 100, y: 0 }), smoothTime: 0.3 });
      for (let i = 0; i < steps; i++) controller.update(1 / steps);
      return camera.x;
    };
    expect(run(1)).toBeCloseTo(run(60), 6);
  });

  it('adds the offset', () => {
    const { camera, controller } = make();
    controller.follow({
      target: () => ({ x: 10, y: 10 }),
      smoothTime: 0,
      offset: { x: 30, y: -5 },
    });
    controller.update(0.1);
    expect([camera.x, camera.y]).toEqual([40, 5]);
  });

  it('leaves the camera alone inside the dead zone and follows only the excess outside', () => {
    const { camera, controller } = make();
    let target = { x: 0, y: 0 };
    controller.follow({ target: () => target, smoothTime: 0, deadZone: { width: 20, height: 10 } });
    target = { x: 8, y: 4 };
    controller.update(0.1);
    expect([camera.x, camera.y]).toEqual([0, 0]);
    target = { x: 30, y: -20 };
    controller.update(0.1);
    expect([camera.x, camera.y]).toEqual([20, -15]);
    target = { x: -50, y: -15 };
    controller.update(0.1);
    expect([camera.x, camera.y]).toEqual([-40, -15]);
  });

  it('stops following and validates its options', () => {
    const { camera, controller } = make();
    controller.follow({ target: () => ({ x: 9, y: 9 }), smoothTime: 0 });
    controller.stopFollowing();
    controller.update(1);
    expect([camera.x, camera.y]).toEqual([0, 0]);
    expect(() => controller.follow({ target: () => ({ x: 0, y: 0 }), smoothTime: -1 })).toThrow(
      RangeError,
    );
    expect(() =>
      controller.follow({ target: () => ({ x: 0, y: 0 }), deadZone: { width: -1, height: 1 } }),
    ).toThrow(RangeError);
  });

  it('snapTo jumps and writes the camera', () => {
    const { camera, controller } = make();
    controller.snapTo(7, 8);
    expect([camera.x, camera.y]).toEqual([7, 8]);
  });
});

describe('bounds', () => {
  const world = { x: 0, y: 0, width: 1000, height: 500 };

  it('keeps the visible area inside the world', () => {
    const { camera, controller } = make();
    controller.setBounds(world);
    controller.follow({ target: () => ({ x: -500, y: 9999 }), smoothTime: 0 });
    controller.update(0.1);
    expect([camera.x, camera.y]).toEqual([100, 450]);
    controller.follow({ target: () => ({ x: 5000, y: -5000 }), smoothTime: 0 });
    controller.update(0.1);
    expect([camera.x, camera.y]).toEqual([900, 50]);
  });

  it('accounts for zoom and centres on a world smaller than the view', () => {
    const { camera, controller } = make();
    controller.setBounds(world);
    camera.zoom = 2;
    controller.follow({ target: () => ({ x: 0, y: 0 }), smoothTime: 0 });
    controller.update(0.1);
    expect([camera.x, camera.y]).toEqual([50, 25]);
    controller.setBounds({ x: 0, y: 0, width: 50, height: 20 });
    controller.update(0.1);
    expect([camera.x, camera.y]).toEqual([25, 10]);
  });

  it('can be removed', () => {
    const { camera, controller } = make();
    controller.setBounds(world);
    controller.setBounds(undefined);
    controller.follow({ target: () => ({ x: -500, y: 0 }), smoothTime: 0 });
    controller.update(0.1);
    expect(camera.x).toBe(-500);
  });
});

describe('shake', () => {
  it('offsets the camera and fades out to rest', () => {
    const { camera, controller } = make();
    controller.shake(10, 1);
    controller.update(0.1);
    expect(camera.x).toBeCloseTo(9, 6);
    controller.update(0.5);
    expect(Math.abs(camera.x)).toBeLessThan(9);
    controller.update(1);
    expect([camera.x, camera.y]).toEqual([0, 0]);
  });

  it('does not move the base position and adds shakes up', () => {
    const { camera, controller } = make();
    controller.shake(4, 1);
    controller.shake(6, 1);
    controller.update(0.1);
    expect(camera.x).toBeCloseTo(9, 6);
    expect(controller.x).toBe(0);
  });

  it('keeps one offset for a while between updates, then picks another', () => {
    let calls = 0;
    const camera = new Camera2D(100, 100);
    const controller = new CameraController(camera, {
      random: () => {
        calls += 1;
        return 1;
      },
    });
    controller.shake(10, 10);
    controller.update(0.001);
    controller.update(0.001);
    expect(calls).toBe(2);
    controller.update(0.05);
    expect(calls).toBe(4);
  });

  it('validates its arguments', () => {
    const { controller } = make();
    expect(() => controller.shake(-1, 1)).toThrow(RangeError);
    expect(() => controller.shake(1, 0)).toThrow(RangeError);
  });
});

describe('zoomTo', () => {
  it('jumps with no duration', () => {
    const { camera, controller } = make();
    controller.zoomTo(3);
    expect(camera.zoom).toBe(3);
  });

  it('animates, with an easing curve, and ends exactly on the target', () => {
    const { camera, controller } = make();
    controller.zoomTo(3, 1, (t) => t * t);
    controller.update(0.5);
    expect(camera.zoom).toBeCloseTo(1 + 2 * 0.25, 9);
    controller.update(0.6);
    expect(camera.zoom).toBe(3);
    controller.update(1);
    expect(camera.zoom).toBe(3);
  });

  it('starts a new animation from the current value', () => {
    const { camera, controller } = make();
    controller.zoomTo(3, 1);
    controller.update(0.5);
    controller.zoomTo(1, 1);
    controller.update(0.5);
    expect(camera.zoom).toBeCloseTo(1.5, 9);
  });

  it('validates its arguments', () => {
    const { controller } = make();
    expect(() => controller.zoomTo(0)).toThrow(RangeError);
    expect(() => controller.zoomTo(2, -1)).toThrow(RangeError);
  });
});
