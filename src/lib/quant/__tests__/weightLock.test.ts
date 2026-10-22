import { describe, expect, it } from 'vitest';
import { normalizeWeightsTo100 } from '../riskParitySolver';

describe('normalizeWeightsTo100 with Asset Weight Lock', () => {
  it('normalizes proportionally when no assets are locked', () => {
    const weights = { BBCA: 40, BTC: 40, GLD: 40 };
    const res = normalizeWeightsTo100(weights);
    const sum = Object.values(res).reduce((a, b) => a + b, 0);
    expect(Number(sum.toFixed(1))).toBe(100);
    expect(res.BBCA).toBe(33.4); // 33.3 + 0.1 remainder
    expect(res.BTC).toBe(33.3);
    expect(res.GLD).toBe(33.3);
  });

  it('preserves locked asset and proportionally normalizes unlocked assets', () => {
    // BBCA locked at 40%. BTC and GLD originally 40% and 40% (total = 120%)
    // Remaining budget for unlocked = 100 - 40 = 60%
    // BTC and GLD have 1:1 ratio, so each should get 30%
    const weights = { BBCA: 40, BTC: 40, GLD: 40 };
    const res = normalizeWeightsTo100(weights, ['BBCA'], 'proportional');

    expect(res.BBCA).toBe(40);
    expect(res.BTC).toBe(30);
    expect(res.GLD).toBe(30);
    const sum = Object.values(res).reduce((a, b) => a + b, 0);
    expect(Number(sum.toFixed(1))).toBe(100);
  });

  it('preserves multiple locked assets and scales unlocked assets proportionally', () => {
    // BBCA locked at 25%, GLD locked at 25% (locked sum = 50%)
    // BTC: 10%, ETH: 15% (unlocked sum = 25%)
    // Remaining budget = 50%. BTC ratio = 10/25 = 40% of 50 = 20%. ETH ratio = 15/25 = 60% of 50 = 30%.
    const weights = { BBCA: 25, GLD: 25, BTC: 10, ETH: 15 };
    const res = normalizeWeightsTo100(weights, ['BBCA', 'GLD'], 'proportional');

    expect(res.BBCA).toBe(25);
    expect(res.GLD).toBe(25);
    expect(res.BTC).toBe(20);
    expect(res.ETH).toBe(30);
    const sum = Object.values(res).reduce((a, b) => a + b, 0);
    expect(Number(sum.toFixed(1))).toBe(100);
  });

  it('supports strategy "equal" (Bagi Rata) among unlocked assets', () => {
    // BBCA locked at 40%. BTC: 10%, ETH: 50%
    // Remaining budget = 60%. With 'equal', both get 60 / 2 = 30%
    const weights = { BBCA: 40, BTC: 10, ETH: 50 };
    const res = normalizeWeightsTo100(weights, ['BBCA'], 'equal');

    expect(res.BBCA).toBe(40);
    expect(res.BTC).toBe(30);
    expect(res.ETH).toBe(30);
    const sum = Object.values(res).reduce((a, b) => a + b, 0);
    expect(Number(sum.toFixed(1))).toBe(100);
  });

  it('falls back to equal split when all unlocked assets have 0% weight', () => {
    // BBCA locked at 50%. BTC: 0%, ETH: 0%
    // Remaining budget = 50%. Since unlocked total is 0, each gets 25%
    const weights = { BBCA: 50, BTC: 0, ETH: 0 };
    const res = normalizeWeightsTo100(weights, ['BBCA'], 'proportional');

    expect(res.BBCA).toBe(50);
    expect(res.BTC).toBe(25);
    expect(res.ETH).toBe(25);
    const sum = Object.values(res).reduce((a, b) => a + b, 0);
    expect(Number(sum.toFixed(1))).toBe(100);
  });

  it('sets unlocked assets to 0% when locked sum reaches 100%', () => {
    const weights = { BBCA: 100, BTC: 20, ETH: 10 };
    const res = normalizeWeightsTo100(weights, ['BBCA']);

    expect(res.BBCA).toBe(100);
    expect(res.BTC).toBe(0);
    expect(res.ETH).toBe(0);
  });

  it('handles locked sum exceeding 100% safely', () => {
    const weights = { BBCA: 60, BTC: 50, ETH: 20 };
    const res = normalizeWeightsTo100(weights, ['BBCA', 'BTC']);

    expect(res.BBCA).toBe(60);
    expect(res.BTC).toBe(50);
    expect(res.ETH).toBe(0);
  });

  it('handles all assets being locked', () => {
    const weights = { BBCA: 50, BTC: 50 };
    const res = normalizeWeightsTo100(weights, ['BBCA', 'BTC']);

    expect(res.BBCA).toBe(50);
    expect(res.BTC).toBe(50);
  });

  it('strictly ensures total sum equals 100.0% even with 3-way fractional divisions', () => {
    // Locked: BBCA at 30%. Unlocked: 3 assets (BTC, ETH, GLD), remaining budget = 70%
    // 70 / 3 = 23.33333333...
    const weights = { BBCA: 30, BTC: 10, ETH: 10, GLD: 10 };
    const res = normalizeWeightsTo100(weights, ['BBCA'], 'equal');

    expect(res.BBCA).toBe(30);
    const sum = Object.values(res).reduce((a, b) => a + b, 0);
    expect(Number(sum.toFixed(1))).toBe(100);
  });
});
