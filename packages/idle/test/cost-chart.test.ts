import { describe, expect, it } from 'vitest';
import { costChartSvg, costTable } from '../src/index.ts';

describe('costTable', () => {
  it('lists unit prices and running totals', () => {
    const rows = costTable({ base: 10, growth: 2 }, { count: 4, from: 1 });
    expect(rows.map((row) => row.owned)).toEqual([1, 2, 3, 4]);
    expect(rows.map((row) => row.unit.toNumber())).toEqual([20, 40, 80, 160]);
    expect(rows.at(-1)?.cumulative.toNumber()).toBe(300);
  });
});

describe('costChartSvg', () => {
  it('draws every series with a legend and a log axis', () => {
    const svg = costChartSvg(
      [
        { label: 'exp <1.15>', curve: { base: 10, growth: 1.15 } },
        { label: 'linear', curve: { type: 'linear', base: 10, increment: 5 } },
        { label: 'poly', curve: { type: 'polynomial', base: 10, power: 2 } },
      ],
      { count: 50, metric: 'cumulative', width: 400, height: 200 },
    );
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.match(/<polyline/g)).toHaveLength(3);
    expect(svg).toContain('exp &lt;1.15&gt;');
    expect(svg).toContain('49 units owned');
  });

  it('handles a single point and an empty list', () => {
    expect(costChartSvg([{ label: 'a', curve: { base: 1, growth: 1 } }], { count: 1 })).toContain(
      '<polyline',
    );
    expect(costChartSvg([])).toContain('</svg>');
  });
});
