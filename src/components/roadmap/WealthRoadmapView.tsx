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
  monthlySavingsIdr: number;
  setMonthlySavingsIdr: (v: number) => void;
}

export const WealthRoadmapView: React.FC<WealthRoadmapViewProps> = ({
  solvedMetrics,
  monthlySavingsIdr,
  setMonthlySavingsIdr,
}) => {
  const [initialCapitalIdr, setInitialCapitalIdr] = useState(50_000_000);
  const [targetGoalIdr, setTargetGoalIdr] = useState(10_000_000_000);
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

  // Also compare 10% vs 15% vs Active Portfolio after 25 years (mentioned at 02:48 in video)
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
    ModalTabungan: Math.round(pt.totalPrincipalIdr / 1_000_000), // in Juta
    NilaiPortfolio: Math.round(pt.totalValueIdr / 1_000_000),
    WorstCaseCrash: Math.round(pt.drawdownFloorIdr / 1_000_000),
  }));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 5 Cols: Wealth Simulator Parameters */}
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl lg:col-span-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Target className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-extrabold text-white">
              Kalkulator Compounding Rp 10 Miliar Pertama
            </h2>
          </div>

          <p className="text-xs text-slate-400">
            Ilustrasi menit 02:48: Dengan active income yang sama, kenaikan CAGR dari
            10% ke 15%+ membuat hasil akhir melompat berkali-kali lipat berkat
            compounding.
          </p>

          <div className="space-y-3.5">
            {/* Initial Capital */}
            <div>
              <div className="flex justify-between text-xs">
                <label className="font-semibold text-slate-300">
                  Modal Awal Saat Ini (Lump Sum):
                </label>
                <span className="font-mono font-bold text-white">
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
                className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded bg-slate-800 accent-emerald-500"
              />
              <div className="mt-1 flex gap-1.5 text-[11px]">
                {[0, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setInitialCapitalIdr(v)}
                    className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-700"
                  >
                    {formatIdr(v, true)}
                  </button>
                ))}
              </div>
            </div>

            {/* Monthly Contribution */}
            <div>
              <div className="flex justify-between text-xs">
                <label className="font-semibold text-slate-300">
                  Investasi Rutin Bulanan (Active Income Saving):
                </label>
                <span className="font-mono font-bold text-emerald-400">
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
                className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded bg-slate-800 accent-emerald-500"
              />
              <div className="mt-1 flex gap-1.5 text-[11px]">
                {[5_000_000, 10_000_000, 20_000_000, 50_000_000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMonthlySavingsIdr(v)}
                    className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-700"
                  >
                    {formatIdr(v, true)}/bln
                  </button>
                ))}
              </div>
            </div>

            {/* Annual Step-Up % (Kenaikan Active Income Tahunan) */}
            <div>
              <div className="flex justify-between text-xs">
                <label className="font-semibold text-slate-300">
                  Kenaikan Tabungan per Tahun (Karir / Bisnis Naik):
                </label>
                <span className="font-mono font-bold text-sky-400">
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
                className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded bg-slate-800 accent-sky-400"
              />
            </div>

            {/* Target Goal */}
            <div>
              <div className="flex justify-between text-xs">
                <label className="font-semibold text-slate-300">Target Kekayaan:</label>
                <span className="font-mono font-bold text-amber-300">
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
                    className={`flex-1 rounded-lg py-1 font-mono text-[11px] font-bold ${
                      targetGoalIdr === g
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {formatIdr(g, true)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Result Highlight Box */}
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-emerald-300">
                Estimasi Waktu Capai {formatIdr(targetGoalIdr, true)}:
              </span>
              <Award className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="mt-1 font-mono text-3xl font-extrabold text-white">
              {sim.yearsToGoal} Tahun{' '}
              {sim.monthsToGoal > 0 ? `${sim.monthsToGoal} Bulan` : ''}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-emerald-500/20 pt-2 text-xs">
              <div>
                <span className="text-slate-400">Total Modal Pokok:</span>
                <div className="font-mono font-bold text-slate-200">
                  {formatIdr(sim.totalPrincipalAtGoalIdr, true)}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Hasil Compounding:</span>
                <div className="font-mono font-bold text-emerald-400">
                  +{formatIdr(sim.totalGainAtGoalIdr, true)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Compounding Curve & 25-Year Comparison (02:48 in Video) */}
        <div className="space-y-5 lg:col-span-7">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Kurva Pertumbuhan Kekayaan vs Modal Pokok &amp; Risiko Crash
                </h3>
                <p className="text-xs text-slate-400">
                  Menampilkan proyeksi pertumbuhan pada CAGR{' '}
                  <strong className="text-emerald-400">
                    {solvedMetrics.cagr.toFixed(2)}%
                  </strong>{' '}
                  beserta batas bawah jika terjadi Maximum Drawdown (-
                  {solvedMetrics.maxDrawdown}%):
                </p>
              </div>
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>

            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartTimeline}
                  margin={{ top: 10, right: 15, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="yearLabel" stroke="#94a3b8" fontSize={11} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      borderRadius: '0.75rem',
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
                    stroke="#fbbf24"
                    strokeDasharray="4 4"
                    label={{
                      value: `Target ${formatIdr(targetGoalIdr, true)}`,
                      fill: '#fbbf24',
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="NilaiPortfolio"
                    name="Nilai Portfolio (Compounding)"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.25}
                  />
                  <Area
                    type="monotone"
                    dataKey="WorstCaseCrash"
                    name={`Saat Market Crash (-${solvedMetrics.maxDrawdown}%)`}
                    stroke="#f43f5e"
                    fill="#f43f5e"
                    fillOpacity={0.12}
                  />
                  <Area
                    type="monotone"
                    dataKey="ModalTabungan"
                    name="Akumulasi Modal Tabungan"
                    stroke="#38bdf8"
                    fill="#38bdf8"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Perbandingan 25 Tahun (Menit 02:48) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
              <div className="text-xs text-slate-400">25 Tahun @ 10% / thn</div>
              <div className="mt-1 font-mono text-lg font-extrabold text-slate-200">
                {formatIdr(sim10Pct25Y.finalValueAfter25YIdr, true)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Benchmark Konservatif (Menit 02:55)
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
              <div className="text-xs text-slate-400">25 Tahun @ 15% / thn</div>
              <div className="mt-1 font-mono text-lg font-extrabold text-sky-400">
                {formatIdr(sim15Pct25Y.finalValueAfter25YIdr, true)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Benchmark Medium Risk (Menit 03:10)
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4">
              <div className="flex items-center justify-between text-xs text-emerald-300">
                <span>25 Tahun @ Porto Aktif ({solvedMetrics.cagr}%)</span>
                <ShieldAlert className="h-3.5 w-3.5" />
              </div>
              <div className="mt-1 font-mono text-lg font-extrabold text-emerald-400">
                {formatIdr(sim.finalValueAfter25YIdr, true)}
              </div>
              <div className="mt-0.5 text-[11px] text-emerald-300/70">
                Max Drawdown -{solvedMetrics.maxDrawdown}%
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
