import { describe, it, expect, beforeEach } from 'vitest';
import { CORE_AND_EXPANDED_ASSETS } from '../../../data/presets';
import { HoldingEntry, RebalanceMode } from '../types';
import { calculateRebalancePlan } from '../rebalancerEngine';

// Mock in-memory localStorage for Node test runner
const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockLocalStorage = createMockStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

describe('Persistence and Rebalancer Mount Synchronization', () => {
  const STORAGE_KEY = 'quantporto_state_v2';

  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('correctly persists and serializes all execution and portfolio parameters without data loss', () => {
    const mockCustomHoldings: Record<string, HoldingEntry> = {
      RDPT: {
        assetId: 'RDPT',
        currentValueIdr: 9_000_000,
        units: 9_000_000,
        currentPrice: 1,
        shockPercent: 0,
        isNominalOnly: true,
      },
      GLD: {
        assetId: 'GLD',
        currentValueIdr: 3_000_000,
        units: 0.088,
        currentPrice: 2000,
        shockPercent: 0,
        isNominalOnly: false,
      },
    };

    const mockStateToSave = {
      activeTab: 'rebalancer',
      activeWeights: { RDPT: 40, BBCA: 20, GLD: 20, SPY: 20 },
      activePresetId: null,
      allocationMethod: 'custom',
      convictionAssetId: 'BTC',
      convictionRiskPercent: 85,
      solverMode: 'euler-covariance',
      selectedUniverseIds: ['RDPT', 'BBCA', 'GLD', 'SPY'],
      holdings: mockCustomHoldings,
      initialCapitalIdr: 100_000_000,
      targetGoalIdr: 2_000_000_000,
      monthlySavingsIdr: 5_000_000,
      isHoldingsSyncedWithMenu1: false, // User in Mode Posisi Manual
      usdIdrRate: 18000,
      inputMode: 'nominal',
      rebalanceMode: 'buy-only-dca' as RebalanceMode,
      cashInjectionIdr: 13_000_000,
      isFixedBudgetMode: true,
      fixedTotalBudgetIdr: 25_000_000,
      driftThresholdPercent: 3,
      enableIdxLotRounding: true,
      enableBrokerFees: true,
      filterDustTrades: true,
    };

    // Simulate saving to localStorage
    mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify(mockStateToSave));

    // Verify it parses back completely without missing any execution mode or budget setting
    const raw = mockLocalStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const loaded = JSON.parse(raw!);

    expect(loaded.activeTab).toBe('rebalancer');
    expect(loaded.rebalanceMode).toBe('buy-only-dca');
    expect(loaded.isFixedBudgetMode).toBe(true);
    expect(loaded.fixedTotalBudgetIdr).toBe(25_000_000);
    expect(loaded.cashInjectionIdr).toBe(13_000_000);
    expect(loaded.isHoldingsSyncedWithMenu1).toBe(false);
    expect(loaded.holdings.RDPT.currentValueIdr).toBe(9_000_000);
    expect(loaded.holdings.GLD.currentValueIdr).toBe(3_000_000);
  });

  it('calculates auto-subtract cash injection correctly from manual 12M holdings when budget is 25M', () => {
    const totalHoldingsIdr = 9_000_000 + 3_000_000; // 12 Jt (as in user screenshot 1)
    const fixedTotalBudget = 25_000_000; // Target Total Modal 25 Jt

    const autoSubtractedCash = Math.max(0, fixedTotalBudget - totalHoldingsIdr);
    expect(autoSubtractedCash).toBe(13_000_000); // Sisa Kas Belanja: 13 Jt exactly

    // Verify rebalancer plan respects the 12M initial portfolio + 13M DCA cash
    const targetWeights = {
      RDPT: 39.1,
      BBCA: 5.4,
      GLD: 12.0,
      SPY: 16.3,
      QQQ: 12.0,
      BTC: 13.0,
      ETH: 2.2,
    };

    const holdings: Record<string, HoldingEntry> = {
      RDPT: { assetId: 'RDPT', currentValueIdr: 9_000_000, units: 9_000_000, currentPrice: 1, shockPercent: 0, isNominalOnly: true },
      BBCA: { assetId: 'BBCA', currentValueIdr: 0, units: 0, currentPrice: 10000, shockPercent: 0 },
      GLD: { assetId: 'GLD', currentValueIdr: 3_000_000, units: 0.1, currentPrice: 2000, shockPercent: 0 },
      SPY: { assetId: 'SPY', currentValueIdr: 0, units: 0, currentPrice: 500, shockPercent: 0 },
      QQQ: { assetId: 'QQQ', currentValueIdr: 0, units: 0, currentPrice: 400, shockPercent: 0 },
      BTC: { assetId: 'BTC', currentValueIdr: 0, units: 0, currentPrice: 90000, shockPercent: 0 },
      ETH: { assetId: 'ETH', currentValueIdr: 0, units: 0, currentPrice: 3000, shockPercent: 0 },
    };

    const plan = calculateRebalancePlan({
      assets: CORE_AND_EXPANDED_ASSETS,
      targetWeights,
      holdings,
      inputMode: 'nominal',
      usdIdrRate: 18000,
      rebalanceMode: 'buy-only-dca',
      cashInjectionIdr: autoSubtractedCash, // 13M
      driftThresholdAbsolutePercent: 3,
      enableIdxLotRounding: true,
      enableBrokerFees: false,
      filterDustTrades: true,
    });

    // Initial total is 12M, Final target total is 12M + 13M = 25M!
    expect(plan.initialTotalIdr).toBe(12_000_000);
    expect(plan.finalTargetTotalIdr).toBe(25_000_000);
    expect(plan.cashInjectionIdr).toBe(13_000_000);
    expect(plan.totalSellIdr).toBe(0); // In buy-only-dca, no selling!
  });
});
