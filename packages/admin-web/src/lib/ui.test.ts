import { describe, expect, it } from 'vitest';
import { gaugeColor } from './ui';

describe('gaugeColor', () => {
  it('is success comfortably below the warning threshold', () => {
    expect(gaugeColor(0)).toBe('success');
    expect(gaugeColor(50)).toBe('success');
    expect(gaugeColor(69.9)).toBe('success');
  });

  it('is warning from 70% up to and including 90%', () => {
    expect(gaugeColor(70)).toBe('warning');
    expect(gaugeColor(80)).toBe('warning');
    expect(gaugeColor(90)).toBe('warning');
  });

  it('is danger just over 90%', () => {
    expect(gaugeColor(90.1)).toBe('danger');
    expect(gaugeColor(100)).toBe('danger');
    expect(gaugeColor(150)).toBe('danger');
  });
});
