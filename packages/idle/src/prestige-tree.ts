import { BigNum, SaveCorruptedError } from '@portojs/core';
import type { BigNumLike, JsonValue } from '@portojs/core';
import { Component, GameEvent } from '@portojs/runtime';
import type { GameObject } from '@portojs/runtime';
import { Economy } from './economy.ts';
import type { Prestige } from './prestige.ts';
import type { TargetedMultiplier } from './shared.ts';

/**
 * One node of a {@link PrestigeTree}.
 */
export interface PrestigeNode {
  /**
   * Unique name of the node.
   */
  readonly id: string;
  /**
   * Text to show the player.
   */
  readonly description?: string;
  /**
   * Prestige points it costs.
   */
  readonly cost: BigNumLike;
  /**
   * Nodes that must be owned before this one can be bought.
   */
  readonly requires?: readonly string[];
  /**
   * Nodes that cannot be owned together with this one, in both directions: buying either closes
   * the other.
   */
  readonly exclusiveWith?: readonly string[];
  /**
   * The permanent multiplier it grants.
   */
  readonly bonus: TargetedMultiplier;
}

/**
 * Options for {@link PrestigeTree}.
 */
export interface PrestigeTreeOptions {
  /**
   * The layer whose points pay for the nodes.
   */
  readonly prestige: Prestige;
  /**
   * The nodes of the tree.
   */
  readonly nodes: readonly PrestigeNode[];
}

/**
 * Whether a node is owned, can be bought now, lacks points, lacks a required node, or is
 * closed by an exclusive node the player owns.
 */
export type NodeStatus = 'owned' | 'available' | 'unaffordable' | 'locked' | 'blocked';

/**
 * Payload of {@link PrestigeTree.bought}.
 */
export interface NodeBought {
  readonly tree: PrestigeTree;
  readonly node: PrestigeNode;
}

function anyIn(ids: readonly string[] | undefined, set: ReadonlySet<string>): boolean {
  for (const id of ids ?? []) if (set.has(id)) return true;
  return false;
}

function allIn(ids: readonly string[] | undefined, set: ReadonlySet<string>): boolean {
  for (const id of ids ?? []) if (!set.has(id)) return false;
  return true;
}

/**
 * A skill tree bought with prestige points. Nodes can require others and exclude others, so a
 * player specialises instead of buying everything. Bonuses are permanent multipliers in the
 * economy, they survive resets, and a respec returns the points.
 *
 * @example
 * const tree = game.createObject('Tree').addComponent(PrestigeTree, {
 *   prestige: ascension,
 *   nodes: [
 *     { id: 'miners', cost: 1, bonus: { generator: miner, multiplier: 2 } },
 *     { id: 'deep', cost: 3, requires: ['miners'], bonus: { all: true, multiplier: 1.5 } },
 *     { id: 'luck', cost: 3, exclusiveWith: ['deep'], bonus: { resource: gold, multiplier: 3 } },
 *   ],
 * });
 * tree.buy('miners');
 */
export class PrestigeTree extends Component {
  static override typeId = 'PrestigeTree';

  /**
   * Fired after a node is bought.
   */
  readonly bought = new GameEvent<NodeBought>();

  /**
   * Fired after a respec.
   */
  readonly respecced = new GameEvent<PrestigeTree>();

  private readonly options: PrestigeTreeOptions;
  private readonly byId = new Map<string, PrestigeNode>();
  private readonly ownedIds = new Set<string>();
  private readonly exclusions = new Map<string, string[]>();

  constructor(gameObject: GameObject, options: PrestigeTreeOptions) {
    super(gameObject);
    this.options = options;
    for (const node of options.nodes) {
      if (this.byId.has(node.id)) throw new RangeError(`PrestigeTree: duplicate node "${node.id}"`);
      this.byId.set(node.id, node);
    }
    for (const node of options.nodes) {
      const references = [...(node.requires ?? []), ...(node.exclusiveWith ?? [])];
      for (const id of references) {
        if (!this.byId.has(id)) {
          throw new RangeError(`PrestigeTree: node "${node.id}" names unknown node "${id}"`);
        }
      }
      if (!BigNum.from(node.cost).gte(0)) {
        throw new RangeError(`PrestigeTree: node "${node.id}" needs a cost >= 0`);
      }
      for (const other of node.exclusiveWith ?? []) {
        this.exclude(node.id, other);
        this.exclude(other, node.id);
      }
    }
  }

  override onDestroy(): void {
    this.clearModifiers();
  }

  /**
   * Ids of the owned nodes, in the order of the node list.
   */
  get owned(): readonly string[] {
    const ids: string[] = [];
    for (const node of this.options.nodes) if (this.ownedIds.has(node.id)) ids.push(node.id);
    return ids;
  }

  /**
   * Whether the node is owned.
   */
  has(id: string): boolean {
    return this.ownedIds.has(id);
  }

  /**
   * The node definition, or `undefined` for an unknown id.
   */
  node(id: string): PrestigeNode | undefined {
    return this.byId.get(id);
  }

  /**
   * Whether the node is owned, can be bought now, lacks points, lacks a required node, or is
   * closed by an exclusive node the player owns.
   *
   * @throws {RangeError} for an unknown id.
   */
  status(id: string): NodeStatus {
    const node = this.require(id);
    if (this.ownedIds.has(id)) return 'owned';
    if (anyIn(this.exclusions.get(id), this.ownedIds)) return 'blocked';
    if (!allIn(node.requires, this.ownedIds)) return 'locked';
    if (BigNum.from(node.cost).gt(this.options.prestige.points)) return 'unaffordable';
    return 'available';
  }

  /**
   * Buys the node and applies its bonus.
   *
   * @returns `false` and changes nothing unless the node is available.
   * @throws {RangeError} for an unknown id.
   */
  buy(id: string): boolean {
    if (this.status(id) !== 'available') return false;
    const node = this.require(id);
    this.options.prestige.spend(node.cost);
    this.ownedIds.add(id);
    this.applyModifier(node);
    this.bought.invoke({ tree: this, node });
    return true;
  }

  /**
   * Removes every node and returns the points that were spent.
   *
   * @returns the points refunded.
   */
  respec(): BigNum {
    let refund: BigNum = BigNum.ZERO;
    for (const id of this.ownedIds) refund = refund.add(BigNum.from(this.require(id).cost));
    this.clearModifiers();
    this.ownedIds.clear();
    this.options.prestige.refund(refund);
    this.respecced.invoke(this);
    return refund;
  }

  override onSave(): JsonValue {
    return [...this.owned];
  }

  override onLoad(data: JsonValue | undefined): void {
    this.clearModifiers();
    this.ownedIds.clear();
    if (data === undefined) return;
    if (!Array.isArray(data)) throw new SaveCorruptedError('PrestigeTree: save must be a list');
    for (const id of data) {
      if (typeof id !== 'string' || !this.byId.has(id)) {
        throw new SaveCorruptedError('PrestigeTree: unknown node in save');
      }
      this.ownedIds.add(id);
    }
    for (const id of this.ownedIds) this.applyModifier(this.require(id));
  }

  private exclude(id: string, other: string): void {
    const list = this.exclusions.get(id) ?? [];
    list.push(other);
    this.exclusions.set(id, list);
  }

  private require(id: string): PrestigeNode {
    const node = this.byId.get(id);
    if (node === undefined) throw new RangeError(`PrestigeTree: unknown node "${id}"`);
    return node;
  }

  private modifierId(id: string): string {
    return `tree:${this.gameObject.name}:${id}`;
  }

  private applyModifier(node: PrestigeNode): void {
    Economy.of(this.game).setModifier(this.modifierId(node.id), node.bonus, node.bonus.multiplier);
  }

  private clearModifiers(): void {
    const economy = Economy.existing(this.game);
    for (const id of this.ownedIds) economy?.removeModifier(this.modifierId(id));
  }
}
