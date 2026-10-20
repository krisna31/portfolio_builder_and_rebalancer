import React, { useState } from 'react';
import { SolvedPortfolio } from '../../lib/quant/types';
import { simulateWealthToGoal } from '../../lib/quant/wealthSimulator';
import { formatIdr } from '../../lib/formatters';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { TrendingUp, Target, ShieldAlert, Award } from 'lucide-react';

interface WealthRoadmapViewProps {
  solvedMetrics: SolvedPortfolio;
  initialCapitalIdr: number;
  setInitialCapitalIdr: (v: number) => void;
  targetGoalIdr: number;
  setTargetGoalIdr: (v: number) => void;
  monthlySavingsIdr: number;
  setMonthlySavingsIdr: (v: number) => void;
}

export const WealthRoadmapView: React.FC<WealthRoadmapViewProps> = ({
  solvedMetrics,
  initialCapitalIdr,
  setInitialCapitalIdr,
  targetGoalIdr,
  setTargetGoalIdr,
  monthlySavingsIdr,
  setMonthlySavingsIdr,
}) => {
  const [annualStepUpPct, setAnnualStepUpPct] = useState(0);

  const sim = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: monthlySavingsIdr,
    annualCagrPercent: solvedMetrics.cagr,
    maxDrawdownPercent: solvedMetrics.maxDrawdown,
    targetWealthIdr: targetGoalIdr,
    annualStepUpPercent: annualStepUpPct,
    maxYears: 30,
  });

  const sim10Pct25Y = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: monthlySavingsIdr,
    annualCagrPercent: 10,
    maxDrawdownPercent: 5,
    targetWealthIdr: targetGoalIdr,
    annualStepUpPercent: annualStepUpPct,
    maxYears: 25,
  });
  const sim15Pct25Y = simulateWealthToGoal({
    initialCapitalIdr,
    monthlyContributionIdr: monthlySavingsIdr,
    annualCagrPercent: 15,
    maxDrawdownPercent: 8,
    targetWealthIdr: targetGoalIdr,
    annualStepUpPercent: annualStepUpPct,
    maxYears: 25,
  });

  const displayYears = Math.min(30, Math.max(12, sim.yearsToGoal + 4));
  const chartTimeline = sim.timeline.slice(0, displayYears + 1).map((pt) => ({
    yearLabel: `Thn ${pt.year}`,
    ModalTabungan: Math.round(pt.totalPrincipalIdr / 1_000_000),
    NilaiPortfolio: Math.round(pt.totalValueIdr / 1_000_000),
    WorstCaseCrash: Math.round(pt.drawdownFloorIdr / 1_000_000),
  }));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 5 Cols: Wealth Simulator Parameters */}
        <div className="ui-card space-y-4 rounded-xl p-5 lg:col-span-5">
          <div className="ui-border flex items-center gap-2 border-b pb-3">
            <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="ui-text-main text-sm font-bold">
              Kalkulator Compounding Rp 10 Miliar Pertama
            </h2>
          </div>

          <p className="ui-text-muted text-xs">
            Ilustrasi menit 02:48: Dengan active income yang sama, kenaikan CAGR dari
            10% ke 15%+ membuat hasil akhir melompat berkali-kali lipat.
          </p>

          <div className="space-y-3.5">
            <div>
              <div className="flex justify-between text-xs">
                <label className="ui-text-secondary font-medium">
                  Modal Awal Saat Ini (Lump Sum):
                </label>
                <span className="ui-text-main font-mono font-semibold">
                  {formatIdr(initialCapitalIdr)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2_000_000_000}
                step={10_000_000}
                value={initialCapitalIdr}
                onChange={(e) => setInitialCapitalIdr(Number(e.target.value))}
                className="mt-1.5 h-1.5 w-full cursor-pointer"
              />
              <div className="mt-1 flex gap-1.5 text-[11px]">
                {[0, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setInitialCapitalIdr(v)}
                    className="ui-subtle ui-text-secondary rounded px-2 py-0.5"
                  >
                    {formatIdr(v, true)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label className="ui-text-secondary font-medium">
                  Investasi Rutin Bulanan (DCA):
                </label>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatIdr(monthlySavingsIdr)} / bln
                </span>
              </div>
              <input
                type="range"
                min={1_000_000}
                max={100_000_000}
                step={1_000_000}
                value={monthlySavingsIdr}
                onChange={(e) => setMonthlySavingsIdr(Number(e.target.value))}
                className="mt-1.5 h-1.5 w-full cursor-pointer"
              />
              <div className="mt-1 flex gap-1.5 text-[11px]">
                {[5_000_000, 10_000_000, 20_000_000, 50_000_000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMonthlySavingsIdr(v)}
                    className="ui-subtle ui-text-secondary rounded px-2 py-0.5"
                  >
                    {formatIdr(v, true)}/bln
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label className="ui-text-secondary font-medium">
                  Kenaikan Tabungan per Tahun:
                </label>
                <span className="ui-text-main font-mono font-semibold">
                  +{annualStepUpPct}% / tahun
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={25}
                step={1}
                value={annualStepUpPct}
                onChange={(e) => setAnnualStepUpPct(Number(e.target.value))}
                className="mt-1.5 h-1.5 w-full cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label className="ui-text-secondary font-medium">
                  Target Kekayaan:
                </label>
                <span className="ui-text-main font-mono font-semibold">
                  {formatIdr(targetGoalIdr)}
                </span>
              </div>
              <div className="mt-1.5 flex gap-1.5 text-xs">
                {[
                  1_000_000_000,
                  5_000_000_000,
                  10_000_000_000,
                  25_000_000_000,
                  50_000_000_000,
                ].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setTargetGoalIdr(g)}
                    className={`flex-1 rounded py-1 font-mono text-[11px] font-medium ${
                      targetGoalIdr === g
                        ? 'bg-emerald-600 text-white font-semibold'
                        : 'ui-subtle ui-text-secondary'
                    }`}
                  >
                    {formatIdr(g, true)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ui-subtle rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="ui-text-secondary text-xs font-semibold uppercase">
                Estimasi Waktu Capai {formatIdr(targetGoalIdr, true)}:
              </span>
              <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="ui-text-main mt-1 font-mono text-2xl font-bold">
              {sim.yearsToGoal} Tahun{' '}
              {sim.monthsToGoal > 0 ? `${sim.monthsToGoal} Bulan` : ''}
            </div>
            <div className="ui-border mt-2 grid grid-cols-2 gap-2 border-t pt-2 text-xs">
              <div>
                <span className="ui-text-muted">Total Modal Pokok:</span>
                <div className="ui-text-main font-mono font-semibold">
                  {formatIdr(sim.totalPrincipalAtGoalIdr, true)}
                </div>
              </div>
              <div>
                <span className="ui-text-muted">Hasil Compounding:</span>
                <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  +{formatIdr(sim.totalGainAtGoalIdr, true)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Compounding Curve */}
        <div className="space-y-5 lg:col-span-7">
          <div className="ui-card rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="ui-text-main text-sm font-bold">
                  Kurva Pertumbuhan Kekayaan vs Modal Pokok &amp; Risiko Crash
                </h3>
                <p className="ui-text-muted text-xs">
                  Proyeksi pada CAGR{' '}
                  <strong className="ui-text-main">
                    {solvedMetrics.cagr.toFixed(2)}%
                  </strong>{' '}
                  beserta batas bawah Maximum Drawdown (-{solvedMetrics.maxDrawdown}%):
                </p>
              </div>
              <TrendingUp className="ui-text-muted h-4 w-4" />
            </div>

            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartTimeline}
                  margin={{ top: 10, right: 15, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="yearLabel" stroke="#71717a" fontSize={11} />
                  <YAxis
                    stroke="#71717a"
                    fontSize={11}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-main)',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                    formatter={(val: number, name: string) => [
                      `Rp ${val.toLocaleString('id-ID')} Juta`,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <ReferenceLine
                    y={targetGoalIdr / 1_000_000}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: `Target ${formatIdr(targetGoalIdr, true)}`,
                      fill: '#f59e0b',
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="NilaiPortfolio"
                    name="Nilai Portfolio (Compounding)"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.2}
                  />
                  <Area
                    type="monotone"
                    dataKey="WorstCaseCrash"
                    name={`Saat Market Crash (-${solvedMetrics.maxDrawdown}%)`}
                    stroke="#f43f5e"
                    fill="#f43f5e"
                    fillOpacity={0.1}
                  />
                  <Area
                    type="monotone"
                    dataKey="ModalTabungan"
                    name="Akumulasi Modal Tabungan"
                    stroke="#0ea5e9"
                    fill="#0ea5e9"
                    fillOpacity={0.12}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="ui-card rounded-xl p-4">
              <div className="ui-text-muted text-xs">25 Tahun @ 10% / thn</div>
              <div className="ui-text-main mt-1 font-mono text-lg font-bold">
                {formatIdr(sim10Pct25Y.finalValueAfter25YIdr, true)}
              </div>
              <div className="ui-text-muted mt-0.5 text-[11px]">
                Benchmark Konservatif (02:55)
              </div>
            </div>

            <div className="ui-card rounded-xl p-4">
              <div className="ui-text-muted text-xs">25 Tahun @ 15% / thn</div>
              <div className="ui-text-main mt-1 font-mono text-lg font-bold">
                {formatIdr(sim15Pct25Y.finalValueAfter25YIdr, true)}
              </div>
              <div className="ui-text-muted mt-0.5 text-[11px]">
                Benchmark Medium Risk (03:10)
              </div>
            </div>

            <div className="ui-card rounded-xl p-4">
              <div className="ui-text-muted flex items-center justify-between text-xs">
                <span>25 Tahun @ Porto Aktif ({solvedMetrics.cagr}%)</span>
                <ShieldAlert className="h-3.5 w-3.5" />
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatIdr(sim.finalValueAfter25YIdr, true)}
              </div>
              <div className="ui-text-muted mt-0.5 text-[11px]">
                Max Drawdown -{solvedMetrics.maxDrawdown}%
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
