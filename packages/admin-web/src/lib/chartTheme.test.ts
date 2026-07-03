import { describe, expect, it } from 'vitest';
import { CHART_LINE_COLORS, CHART_PRIMARY, heatmapColor } from './chartTheme';

describe('CHART_LINE_COLORS', () => {
  it('leads with the primary brand color and has no duplicates', () => {
    expect(CHART_LINE_COLORS[0]).toBe(CHART_PRIMARY);
    expect(new Set(CHART_LINE_COLORS).size).toBe(CHART_LINE_COLORS.length);
  });
});

describe('heatmapColor', () => {
  it('buckets 0% into the lightest color', () => {
    expect(heatmapColor(0)).toBe('#eef2ff');
  });

  it('is inclusive of a bucket upper boundary', () => {
    expect(heatmapColor(20)).toBe('#eef2ff');
    expect(heatmapColor(40)).toBe('#c7d7fe');
    expect(heatmapColor(60)).toBe('#8ea3fb');
    expect(heatmapColor(80)).toBe('#5570f3');
    expect(heatmapColor(100)).toBe('#2f3fb8');
  });

  it('rolls just over a boundary into the next bucket', () => {
    expect(heatmapColor(20.1)).toBe('#c7d7fe');
    expect(heatmapColor(80.1)).toBe('#2f3fb8');
  });

  it('clamps values above 100 into the darkest bucket', () => {
    expect(heatmapColor(150)).toBe('#2f3fb8');
  });

  it('clamps negative values into the lightest bucket', () => {
    expect(heatmapColor(-10)).toBe('#eef2ff');
  });
});
