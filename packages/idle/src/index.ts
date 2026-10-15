/**
 * Optional idle and incremental game components for PortoJS: resources, generators, upgrades, prestige and more.
 *
 * @module @portojs/idle
 */

export { idleComponents } from './components.ts';
export { Economy, ECONOMY_OBJECT } from './economy.ts';
export type {
  EconomyOptions,
  ModifierContext,
  ModifierValue,
  OfflineGains,
  Purchase,
  PurchaseGuard,
} from './economy.ts';
export { Generator } from './generator.ts';
export type { GeneratorOptions, GeneratorPurchase, ResourceCost } from './generator.ts';
export { Resource } from './resource.ts';
export type { ResourceOptions } from './resource.ts';
export { Upgrade } from './upgrade.ts';
export type { UpgradeOptions, UpgradePurchase } from './upgrade.ts';
export type { BulkAmount, EffectTarget, ResetKeep, TargetedMultiplier } from './shared.ts';
export { compileCost } from './cost.ts';
export type {
  CostCurve,
  CostFunctions,
  CustomCost,
  ExponentialCost,
  LinearCost,
  PolynomialCost,
  SteppedCost,
} from './cost.ts';
export { solveFlows } from './flows.ts';
export type { FlowResult, FlowSource } from './flows.ts';
export { Achievement } from './achievement.ts';
export type { AchievementOptions } from './achievement.ts';
export { AutoBuyer } from './auto-buyer.ts';
export type { AutoBuy, AutoBuyerOptions } from './auto-buyer.ts';
export { Boost } from './boost.ts';
export type { BoostOptions } from './boost.ts';
export { Challenge } from './challenge.ts';
export type { ChallengeOptions } from './challenge.ts';
export { DataStore } from './data-store.ts';
export { Prestige } from './prestige.ts';
export type {
  PrestigeBonus,
  PrestigeFormula,
  PrestigeOptions,
  PrestigeResult,
  RootFormula,
} from './prestige.ts';
export { PrestigeTree } from './prestige-tree.ts';
export type { NodeBought, NodeStatus, PrestigeNode, PrestigeTreeOptions } from './prestige-tree.ts';
export { Quest } from './quest.ts';
export type { QuestClaim, QuestOptions, QuestStep } from './quest.ts';
export { Unlock } from './unlock.ts';
export type { UnlockOptions } from './unlock.ts';
export { costChartSvg, costTable } from './cost-chart.ts';
export type { ChartSeries, CostChartOptions, CostRow, CostTableOptions } from './cost-chart.ts';
export { LiveEvent } from './live-event.ts';
export type { EventWindow, LiveEventOptions } from './live-event.ts';
