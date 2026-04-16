/**
 * SalaryIntelligencePanel.tsx
 *
 * Production-grade salary intelligence display component.
 * Design: Data-dense financial terminal aesthetic — dark slate with sharp
 * amber/teal accents, monospaced numbers, precise grid layouts.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { TrendingUp, TrendingDown, Minus, Info, RefreshCw, BarChart2, Award } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalaryEstimate {
  cltMin: number;
  cltMedian: number;
  cltMax: number;
  pjMin: number;
  pjMedian: number;
  pjMax: number;
  marketPercentile: number;
  confidenceScore: number;
  confidence: "high" | "medium" | "low";
  matchMethod: string;
  marketReferences: string[];
  rationale: string;
  currency: string;
}

interface Props {
  role: string;
  seniority: string;
  industry?: string;
  region?: string;
  skills?: string[];
  yearsExperience?: number;
  isDarkMode?: boolean;
  // If pre-fetched estimate is passed, skip the query
  prefetchedEstimate?: SalaryEstimate;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR")}`;
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}

// ─── Percentile bar component ─────────────────────────────────────────────────

function PercentileBar({
  min, median, max, label, color, isDark,
}: {
  min: number; median: number; max: number; label: string;
  color: "amber" | "teal"; isDark: boolean;
}) {
  const total = max - min || 1;
  const medPct = Math.round(((median - min) / total) * 100);

  const trackBg  = isDark ? "bg-slate-700"   : "bg-slate-200";
  const fillBg   = color === "amber"
    ? (isDark ? "bg-amber-500/30" : "bg-amber-400/40")
    : (isDark ? "bg-teal-500/30"  : "bg-teal-400/40");
  const dotColor = color === "amber"
    ? (isDark ? "bg-amber-400" : "bg-amber-500")
    : (isDark ? "bg-teal-400"  : "bg-teal-500");
  const textColor = color === "amber"
    ? (isDark ? "text-amber-400" : "text-amber-600")
    : (isDark ? "text-teal-400"  : "text-teal-600");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-widest ${textColor}`}>{label}</span>
        <span className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          {fmt(min)} — {fmt(max)}
        </span>
      </div>

      {/* Range bar */}
      <div className={`relative h-2.5 rounded-full ${trackBg} overflow-visible`}>
        <div className={`absolute inset-0 rounded-full ${fillBg}`} />
        {/* Median dot */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full ${dotColor} border-2 ${isDark ? "border-slate-800" : "border-white"} shadow-lg transition-all`}
          style={{ left: `calc(${medPct}% - 8px)` }}
          title={`Mediana: ${fmt(median)}`}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between items-center mt-1">
        <span className={`text-[11px] font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>
          {fmtK(min)}
        </span>
        <div className="flex flex-col items-center">
          <span className={`text-sm font-black font-mono ${isDark ? "text-white" : "text-slate-900"}`}>
            {fmt(median)}
          </span>
          <span className={`text-[10px] uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            mediana
          </span>
        </div>
        <span className={`text-[11px] font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>
          {fmtK(max)}
        </span>
      </div>
    </div>
  );
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ score, level, isDark }: {
  score: number; level: "high" | "medium" | "low"; isDark: boolean;
}) {
  const config = {
    high:   { label: "Alta",  icon: TrendingUp,   cls: isDark ? "text-emerald-400 bg-emerald-900/30 border-emerald-700/40" : "text-emerald-700 bg-emerald-50 border-emerald-200" },
    medium: { label: "Média", icon: Minus,         cls: isDark ? "text-amber-400 bg-amber-900/30 border-amber-700/40"       : "text-amber-700 bg-amber-50 border-amber-200" },
    low:    { label: "Baixa", icon: TrendingDown,  cls: isDark ? "text-red-400 bg-red-900/30 border-red-700/40"             : "text-red-700 bg-red-50 border-red-200" },
  }[level];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.cls}`}>
      <Icon className="w-3 h-3" />
      Confiança {config.label} · {score}%
    </span>
  );
}

// ─── Method badge ─────────────────────────────────────────────────────────────

function MethodBadge({ method, isDark }: { method: string; isDark: boolean }) {
  const labels: Record<string, string> = {
    exact:               "Match direto",
    seniority_adjusted:  "Ajuste de senioridade",
    cluster_similar:     "Cargo similar",
    industry_estimated:  "Estimativa paramétrica",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono ${isDark ? "bg-slate-700 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
      <Award className="w-3 h-3" />
      {labels[method] ?? method}
    </span>
  );
}

// ─── Trend mini-chart ─────────────────────────────────────────────────────────

const TREND_DATA = [
  { q: "Q1 24", val: 0.88 },
  { q: "Q2 24", val: 0.91 },
  { q: "Q3 24", val: 0.95 },
  { q: "Q4 24", val: 0.97 },
  { q: "Q1 25", val: 1.00 },
  { q: "Q2 25", val: 1.03 },
];

function TrendChart({ median, isDark }: { median: number; isDark: boolean }) {
  const chartData = TREND_DATA.map(d => ({
    q: d.q,
    salary: Math.round(median * d.val / 100) * 100,
  }));

  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="q"
            tick={{ fontSize: 9, fill: isDark ? "#64748b" : "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            formatter={(v: number) => [fmt(v), "Mediana CLT"]}
            contentStyle={{
              background: isDark ? "#1e293b" : "#fff",
              border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
              borderRadius: "6px",
              fontSize: "11px",
              color: isDark ? "#e2e8f0" : "#1e293b",
            }}
            labelStyle={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "10px" }}
          />
          <ReferenceLine
            y={chartData[chartData.length - 1].salary}
            stroke={isDark ? "#f59e0b" : "#d97706"}
            strokeDasharray="3 3"
            strokeOpacity={0.4}
          />
          <Line
            type="monotone"
            dataKey="salary"
            stroke={isDark ? "#f59e0b" : "#d97706"}
            strokeWidth={2}
            dot={{ r: 2, fill: isDark ? "#f59e0b" : "#d97706" }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SalaryIntelligencePanel({
  role,
  seniority,
  industry,
  region,
  skills,
  yearsExperience,
  isDarkMode = false,
  prefetchedEstimate,
}: Props) {
  const [showTrend, setShowTrend] = useState(false);

  const validSeniority = (["estagio","junior","pleno","senior","gerente","diretor","clevel"] as const)
    .includes(seniority as never) ? seniority as "estagio"|"junior"|"pleno"|"senior"|"gerente"|"diretor"|"clevel" : "pleno";

  const query = trpc.salary.estimate.useQuery(
    { role, seniority: validSeniority, industry, region, skills, yearsExperience },
    { enabled: !prefetchedEstimate, staleTime: 1000 * 60 * 30 }
  );

  const est: SalaryEstimate | undefined = prefetchedEstimate ?? query.data;
  const isLoading = !prefetchedEstimate && query.isLoading;
  const isError   = !prefetchedEstimate && query.isError;

  const dk = isDarkMode;
  const cardCls = dk
    ? "bg-slate-800/80 border-slate-700"
    : "bg-white border-slate-200";

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={`rounded-xl border p-6 ${cardCls} animate-pulse`}>
        <div className={`h-4 w-48 rounded mb-4 ${dk ? "bg-slate-700" : "bg-slate-200"}`} />
        <div className={`h-8 w-32 rounded mb-2 ${dk ? "bg-slate-700" : "bg-slate-200"}`} />
        <div className={`h-3 w-full rounded ${dk ? "bg-slate-700" : "bg-slate-200"}`} />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError || !est) {
    return (
      <div className={`rounded-xl border p-6 ${cardCls}`}>
        <p className={`text-sm ${dk ? "text-slate-400" : "text-slate-500"}`}>
          Não foi possível estimar o salário para este cargo.
        </p>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className={`rounded-xl border overflow-hidden ${cardCls}`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b flex items-center justify-between ${dk ? "border-slate-700 bg-slate-900/40" : "border-slate-100 bg-slate-50/60"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${dk ? "bg-amber-900/40" : "bg-amber-100"}`}>
            <BarChart2 className={`w-4 h-4 ${dk ? "text-amber-400" : "text-amber-600"}`} />
          </div>
          <div>
            <p className={`text-xs uppercase tracking-widest font-bold ${dk ? "text-slate-400" : "text-slate-500"}`}>
              Inteligência Salarial
            </p>
            <p className={`text-sm font-semibold capitalize ${dk ? "text-white" : "text-slate-900"}`}>
              {role} · {seniority}
              {region ? ` · ${region.toUpperCase()}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MethodBadge method={est.matchMethod} isDark={dk} />
          <button
            onClick={() => setShowTrend(v => !v)}
            className={`p-1.5 rounded-lg transition-colors ${dk ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
            title="Ver tendência de mercado"
          >
            <TrendingUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-6">
        {/* Confidence */}
        <div className="flex items-center gap-3 flex-wrap">
          <ConfidenceBadge score={est.confidenceScore} level={est.confidence} isDark={dk} />
          <span className={`text-xs ${dk ? "text-slate-500" : "text-slate-400"}`}>
            {new Date().getFullYear()} · Mercado Brasileiro
          </span>
        </div>

        {/* CLT bar */}
        <PercentileBar
          min={est.cltMin} median={est.cltMedian} max={est.cltMax}
          label="CLT · com benefícios"
          color="amber"
          isDark={dk}
        />

        {/* PJ bar */}
        <PercentileBar
          min={est.pjMin} median={est.pjMedian} max={est.pjMax}
          label="PJ · sem benefícios (bruto)"
          color="teal"
          isDark={dk}
        />

        {/* CLT/PJ note */}
        <p className={`text-[11px] leading-relaxed ${dk ? "text-slate-500" : "text-slate-400"}`}>
          CLT inclui FGTS, férias, 13º (valor bruto). PJ: descontar INSS + IR + contador (∼25-30%).
        </p>

        {/* Trend chart */}
        {showTrend && (
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${dk ? "text-slate-400" : "text-slate-500"}`}>
              Tendência salarial (mediana CLT · últimos 6 trimestres)
            </p>
            <TrendChart median={est.cltMedian} isDark={dk} />
            <p className={`text-[10px] mt-1 ${dk ? "text-slate-600" : "text-slate-400"}`}>
              * Projeção estimada baseada em tendência de mercado BR
            </p>
          </div>
        )}

        {/* Rationale */}
        <div className={`rounded-lg p-3 text-xs leading-relaxed ${dk ? "bg-slate-900/40 text-slate-400" : "bg-slate-50 text-slate-600"}`}>
          <Info className="w-3 h-3 inline mr-1 opacity-60" />
          {est.rationale}
        </div>

        {/* Market references */}
        {est.marketReferences.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {est.marketReferences.map((ref, i) => (
              <span
                key={i}
                className={`text-[10px] px-2 py-0.5 rounded border font-mono ${dk ? "border-slate-700 text-slate-500" : "border-slate-200 text-slate-400"}`}
              >
                📊 {ref}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SalaryIntelligencePanel;
