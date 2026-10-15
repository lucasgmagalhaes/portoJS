import { describe, expect, it } from 'vitest';
import {
  Component,
  ComponentRegistry,
  Game,
  Generator,
  ManualClock,
  Resource,
  SceneError,
  idleComponents,
  loadScene,
} from '../src/index.ts';

class Tag extends Component {
  static override typeId = 'Tag';
  constructor(
    gameObject: ConstructorParameters<typeof Component>[0],
    readonly options: { label: string; target?: unknown },
  ) {
    super(gameObject);
  }
}

function make() {
  const game = new Game({ clock: new ManualClock(0) });
  const registry = new ComponentRegistry().register(...idleComponents, Tag);
  return { game, registry };
}

function at(game: Game, name: string) {
  const object = game.find(name);
  if (object === undefined) throw new Error(`missing object ${name}`);
  return object;
}

const economyScene = {
  objects: [
    { name: 'Gold', components: [{ type: 'Resource', options: { initial: 10 } }] },
    {
      name: 'Miner',
      components: [
        {
          type: 'Generator',
          options: {
            cost: { resource: { $ref: 'Gold/Resource' }, base: 10, growth: 1.15 },
            produces: { $ref: 'Gold/Resource' },
            rate: 1,
          },
        },
      ],
    },
  ],
};

describe('loadScene', () => {
  it('builds a working economy from JSON', () => {
    const { game, registry } = make();
    const created = loadScene(game, JSON.parse(JSON.stringify(economyScene)), registry);
    expect(created.map((object) => object.name)).toEqual(['Gold', 'Miner']);
    const gold = at(game, 'Gold').requireComponent(Resource);
    const miner = at(game, 'Miner').requireComponent(Generator);
    miner.buy(1);
    game.advance(1000);
    expect(gold.amount.toNumber()).toBeCloseTo(1, 6);
  });

  it('handles active, enabled, children and object references', () => {
    const { game, registry } = make();
    const [root] = loadScene(
      game,
      {
        objects: [
          {
            name: 'Root',
            active: false,
            components: [{ type: 'Tag', options: { label: 'r' }, enabled: false }],
            children: [
              {
                name: 'Kid',
                components: [{ type: 'Tag', options: { label: 'k', target: { $ref: 'Root' } } }],
              },
            ],
          },
        ],
      },
      registry,
    );
    expect(root?.activeSelf).toBe(false);
    expect(root?.requireComponent(Tag).enabled).toBe(false);
    const kid = at(game, 'Kid');
    expect(kid.parent).toBe(root);
    expect(kid.requireComponent(Tag).options.target).toBe(root);
  });

  it('picks the nth component of a type with #n', () => {
    const { game, registry } = make();
    loadScene(
      game,
      {
        objects: [
          {
            name: 'Two',
            components: [
              { type: 'Tag', options: { label: 'a' } },
              { type: 'Tag', options: { label: 'b' } },
              { type: 'Tag', options: { label: 'c', target: { $ref: 'Two/Tag#2' } } },
            ],
          },
        ],
      },
      registry,
    );
    const tags = at(game, 'Two').getComponents(Tag);
    expect(tags[2]?.options.target).toBe(tags[1]);
  });

  it('is all-or-nothing', () => {
    const { game, registry } = make();
    const scene = {
      objects: [
        { name: 'Good', components: [{ type: 'Tag', options: { label: 'x' } }] },
        { name: 'Bad', components: [{ type: 'Nope' }] },
      ],
    };
    expect(() => loadScene(game, scene, registry)).toThrow(SceneError);
    expect(game.find('Good')).toBeUndefined();
    expect(game.find('Bad')).toBeUndefined();
  });

  it.each([
    ['not an object', 7, /scene: expected an object/],
    ['unknown key', { objects: [], extra: 1 }, /unknown key "extra"/],
    ['objects not an array', { objects: {} }, /expected an array/],
    ['object not a record', { objects: [1] }, /expected an object/],
    ['empty name', { objects: [{ name: '' }] }, /non-empty string/],
    ['bad active', { objects: [{ name: 'A', active: 1 }] }, /\.active: expected a boolean/],
    ['components not array', { objects: [{ name: 'A', components: 1 }] }, /expected an array/],
    [
      'children not array',
      { objects: [{ name: 'A', children: 1 }] },
      /children: expected an array/,
    ],
    [
      'bad type',
      { objects: [{ name: 'A', components: [{ type: 1 }] }] },
      /\.type: expected a string/,
    ],
    [
      'bad enabled',
      { objects: [{ name: 'A', components: [{ type: 'Tag', enabled: 'y' }] }] },
      /\.enabled: expected a boolean/,
    ],
    [
      'unknown object ref',
      {
        objects: [
          { name: 'A', components: [{ type: 'Tag', options: { target: { $ref: 'Zed' } } }] },
        ],
      },
      /no object named "Zed"/,
    ],
    [
      'unknown component ref',
      {
        objects: [
          { name: 'A', components: [{ type: 'Tag', options: { target: { $ref: 'A/Resource' } } }] },
        ],
      },
      /has no component "Resource"/,
    ],
    [
      'malformed ref',
      {
        objects: [
          { name: 'A', components: [{ type: 'Tag', options: { target: { $ref: 'A', x: 1 } } }] },
        ],
      },
      /reference must be exactly/,
    ],
    [
      'proto key',
      {
        objects: [
          {
            name: 'A',
            components: [{ type: 'Tag', options: JSON.parse('{"__proto__": {}}') as unknown }],
          },
        ],
      },
      /__proto__/,
    ],
  ])('rejects %s', (_label, scene, message) => {
    const { game, registry } = make();
    expect(() => loadScene(game, scene, registry)).toThrow(message);
    expect(game.objects).toHaveLength(0);
  });

  it('resolves references inside arrays and rejects absurd nesting', () => {
    const { game, registry } = make();
    loadScene(
      game,
      {
        objects: [
          { name: 'A', components: [{ type: 'Tag', options: { label: 'a' } }] },
          {
            name: 'B',
            components: [{ type: 'Tag', options: { label: 'b', target: [{ $ref: 'A' }] } }],
          },
        ],
      },
      registry,
    );
    expect(at(game, 'B').requireComponent(Tag).options.target).toEqual([at(game, 'A')]);

    let deep: unknown = 1;
    for (let i = 0; i < 80; i++) deep = { x: deep };
    const other = make();
    expect(() =>
      loadScene(
        other.game,
        { objects: [{ name: 'D', components: [{ type: 'Tag', options: deep }] }] },
        other.registry,
      ),
    ).toThrow(/nested too deeply/);

    let tree: Record<string, unknown> = { name: 'leaf' };
    for (let i = 0; i < 80; i++) tree = { name: `n${i}`, children: [tree] };
    expect(() => loadScene(other.game, { objects: [tree] }, other.registry)).toThrow(
      /nested too deeply/,
    );
  });
});

describe('ComponentRegistry', () => {
  it('registers, looks up and rejects conflicting ids', () => {
    class Other extends Component {
      static override typeId = 'Tag';
    }
    const registry = new ComponentRegistry().register(Tag);
    expect(registry.has('Tag')).toBe(true);
    expect(registry.get('Tag')).toBe(Tag);
    expect(registry.get('Nope')).toBeUndefined();
    expect(() => registry.register(Tag)).not.toThrow();
    expect(() => registry.register(Other)).toThrow(/already registered/);
  });

  it('falls back to the class name without a typeId', () => {
    class Plain extends Component {}
    const registry = new ComponentRegistry().register(Plain);
    expect(registry.has('Plain')).toBe(true);
  });
});
