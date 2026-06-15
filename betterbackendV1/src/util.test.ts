import { describe, expect, it } from 'vitest';
import { chaosDecayPerSecond, formatINR } from './util';

describe('formatINR', () => {
  it('groups lakhs the Indian way', () => {
    expect(formatINR(100000)).toBe('₹1,00,000');
    expect(formatINR(4000)).toBe('₹4,000');
    expect(formatINR(1600000)).toBe('₹16,00,000');
  });
});

describe('chaosDecayPerSecond', () => {
  it('2 points per 45s day ≈ 0.0444/sec', () => {
    expect(chaosDecayPerSecond(2, 45)).toBeCloseTo(0.0444, 3);
  });
});
