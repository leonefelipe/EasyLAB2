import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Zap, CheckCircle, Copy, ArrowUpRight,
  Linkedin, Eye, TrendingUp, AlertTriangle, Star,
  ChevronDown, ChevronUp, ExternalLink, Lightbulb,
  Search, Users, BarChart2, Edit3,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LinkedInAnalysis {
  profileStrength: number;
  ssiEstimate: number;
  profileTitle: string;
  profileArea: string;
  headline: { current: string; optimized: string; score: number };
  about: { score: number; feedback: string; optimized: string };
  topStrengths: string[];
  missingKeywords: string[];
  recruiterVisibilityScore: number;
  recruiterVisibilityTips: string[];
  quickWins: string[];
  improvements: Array<{
    section: string;
    currentState: string;
    suggestion: string;
    impact: "alto" | "medio" | "baixo";
    exampleText: string;
  }>;
  scrapedProfile?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ScoreRing({ value, size = 120, label }: { value: number; size?: number; label: string }) {
  const r = (size / 2) - 10;
  const circ = 2 * Math.PI * r;
  const color = value >= 80 ? "#10b981" : value >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${(value / 100) * circ} ${circ}`}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-900">{value}</span>
          <span className="text-xs text-slate-400">/ 100</span>
        </div>
      </div>
      <span className="text-xs font-medium text-slate-600 text-center">{label}</span>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: "alto" | "medio" | "baixo" }) {
  const map = {
    alto: "bg-red-100 text-red-700",
    medio: "bg-amber-100 text-amber-700",
    baixo: "bg-slate-100 text-slate-600",
  };
  const label = { alto: "Alto impacto", medio: "Médio impacto", baixo: "Baixo impacto" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[impact]}`}>
      {label[impact]}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const copy = () => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };
  return (
    <Button size="sm" variant="outline" onClick={copy} className="flex items-center gap-1 text-xs flex-shrink-0">
      <Copy className="w-3 h-3" /> Copiar
    </Button>
  );
}

function ImprovementCard({ item }: { item: LinkedInAnalysis["improvements"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-sm text-slate-900 flex-shrink-0">{item.section}</span>
          <ImpactBadge impact={item.impact} />
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Estado atual</p>
            <p className="text-sm text-slate-600">{item.currentState}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Sugestão</p>
            <p className="text-sm text-slate-700">{item.suggestion}</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Texto pronto para usar</p>
              <CopyButton text={item.exampleText} />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 whitespace-pre-wrap leading-relaxed">
              {item.exampleText}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function LinkedInPage() {
  const [profileInput, setProfileInput] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [result, setResult] = useState<LinkedInAnalysis | null>(null);

  const analyzeMutation = trpc.linkedin.analyze.useMutation({
    onSuccess: (data: LinkedInAnalysis) => {
      setResult(data);
      toast.success("Análise concluída!");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: { message: string }) => toast.error("Erro: " + err.message),
  });

  const isLinkedInUrl = (s: string) => {
    try { return new URL(s.trim()).hostname.includes("linkedin.com"); } catch { return false; }
  };

  const handleAnalyze = () => {
    if (!profileInput.trim()) {
      toast.error("Cole o link do LinkedIn ou o texto do perfil");
      return;
    }
    analyzeMutation.mutate({
      profileText: profileInput.trim(),
      profileUrl: isLinkedInUrl(profileInput.trim()) ? profileInput.trim() : undefined,
      targetRole: targetRole.trim() || undefined,
    });
  };

  const isLoading = analyzeMutation.isPending;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur-sm border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-900" />
            <span className="font-bold text-lg text-slate-900">Easy Job AI</span>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" className="text-xs">
              ← Analisar Currículo
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-900 to-blue-700 py-14 px-4 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Linkedin className="w-10 h-10 text-white" />
          <h1 className="text-4xl font-bold text-white">Análise de LinkedIn</h1>
        </div>
        <p className="text-blue-200 text-lg max-w-xl mx-auto">
          Cole o link do seu perfil e receba sugestões de otimização para aparecer mais nas buscas de recrutadores
        </p>
      </section>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">

        {/* Input Card */}
        <Card className="p-8 border-2 border-slate-200 hover:border-blue-300 transition-colors">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Linkedin className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Perfil do LinkedIn</h2>
              <p className="text-sm mt-1 text-slate-500">
                Cole o link direto do seu perfil <span className="font-medium text-blue-700">linkedin.com/in/seu-perfil</span> ou o texto copiado do perfil
              </p>
            </div>
          </div>

          <Textarea
            placeholder={`Cole aqui o link do seu LinkedIn (ex: https://linkedin.com/in/seu-perfil)\n\nou cole o texto do seu perfil diretamente`}
            value={profileInput}
            onChange={e => setProfileInput(e.target.value)}
            className="min-h-28 bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400"
          />

          <div className="mt-4">
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Cargo / Vaga alvo <span className="text-slate-400 font-normal">(opcional — melhora a precisão das sugestões)</span>
            </label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              placeholder="Ex: Gerente de Vendas B2B, Desenvolvedor Full Stack, Head of Marketing"
              value={targetRole}
              onChange={e => setTargetRole(e.target.value)}
            />
          </div>

          <div className="mt-6">
            <Button
              onClick={handleAnalyze}
              disabled={isLoading || !profileInput.trim()}
              className="w-full bg-blue-900 hover:bg-blue-800 text-white font-semibold py-3 rounded-lg"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analisando perfil com IA...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 justify-center">
                  <Search className="w-4 h-4" />
                  <span>Analisar Perfil LinkedIn</span>
                </div>
              )}
            </Button>
          </div>

          {/* Nota sobre scraping */}
          <p className="text-xs text-slate-400 mt-3 text-center">
            ⚠️ O LinkedIn bloqueia leituras automáticas. Se a análise automática falhar, cole o texto do perfil diretamente.
          </p>
        </Card>

        {/* Skeleton */}
        {isLoading && (
          <div className="space-y-6 animate-pulse">
            {[1, 2, 3].map(i => (
              <Card key={i} className="p-8 border-2 border-slate-200">
                <div className="h-6 rounded-lg mb-4 w-1/3 bg-slate-200" />
                <div className="space-y-3">
                  <div className="h-4 rounded w-full bg-slate-200" />
                  <div className="h-4 rounded w-4/5 bg-slate-200" />
                  <div className="h-4 rounded w-3/5 bg-slate-200" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Results */}
        {result && !isLoading && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Scores Overview */}
            <Card className="p-8 border-2 border-slate-200">
              <div className="flex items-start gap-3 mb-6">
                <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <BarChart2 className="w-6 h-6 text-blue-700" />
                </div>
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-2xl font-bold text-slate-900">Diagnóstico do Perfil</h2>
                    {result.scrapedProfile && (
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        Perfil lido automaticamente
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 font-medium mt-1">{result.profileTitle}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">{result.profileArea}</span>
                </div>
              </div>

              <div className="flex flex-wrap justify-around gap-8">
                <ScoreRing value={result.profileStrength} label="Força do Perfil" />
                <ScoreRing value={result.ssiEstimate} label="SSI Estimado" />
                <ScoreRing value={result.recruiterVisibilityScore} label="Visibilidade p/ Recrutadores" />
              </div>

              {/* Score bars legend */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-500">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="font-semibold text-slate-700 mb-1">Força do Perfil</p>
                  <p>Completude e qualidade geral. +90 = All-Star (foto, about, 5+ exp, skills)</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="font-semibold text-slate-700 mb-1">SSI Estimado</p>
                  <p>Social Selling Index — identidade profissional, network e engajamento</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="font-semibold text-slate-700 mb-1">Visibilidade</p>
                  <p>Probabilidade de aparecer nas buscas booleanas de recrutadores</p>
                </div>
              </div>
            </Card>

            {/* Quick Wins */}
            <Card className="p-8 border-2 border-emerald-100 bg-emerald-50/30">
              <div className="flex items-start gap-3 mb-5">
                <Lightbulb className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Quick Wins — Faça Agora</h3>
                  <p className="text-sm mt-1 text-slate-500">3 ações de alto impacto que levam menos de 5 minutos</p>
                </div>
              </div>
              <div className="space-y-3">
                {result.quickWins.map((win, i) => (
                  <div key={i} className="flex gap-3 items-start p-4 bg-white rounded-lg border border-emerald-200">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5">{i + 1}</span>
                    <p className="text-sm text-slate-700">{win}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Headline */}
            <Card className="p-8 border-2 border-slate-200">
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Edit3 className="w-5 h-5 text-blue-700" />
                  <h3 className="text-xl font-bold text-slate-900">Headline (Título)</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Score atual:</span>
                  <span className={`font-bold text-lg ${result.headline.score >= 70 ? "text-green-600" : result.headline.score >= 50 ? "text-amber-600" : "text-red-600"}`}>
                    {result.headline.score}/100
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Atual</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700">
                    {result.headline.current || <span className="text-slate-400 italic">Não identificado</span>}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Headline otimizado ✨</p>
                    <CopyButton text={result.headline.optimized} />
                  </div>
                  <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 text-sm text-blue-900 font-medium">
                    {result.headline.optimized}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{result.headline.optimized.length} caracteres (limite: 220)</p>
                </div>
              </div>
            </Card>

            {/* About */}
            <Card className="p-8 border-2 border-slate-200">
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-blue-700" />
                  <h3 className="text-xl font-bold text-slate-900">About (Resumo)</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Score atual:</span>
                  <span className={`font-bold text-lg ${result.about.score >= 70 ? "text-green-600" : result.about.score >= 50 ? "text-amber-600" : "text-red-600"}`}>
                    {result.about.score}/100
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Feedback</p>
                  <p className="text-sm text-amber-900">{result.about.feedback}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">About otimizado ✨</p>
                    <CopyButton text={result.about.optimized} />
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                    {result.about.optimized}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{result.about.optimized.length} caracteres (limite: 2.600)</p>
                </div>
              </div>
            </Card>

            {/* Top Strengths + Missing Keywords */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 border-2 border-green-100 bg-green-50/30">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-bold text-slate-900">Pontos Fortes</h3>
                </div>
                <div className="space-y-2">
                  {result.topStrengths.map((s, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-slate-700">{s}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6 border-2 border-orange-100 bg-orange-50/30">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  <h3 className="text-lg font-bold text-slate-900">Keywords Ausentes</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.missingKeywords.map((kw, i) => (
                    <span key={i} className="px-3 py-1.5 bg-white border border-orange-200 text-orange-800 rounded-full text-xs font-medium">
                      {kw}
                    </span>
                  ))}
                </div>
              </Card>
            </div>

            {/* Recruiter Visibility Tips */}
            <Card className="p-8 border-2 border-blue-100 bg-blue-50/20">
              <div className="flex items-start gap-3 mb-5">
                <Eye className="w-6 h-6 text-blue-700 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-xl font-bold text-slate-900">Visibilidade para Recrutadores</h3>
                    <div className="flex items-center gap-1">
                      <span className={`text-2xl font-bold ${result.recruiterVisibilityScore >= 70 ? "text-green-600" : result.recruiterVisibilityScore >= 50 ? "text-amber-600" : "text-red-600"}`}>
                        {result.recruiterVisibilityScore}
                      </span>
                      <span className="text-slate-400 text-sm">/100</span>
                    </div>
                  </div>
                  <p className="text-sm mt-1 text-slate-500">Como melhorar sua posição nas buscas do LinkedIn Recruiter</p>
                </div>
              </div>
              <div className="space-y-3">
                {result.recruiterVisibilityTips.map((tip, i) => (
                  <div key={i} className="flex gap-3 items-start p-4 bg-white rounded-lg border border-blue-200">
                    <ArrowUpRight className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-700">{tip}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Improvements */}
            <Card className="p-8 border-2 border-slate-200">
              <div className="flex items-start gap-3 mb-6">
                <TrendingUp className="w-6 h-6 text-blue-700 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Melhorias por Seção</h3>
                  <p className="text-sm mt-1 text-slate-500">Clique em cada seção para ver a sugestão e o texto pronto</p>
                </div>
              </div>
              <div className="space-y-3">
                {result.improvements
                  .sort((a, b) => {
                    const order = { alto: 0, medio: 1, baixo: 2 };
                    return order[a.impact] - order[b.impact];
                  })
                  .map((item, i) => (
                    <ImprovementCard key={i} item={item} />
                  ))}
              </div>
            </Card>

            {/* Open LinkedIn CTA */}
            <div className="text-center py-4">
              <a
                href="https://www.linkedin.com/in/me/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
              >
                <Linkedin className="w-4 h-4" />
                Abrir meu LinkedIn para aplicar as melhorias
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
