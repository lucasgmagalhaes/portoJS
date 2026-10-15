import { BigNum, format } from '@portojs/core';
import { compileCost } from './cost.ts';
import type { CostCurve } from './cost.ts';

/**
 * One row of {@link costTable}.
 */
export interface CostRow {
  /**
   * Units owned before this purchase.
   */
  readonly owned: number;
  /**
   * Price of the next unit.
   */
  readonly unit: BigNum;
  /**
   * Total spent from the first row up to and including this unit.
   */
  readonly cumulative: BigNum;
}

/**
 * Options of {@link costTable}.
 */
export interface CostTableOptions {
  /**
   * How many units to list.
   */
  readonly count: number;
  /**
   * First `owned` value, default 0.
   */
  readonly from?: number;
}

/**
 * Lists what each unit of a curve costs and the running total, for balancing by eye or by test.
 *
 * @example
 * costTable({ base: 10, growth: 1.15 }, { count: 3 }); // unit prices 10, 11.5, 13.225
 */
export function costTable(curve: CostCurve, options: CostTableOptions): CostRow[] {
  const costs = compileCost(curve);
  const from = options.from ?? 0;
  const rows: CostRow[] = [];
  let cumulative: BigNum = BigNum.ZERO;
  for (let i = 0; i < options.count; i++) {
    const unit = costs.unit(BigNum.from(from + i));
    cumulative = cumulative.add(unit);
    rows.push({ owned: from + i, unit, cumulative });
  }
  return rows;
}

/**
 * A named curve to draw.
 */
export interface ChartSeries {
  /**
   * Legend text.
   */
  readonly label: string;
  /**
   * The curve.
   */
  readonly curve: CostCurve;
}

/**
 * Options of {@link costChartSvg}.
 */
export interface CostChartOptions {
  /**
   * Units on the x axis, from `from`. Default 100.
   */
  readonly count?: number;
  /**
   * First `owned` value. Default 0.
   */
  readonly from?: number;
  /**
   * Plot the price of each unit (`unit`) or the running total (`cumulative`). Default `unit`.
   */
  readonly metric?: 'unit' | 'cumulative';
  /**
   * Chart width in pixels. Default 640.
   */
  readonly width?: number;
  /**
   * Chart height in pixels. Default 360.
   */
  readonly height?: number;
}

const COLORS = ['#4f8cff', '#ff7a45', '#36b37e', '#b36bff', '#e5b800', '#ff5c8a'];
const MARGIN = { left: 64, right: 16, top: 16, bottom: 36 };

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Draws one or more cost curves as a standalone SVG string, with a logarithmic price axis so
 * exponential and polynomial growth can share a chart. Put it in a page, save it, or diff it
 * while balancing.
 *
 * @example
 * const svg = costChartSvg([
 *   { label: 'exponential 1.15', curve: { base: 10, growth: 1.15 } },
 *   { label: 'linear', curve: { type: 'linear', base: 10, increment: 5 } },
 * ]);
 */
export function costChartSvg(
  series: readonly ChartSeries[],
  options: CostChartOptions = {},
): string {
  const count = options.count ?? 100;
  const from = options.from ?? 0;
  const width = options.width ?? 640;
  const height = options.height ?? 360;
  const metric = options.metric ?? 'unit';
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;

  const lines: Array<{ label: string; values: number[] }> = [];
  const finite: number[] = [];
  for (const entry of series) {
    const values: number[] = [];
    for (const row of costTable(entry.curve, { count, from })) {
      const log = row[metric].log10();
      values.push(log);
      if (Number.isFinite(log)) finite.push(log);
    }
    lines.push({ label: entry.label, values });
  }
  const low = Math.floor(finite.length > 0 ? Math.min(...finite) : 0);
  const high = Math.max(low + 1, Math.ceil(finite.length > 0 ? Math.max(...finite) : 1));

  const x = (i: number): number => MARGIN.left + (count <= 1 ? 0 : (i / (count - 1)) * plotWidth);
  const y = (log: number): number =>
    MARGIN.top + plotHeight - ((log - low) / (high - low)) * plotHeight;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="sans-serif" font-size="11">`,
  ];
  const step = Math.max(1, Math.ceil((high - low) / 6));
  for (let tick = low; tick <= high; tick += step) {
    const at = y(tick);
    const label = escapeText(format(BigNum.fromParts(1, tick), { precision: 0 }));
    parts.push(
      `<line x1="${MARGIN.left}" x2="${width - MARGIN.right}" y1="${at}" y2="${at}" stroke="currentColor" stroke-opacity="0.15"/>`,
      `<text x="${MARGIN.left - 6}" y="${at + 4}" text-anchor="end" fill="currentColor">${label}</text>`,
    );
  }
  const floor = MARGIN.top + plotHeight;
  parts.push(
    `<line x1="${MARGIN.left}" x2="${MARGIN.left}" y1="${MARGIN.top}" y2="${floor}" stroke="currentColor"/>`,
    `<line x1="${MARGIN.left}" x2="${width - MARGIN.right}" y1="${floor}" y2="${floor}" stroke="currentColor"/>`,
    `<text x="${MARGIN.left}" y="${height - 8}" fill="currentColor">${from}</text>`,
    `<text x="${width - MARGIN.right}" y="${height - 8}" text-anchor="end" fill="currentColor">${from + count - 1} units owned</text>`,
  );
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as { label: string; values: number[] };
    const color = COLORS[index % COLORS.length] as string;
    const points: string[] = [];
    for (let i = 0; i < line.values.length; i++) {
      const value = line.values[i] as number;
      if (Number.isFinite(value)) points.push(`${x(i).toFixed(1)},${y(value).toFixed(1)}`);
    }
    const legendY = MARGIN.top + 12 + index * 16;
    parts.push(
      `<polyline fill="none" stroke="${color}" stroke-width="2" points="${points.join(' ')}"/>`,
      `<rect x="${MARGIN.left + 10}" y="${legendY - 9}" width="10" height="10" fill="${color}"/>`,
      `<text x="${MARGIN.left + 26}" y="${legendY}" fill="currentColor">${escapeText(line.label)}</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}
