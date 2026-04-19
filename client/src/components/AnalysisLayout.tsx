/**
 * AnalysisLayout.tsx
 * Split-panel layout: left=inputs, right=results with tabs.
 * Place at: client/src/components/AnalysisLayout.tsx
 *
 * Usage in Home.tsx — replace the main content <div> with:
 *   <AnalysisLayout ... />
 */

import { useState, useRef, useEffect } from "react";
import {
  Loader2, Upload, Zap, FileText, CheckCircle, RefreshCw,
  AlertTriangle, Copy, Download, Languages, Edit3, Save, X,
  LayoutPanelLeft, TrendingUp, DollarSign, Lightbulb, Link2,
  ChevronDown, ChevronUp, ExternalLink, Building2, MapPin,
  Search, Briefcase, BookOpen, Star, BarChart2, Eye, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { extractTextFromFile } from "@/lib/fileExtractor";
import { generateResumePDF } from "@/lib/pdfGenerator";
import { generateClientReport } from "@/lib/clientReportGenerator";

// ─── Types (mirrors resumeRouter output) ─────────────────────────────────────

interface ScoreBreakdown { technicalSkills: number; experience: number; keywords: number; tools: number; seniority: number }
interface AtsBreakdown { parsing: number; keywordMatch: number; experienceQuality: number; impactMetrics: number; formatting: number; skillsAlignment: number }
interface ImprovedBullet { original: string; improved: string; reason: string }
interface SalaryRange { cltMin: number; cltMax: number; pjMin: number; pjMax: number; currency: string; confidence: "high" | "medium" | "low"; rationale: string }

export interface AnalysisResult {
  matchScore: number; projectedMatchScore: number; jobTitle?: string; jobArea?: string;
  keywords: string[]; suggestions: string[]; optimizedResume: string; scrapedJob?: boolean;
  changes: Array<{ section: string; description: string; impact: "alto" | "medio" | "baixo" }>;
  coverLetterPoints?: string[]; gapAnalysis?: string[]; scoreBreakdown: ScoreBreakdown;
  atsScore?: number; atsScoreBreakdown?: AtsBreakdown;
  strengths?: string[]; weaknesses?: string[]; missingKeywords?: string[];
  improvedBullets?: ImprovedBullet[];
  recruiterInsights?: string[]; seniorityLevel?: string; careerTrajectory?: string;
  formattingIssues?: string[]; competitiveEdges?: string[]; competitiveRisks?: string[];
  salaryRange?: SalaryRange; negotiationTips?: string[];
  recruiterProfile?: { companyType: string; cultureSignals: string; recruiterFears: string[]; recruiterTriggers: string[]; idealNarrative: string };
}

interface SavedCV { text: string; fileName: string; savedAt: string }
interface JobListing { title: string; company: string; location: string; url: string; source: string; description: string; matchReason: string; applicantCount?: number; isReal: boolean; publishedAt?: string }

const LS_CV = "easyjobai_saved_cv";
const LS_HIST = "easyjobai_history";
function loadCV(): SavedCV | null { try { return JSON.parse(localStorage.getItem(LS_CV) || "null"); } catch { return null; } }
function saveCV(cv: SavedCV) { localStorage.setItem(LS_CV, JSON.stringify(cv)); }
function clearCV() { localStorage.removeItem(LS_CV); }
function loadHistory(): Array<{ id: string; jobTitle: string; jobArea: string; matchScore: number; projectedMatchScore: number; date: string; result: AnalysisResult; resumeText: string }> {
  try { return JSON.parse(localStorage.getItem(LS_HIST) || "[]"); } catch { return []; }
}
function addHistory(item: ReturnType<typeof loadHistory>[number]) {
  const h = loadHistory();
  localStorage.setItem(LS_HIST, JSON.stringify([item, ...h.filter(x => x.id !== item.id)].slice(0, 10)));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreRing({ score, size = 100, color }: { score: number; size?: number; color: string }) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${(score / 100) * circ} ${circ}`}
        style={{ transition: "stroke-dasharray 1s ease" }} />
    </svg>
  );
}

function ScoreCard({ label, score, max = 100, color }: { label: string; score: number; max?: number; color: string }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <ScoreRing score={pct} size={80} color={color} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black text-slate-900">{score}</span>
          <span className="text-[10px] text-slate-400">/{max}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-slate-600 text-center leading-tight">{label}</span>
    </div>
  );
}

function Collapsible({ title, icon: Icon, children, defaultOpen = false, badge }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean; badge?: string | number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-sm text-slate-900">{title}</span>
          {badge !== undefined && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{badge}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-slate-100 pt-3">{children}</div>}
    </div>
  );
}

function ResumeText({ text }: { text: string }) {
  if (!text) return null;
  const normalized = text.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const isSectionTitle = (l: string) => {
    const t = l.trim(); if (t.length < 4) return false;
    const alpha = t.replace(/[^a-zA-ZÀ-ÿ]/g, "");
    if (!alpha.length) return false;
    return (t.replace(/[^A-ZÀ-ÖØ-Þ]/g, "").length / alpha.length) >= 0.7;
  };
  const isBullet = (l: string) => /^[•\-\*]/.test(l.trim());
  return (
    <div className="font-sans">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-2" />;
        if (i === lines.findIndex(l => l.trim().length > 0))
          return <h1 key={i} className="text-xl font-bold text-slate-900 mb-1">{t}</h1>;
        if (isSectionTitle(t))
          return <h2 key={i} className="text-xs font-bold text-blue-800 uppercase tracking-widest border-b border-blue-100 pb-0.5 mt-4 mb-1">{t}</h2>;
        if (isBullet(t))
          return <div key={i} className="flex gap-2 items-start ml-2 my-0.5"><span className="text-blue-500 text-xs mt-1">•</span><span className="text-slate-700 text-xs leading-relaxed">{t.replace(/^[•\-\*]\s*/, "")}</span></div>;
        return <p key={i} className="text-xs text-slate-700 leading-relaxed my-0.5">{t}</p>;
      })}
    </div>
  );
}

// ─── Tab IDs ──────────────────────────────────────────────────────────────────

type Tab = "overview" | "ats" | "salary" | "improvements" | "cv";

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  isDarkMode: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnalysisLayout({ isDarkMode }: Props) {
  const dk = isDarkMode;

  // Inputs
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jobInput, setJobInput] = useState("");
  const [jobFetchState, setJobFetchState] = useState<"idle" | "loading" | "success" | "warn">("idle");
  const [fetchedJobText, setFetchedJobText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [savedCV, setSavedCV] = useState<SavedCV | null>(null);

  // ── NOVO: Nome do cliente ──────────────────────────────────────────────────
  const [clientName, setClientName] = useState("");

  // Results
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [translatedResume, setTranslatedResume] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedResume, setEditedResume] = useState("");
  const [jobListings, setJobListings] = useState<JobListing[]>([]);
  const [isSearchingJobs, setIsSearchingJobs] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsPanelRef = useRef<HTMLDivElement>(null);

  // Load saved CV
  useEffect(() => {
    const cv = loadCV();
    if (cv) { setSavedCV(cv); }
  }, []);

  // Debounced URL detection
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = jobInput.trim();
    if (!trimmed || !trimmed.startsWith("http") || trimmed.includes(" ")) return;

    debounceRef.current = setTimeout(() => {
      handleFetchJob(trimmed);
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [jobInput]);

  const extractJobMutation = trpc.jobExtractor.extractJob.useMutation({
    onSuccess: (data) => {
      if (data.scrapedSuccessfully && data.description) {
        setFetchedJobText(data.description);
        setJobFetchState("success");
        toast.success("Vaga importada automaticamente!");
      } else {
        setJobFetchState("warn");
        toast.info((data as { userMessage?: string }).userMessage || "Cole o texto da vaga manualmente.");
      }
    },
    onError: () => { setJobFetchState("idle"); },
  });

  const handleFetchJob = (url: string) => {
    setJobFetchState("loading");
    extractJobMutation.mutate({ url });
  };

  const analyzeMutation = trpc.resume.analyze.useMutation({
    onSuccess: (data: AnalysisResult) => {
      setResults(data);
      setActiveTab("overview");
      setTranslatedResume(null);
      toast.success("Análise concluída!");
      addHistory({
        id: Date.now().toString(),
        jobTitle: data.jobTitle || "Vaga",
        jobArea: data.jobArea || "",
        matchScore: data.matchScore,
        projectedMatchScore: data.projectedMatchScore,
        date: new Date().toLocaleString("pt-BR"),
        result: data,
        resumeText,
      });
      setTimeout(() => resultsPanelRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const translateMutation = trpc.translate.toEnglish.useMutation({
    onSuccess: (data: { translatedResume: string }) => {
      setTranslatedResume(data.translatedResume);
      toast.success("Traduzido para inglês!");
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const searchJobsMutation = trpc.jobs.search.useMutation({
    onSuccess: (data: { jobs: JobListing[]; totalFound: number }) => {
      setJobListings(data.jobs);
      setIsSearchingJobs(false);
      toast.success(`${data.jobs.length} vagas encontradas!`);
    },
    onError: () => { setIsSearchingJobs(false); toast.error("Erro ao buscar vagas."); },
  });

  // Handlers
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setIsExtracting(true);
    try {
      const text = await extractTextFromFile(file);
      setResumeText(text);
      const cv: SavedCV = { text, fileName: file.name, savedAt: new Date().toLocaleString("pt-BR") };
      saveCV(cv); setSavedCV(cv);
      toast.success("Currículo carregado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar arquivo");
    } finally { setIsExtracting(false); }
  };

  const handleAnalyze = () => {
    if (!resumeText) { toast.error("Faça o upload do seu currículo primeiro"); return; }
    const jobText = fetchedJobText || jobInput.trim();
    if (!jobText) { toast.error("Informe a vaga"); return; }
    analyzeMutation.mutate({ resumeText, jobUrl: jobText });
  };

  const isAnalyzing = analyzeMutation.isPending;
  const jobText = fetchedJobText || jobInput;

  // ── TAB CONTENT ──────────────────────────────────────────────────────────────

  const renderOverview = () => {
    if (!results) return null;
    const sc = results.matchScore;
    const pc = results.projectedMatchScore;
    const scoreColor = sc >= 75 ? "#10b981" : sc >= 55 ? "#f59e0b" : "#ef4444";
    return (
      <div className="space-y-4">
        {/* Score header */}
        <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="relative w-24 h-24 flex-shrink-0">
            <ScoreRing score={sc} size={96} color={scoreColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-slate-900">{sc}%</span>
              <span className="text-[10px] text-slate-400">match</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            {results.jobTitle && <p className="font-bold text-slate-900 truncate">{results.jobTitle}</p>}
            {results.jobArea && <p className="text-xs text-slate-500 mb-2">{results.jobArea}</p>}
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">Antes: <b className="text-slate-700">{sc}%</b></span>
              <span className="text-slate-300">→</span>
              <span className="text-xs text-slate-500">Projetado: <b className="text-green-600">{pc}%</b></span>
              {pc > sc && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">+{pc - sc}pts</span>}
            </div>
          </div>
        </div>

        {/* Score breakdown */}
        <Collapsible title="Detalhamento" icon={BarChart2} defaultOpen>
          <div className="space-y-2 pt-1">
            {([
              ["Habilidades técnicas", results.scoreBreakdown.technicalSkills, 30],
              ["Experiência", results.scoreBreakdown.experience, 30],
              ["Palavras-chave", results.scoreBreakdown.keywords, 20],
              ["Ferramentas", results.scoreBreakdown.tools, 10],
              ["Senioridade", results.scoreBreakdown.seniority, 10],
            ] as [string, number, number][]).map(([label, val, max]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-slate-600 w-36 flex-shrink-0">{label}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full">
                  <div className="h-2 rounded-full bg-blue-500 transition-all duration-700"
                    style={{ width: `${(val / max) * 100}%` }} />
                </div>
                <span className="text-xs font-medium text-slate-700 w-10 text-right">{val}/{max}</span>
              </div>
            ))}
          </div>
        </Collapsible>

        {/* Keywords */}
        <Collapsible title="Palavras-chave da vaga" icon={Star} badge={results.keywords.length}>
          <div className="flex flex-wrap gap-2 pt-1">
            {results.keywords.map((kw, i) => (
              <span key={i} className="px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">{kw}</span>
            ))}
          </div>
        </Collapsible>

        {/* Gap analysis */}
        {results.gapAnalysis && results.gapAnalysis.length > 0 && (
          <Collapsible title="O que falta" icon={AlertTriangle} badge={results.gapAnalysis.length}>
            <ul className="space-y-2 pt-1">
              {results.gapAnalysis.map((g, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <span className="text-amber-500 flex-shrink-0">⚠</span>{g}
                </li>
              ))}
            </ul>
          </Collapsible>
        )}

        {/* Suggestions */}
        <Collapsible title="Sugestões" icon={Lightbulb} badge={results.suggestions.length}>
          <ul className="space-y-2 pt-1">
            {results.suggestions.map((s, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-700">
                <span className="text-blue-500 font-bold flex-shrink-0">{i + 1}.</span>{s}
              </li>
            ))}
          </ul>
        </Collapsible>

        {/* Cover letter */}
        {results.coverLetterPoints && results.coverLetterPoints.length > 0 && (
          <Collapsible title="Carta de Apresentação" icon={BookOpen} badge={results.coverLetterPoints.length}>
            <div className="space-y-2 pt-1">
              {results.coverLetterPoints.map((p, i) => (
                <div key={i} className="flex gap-2 text-xs text-slate-700 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <span className="font-bold text-blue-600 flex-shrink-0">{i + 1}.</span>{p}
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {/* Job search */}
        {results.jobTitle && (
          <div className="pt-2">
            <Button onClick={() => {
              setIsSearchingJobs(true);
              searchJobsMutation.mutate({
                jobTitle: results.jobTitle!,
                jobArea: results.jobArea || "",
                keywords: results.keywords || [],
                location: "Brasil",
                seniorityLevel: results.seniorityLevel || "Pleno",
              });
            }} disabled={isSearchingJobs} variant="outline" className="w-full text-sm gap-2">
              {isSearchingJobs ? <><Loader2 className="w-3 h-3 animate-spin" />Buscando...</> : <><Search className="w-3 h-3" />Buscar vagas compatíveis</>}
            </Button>
            {jobListings.length > 0 && (
              <div className="mt-3 space-y-2">
                {jobListings.slice(0, 5).map((job, i) => (
                  <a key={i} href={job.url} target="_blank" rel="noopener noreferrer"
                    className="block p-3 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{job.title}</p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                          {job.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{job.company}</span>}
                          {job.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location}</span>}
                          <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{job.source}</span>
                        </div>
                        {job.matchReason && <p className="text-[10px] text-slate-400 mt-1">{job.matchReason}</p>}
                      </div>
                      <ExternalLink className="w-3 h-3 text-blue-500 flex-shrink-0 mt-1" />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderATS = () => {
    if (!results) return null;
    return (
      <div className="space-y-4">
        {/* ATS Score */}
        {results.atsScore !== undefined && results.atsScoreBreakdown && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative w-20 h-20 flex-shrink-0">
                <ScoreRing score={results.atsScore} size={80}
                  color={results.atsScore >= 75 ? "#10b981" : results.atsScore >= 55 ? "#f59e0b" : "#ef4444"} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-slate-900">{results.atsScore}</span>
                  <span className="text-[10px] text-slate-400">/100</span>
                </div>
              </div>
              <div>
                <p className="font-bold text-slate-900">ATS Score</p>
                <p className="text-xs text-slate-500">Como os sistemas ATS avaliam seu currículo</p>
                {results.seniorityLevel && (
                  <span className="mt-1 inline-block px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">{results.seniorityLevel}</span>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              {([
                ["Parseabilidade", results.atsScoreBreakdown.parsing, 20],
                ["Match keywords", results.atsScoreBreakdown.keywordMatch, 25],
                ["Qualidade exp.", results.atsScoreBreakdown.experienceQuality, 20],
                ["Métricas impacto", results.atsScoreBreakdown.impactMetrics, 15],
                ["Formatação", results.atsScoreBreakdown.formatting, 10],
                ["Alinhamento skills", results.atsScoreBreakdown.skillsAlignment, 10],
              ] as [string, number, number][]).map(([label, val, max]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-600 w-32 flex-shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full">
                    <div className="h-1.5 rounded-full bg-indigo-500 transition-all duration-700"
                      style={{ width: `${(val / max) * 100}%` }} />
                  </div>
                  <span className="text-[11px] font-medium text-slate-700 w-8 text-right">{val}/{max}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formatting issues */}
        {results.formattingIssues && results.formattingIssues.length > 0 && (
          <Collapsible title="Problemas de formatação" icon={AlertTriangle} badge={results.formattingIssues.length} defaultOpen>
            <ul className="space-y-1.5 pt-1">
              {results.formattingIssues.map((issue, i) => (
                <li key={i} className="text-xs text-slate-700 flex gap-2">
                  <span className="text-red-500 flex-shrink-0">✕</span>{issue}
                </li>
              ))}
            </ul>
          </Collapsible>
        )}

        {/* Missing keywords */}
        {results.missingKeywords && results.missingKeywords.length > 0 && (
          <Collapsible title="Keywords faltando" icon={Search} badge={results.missingKeywords.length} defaultOpen>
            <div className="flex flex-wrap gap-2 pt-1">
              {results.missingKeywords.map((kw, i) => (
                <span key={i} className="px-2 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">{kw}</span>
              ))}
            </div>
          </Collapsible>
        )}

        {/* Strengths & weaknesses */}
        {(results.strengths?.length || results.weaknesses?.length) && (
          <div className="grid grid-cols-2 gap-3">
            {results.strengths && results.strengths.length > 0 && (
              <div className="p-3 bg-green-50 rounded-xl border border-green-200">
                <p className="text-[11px] font-bold text-green-700 uppercase tracking-wide mb-2">Pontos fortes</p>
                <ul className="space-y-1">
                  {results.strengths.map((s, i) => (
                    <li key={i} className="text-[11px] text-slate-700 flex gap-1.5"><span className="text-green-500">✓</span>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {results.weaknesses && results.weaknesses.length > 0 && (
              <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide mb-2">Pontos fracos</p>
                <ul className="space-y-1">
                  {results.weaknesses.map((w, i) => (
                    <li key={i} className="text-[11px] text-slate-700 flex gap-1.5"><span className="text-red-400">✕</span>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Career trajectory */}
        {results.careerTrajectory && (
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide mb-1">Trajetória</p>
            <p className="text-xs text-slate-700 leading-relaxed">{results.careerTrajectory}</p>
          </div>
        )}

        {/* Recruiter profile */}
        {results.recruiterProfile && (
          <Collapsible title="Perfil do Recrutador" icon={Eye}>
            <div className="space-y-3 pt-1">
              <p className="text-xs text-slate-600">{results.recruiterProfile.cultureSignals}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-red-50 rounded-lg border border-red-100">
                  <p className="text-[10px] font-bold text-red-600 mb-1">Teme</p>
                  {results.recruiterProfile.recruiterFears.map((f, i) => <p key={i} className="text-[10px] text-slate-600">• {f}</p>)}
                </div>
                <div className="p-2 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-[10px] font-bold text-green-600 mb-1">Quer ouvir</p>
                  {results.recruiterProfile.recruiterTriggers.map((t, i) => <p key={i} className="text-[10px] text-slate-600">• {t}</p>)}
                </div>
              </div>
              <div className="p-3 bg-rose-50 rounded-lg border-l-4 border-rose-400">
                <p className="text-[10px] font-bold text-rose-700 mb-1">Narrativa ideal</p>
                <p className="text-xs text-slate-700 italic">"{results.recruiterProfile.idealNarrative}"</p>
              </div>
            </div>
          </Collapsible>
        )}
      </div>
    );
  };

  const renderSalary = () => {
    if (!results?.salaryRange) return (
      <div className="text-center py-12 text-slate-400">
        <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Dados salariais disponíveis após a análise</p>
      </div>
    );
    const sr = results.salaryRange;
    const confLabel = sr.confidence === "high" ? "Alta" : sr.confidence === "medium" ? "Média" : "Baixa";
    const confColor = sr.confidence === "high" ? "bg-green-100 text-green-700" : sr.confidence === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500";
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Inteligência Salarial</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confColor}`}>Confiança {confLabel}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wide mb-2">CLT (c/ benefícios)</p>
            <p className="text-lg font-black text-slate-900">
              R$ {sr.cltMin.toLocaleString("pt-BR")}
              <span className="text-slate-400 mx-1 font-normal text-sm">–</span>
              R$ {sr.cltMax.toLocaleString("pt-BR")}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">bruto/mês</p>
          </div>
          <div className="p-4 bg-violet-50 rounded-xl border border-violet-200">
            <p className="text-[11px] font-bold text-violet-600 uppercase tracking-wide mb-2">PJ (s/ benefícios)</p>
            <p className="text-lg font-black text-slate-900">
              R$ {sr.pjMin.toLocaleString("pt-BR")}
              <span className="text-slate-400 mx-1 font-normal text-sm">–</span>
              R$ {sr.pjMax.toLocaleString("pt-BR")}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">bruto/mês</p>
          </div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed p-3 bg-slate-50 rounded-lg">{sr.rationale}</p>
        {results.negotiationTips && results.negotiationTips.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Dicas de negociação</p>
            <ul className="space-y-2">
              {results.negotiationTips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-700">
                  <span className="text-violet-500 font-bold flex-shrink-0">{i + 1}.</span>{tip}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderImprovements = () => {
    if (!results) return null;
    return (
      <div className="space-y-4">
        {/* Changes */}
        {results.changes.length > 0 && (
          <Collapsible title="O que foi alterado" icon={TrendingUp} badge={results.changes.length} defaultOpen>
            <div className="space-y-2 pt-1">
              {results.changes.map((c, i) => {
                const color = c.impact === "alto" ? "border-red-200 bg-red-50" : c.impact === "medio" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50";
                const badge = c.impact === "alto" ? "bg-red-100 text-red-700" : c.impact === "medio" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";
                return (
                  <div key={i} className={`p-3 rounded-lg border ${color}`}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-slate-800">{c.section}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge}`}>
                        {c.impact === "alto" ? "Alto" : c.impact === "medio" ? "Médio" : "Baixo"} impacto
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{c.description}</p>
                  </div>
                );
              })}
            </div>
          </Collapsible>
        )}

        {/* Improved bullets */}
        {results.improvedBullets && results.improvedBullets.length > 0 && (
          <Collapsible title="Bullets reescritos" icon={Edit3} badge={results.improvedBullets.length} defaultOpen>
            <div className="space-y-3 pt-1">
              {results.improvedBullets.map((b, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="p-2 bg-red-50 border border-red-100 rounded-lg">
                    <p className="text-[10px] text-red-500 font-semibold mb-0.5">Antes</p>
                    <p className="text-xs text-slate-600 line-through">{b.original}</p>
                  </div>
                  <div className="p-2 bg-green-50 border border-green-100 rounded-lg">
                    <p className="text-[10px] text-green-600 font-semibold mb-0.5">Depois</p>
                    <p className="text-xs text-slate-800 font-medium">{b.improved}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{b.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {/* Competitive intelligence */}
        {(results.competitiveEdges?.length || results.competitiveRisks?.length) && (
          <Collapsible title="Inteligência Competitiva" icon={Star}>
            <div className="space-y-3 pt-1">
              {results.competitiveEdges && results.competitiveEdges.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-green-700 mb-1.5">Diferenciais</p>
                  {results.competitiveEdges.map((e, i) => (
                    <p key={i} className="text-xs text-slate-700 flex gap-1.5 mb-1"><span className="text-green-500">↑</span>{e}</p>
                  ))}
                </div>
              )}
              {results.competitiveRisks && results.competitiveRisks.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-red-600 mb-1.5">Riscos</p>
                  {results.competitiveRisks.map((r, i) => (
                    <p key={i} className="text-xs text-slate-700 flex gap-1.5 mb-1"><span className="text-red-400">↓</span>{r}</p>
                  ))}
                </div>
              )}
            </div>
          </Collapsible>
        )}

        {/* Recruiter insights */}
        {results.recruiterInsights && results.recruiterInsights.length > 0 && (
          <Collapsible title="Visão do Recrutador" icon={Eye}>
            <ul className="space-y-1.5 pt-1">
              {results.recruiterInsights.map((ins, i) => (
                <li key={i} className="text-xs text-slate-700 flex gap-2">
                  <span className="text-blue-400 flex-shrink-0">›</span>{ins}
                </li>
              ))}
            </ul>
          </Collapsible>
        )}
      </div>
    );
  };

  const renderCV = () => {
    if (!results) return null;
    const currentCV = isEditing ? editedResume : results.optimizedResume;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-900">Currículo Otimizado</p>
          <div className="flex gap-1.5 flex-wrap">
            {!isEditing ? (
              <>
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => { setEditedResume(results.optimizedResume); setIsEditing(true); }}>
                  <Edit3 className="w-3 h-3" />Editar
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => { navigator.clipboard.writeText(results.optimizedResume); toast.success("Copiado!"); }}>
                  <Copy className="w-3 h-3" />Copiar
                </Button>
                <Button size="sm" className="text-xs gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => { generateResumePDF(results.optimizedResume, "pt"); toast.success("PDF gerado!"); }}>
                  <Download className="w-3 h-3" />PDF CV
                </Button>
                {/* ── NOVO: Botão Relatório Cliente ── */}
                <Button size="sm" className="text-xs gap-1 bg-blue-700 hover:bg-blue-800 text-white" onClick={() => {
                  generateClientReport(results, clientName || "Cliente");
                  toast.success("Relatório gerado!");
                }}>
                  <Download className="w-3 h-3" />Relatório
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => translateMutation.mutate({ resumeText: results.optimizedResume, jobContext: jobText })}>
                  {translateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}EN
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" className="text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => { setResults({ ...results, optimizedResume: editedResume }); setIsEditing(false); toast.success("Salvo!"); }}>
                  <Save className="w-3 h-3" />Salvar
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1 text-red-600" onClick={() => setIsEditing(false)}>
                  <X className="w-3 h-3" />Cancelar
                </Button>
              </>
            )}
          </div>
        </div>

        {isEditing ? (
          <textarea value={editedResume} onChange={e => setEditedResume(e.target.value)}
            className="w-full min-h-96 p-4 text-xs font-mono leading-relaxed border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
        ) : (
          <div className="border border-slate-200 rounded-xl p-4 bg-white max-h-[600px] overflow-y-auto">
            <ResumeText text={currentCV} />
          </div>
        )}

        {/* English version */}
        {translatedResume && !isEditing && (
          <div className="space-y-2 border-t border-slate-200 pt-3 mt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600">Versão em Inglês</p>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => { navigator.clipboard.writeText(translatedResume); toast.success("Copiado!"); }}>
                  <Copy className="w-3 h-3" />Copiar EN
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => { generateResumePDF(translatedResume, "en"); }}>
                  <Download className="w-3 h-3" />PDF EN
                </Button>
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 max-h-80 overflow-y-auto">
              <ResumeText text={translatedResume} />
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── SKELETON ──────────────────────────────────────────────────────────────────
  const Skeleton = () => (
    <div className="space-y-3 animate-pulse">
      <div className="flex items-center gap-4 p-4 bg-slate-100 rounded-xl">
        <div className="w-24 h-24 rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-3/4" />
          <div className="h-3 bg-slate-200 rounded w-1/2" />
          <div className="h-3 bg-slate-200 rounded w-2/3" />
        </div>
      </div>
      {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl" />)}
    </div>
  );

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: LayoutPanelLeft },
    { id: "ats", label: "ATS", icon: BarChart2 },
    { id: "salary", label: "Salário", icon: DollarSign },
    { id: "improvements", label: "Melhorias", icon: TrendingUp },
    { id: "cv", label: "CV", icon: FileText },
  ];

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row gap-0 min-h-screen">

      {/* ── LEFT PANEL — Inputs ───────────────────────────────────────────────── */}
      <div className={`lg:w-96 lg:flex-shrink-0 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto border-r ${dk ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className="p-5 space-y-5">
          <div>
            <h2 className={`text-lg font-bold ${dk ? "text-white" : "text-slate-900"}`}>Analisar Currículo</h2>
            <p className={`text-xs mt-0.5 ${dk ? "text-slate-400" : "text-slate-500"}`}>Upload + vaga → análise ATS completa</p>
          </div>

          {/* ── NOVO: Nome do cliente ── */}
          <div>
            <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1.5 ${dk ? "text-slate-400" : "text-slate-500"}`}>
              <User className="w-3 h-3" />Nome do cliente
            </label>
            <input
              type="text"
              placeholder="Ex: Maria Silva"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              className={`w-full text-xs px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                dk
                  ? "bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                  : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400"
              }`}
            />
          </div>

          {/* Saved CV banner */}
          {savedCV && !resumeText && (
            <div className={`p-3 rounded-lg border ${dk ? "bg-slate-800 border-slate-600" : "bg-blue-50 border-blue-200"}`}>
              <p className={`text-xs font-semibold mb-1 ${dk ? "text-white" : "text-slate-900"}`}>Currículo salvo</p>
              <p className={`text-[11px] mb-2 ${dk ? "text-slate-400" : "text-slate-500"}`}>{savedCV.fileName}</p>
              <div className="flex gap-2">
                <Button size="sm" className="text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white flex-1"
                  onClick={() => { setResumeText(savedCV.text); setResumeFile(new File([], savedCV.fileName)); setSavedCV(null); toast.success("Carregado!"); }}>
                  Usar
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7 text-red-600"
                  onClick={() => { clearCV(); setSavedCV(null); }}>
                  Remover
                </Button>
              </div>
            </div>
          )}

          {/* Upload */}
          <div>
            <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${dk ? "text-slate-400" : "text-slate-500"}`}>
              Currículo
            </label>
            <input type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" id="cv-upload" />
            <label htmlFor="cv-upload"
              className={`flex items-center gap-3 p-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                resumeText
                  ? dk ? "border-green-600 bg-green-900/20" : "border-green-300 bg-green-50"
                  : dk ? "border-slate-600 hover:border-blue-500" : "border-slate-300 hover:border-blue-400"
              }`}>
              {isExtracting ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
                : resumeText ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                : <Upload className="w-5 h-5 text-slate-400 flex-shrink-0" />}
              <div className="min-w-0">
                <p className={`text-xs font-medium truncate ${dk ? "text-slate-300" : "text-slate-700"}`}>
                  {isExtracting ? "Processando..." : resumeFile ? resumeFile.name : "PDF, DOCX ou TXT"}
                </p>
                {!resumeText && <p className={`text-[10px] ${dk ? "text-slate-500" : "text-slate-400"}`}>Clique para selecionar</p>}
              </div>
            </label>
          </div>

          {/* Job input */}
          <div>
            <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${dk ? "text-slate-400" : "text-slate-500"}`}>
              Vaga
            </label>
            <div className="relative">
              <Textarea
                placeholder="Cole o link da vaga (Gupy, LinkedIn, etc.) ou a descrição completa"
                value={jobInput}
                onChange={e => setJobInput(e.target.value)}
                className={`min-h-28 text-xs pr-8 ${dk ? "bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" : "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400"}`}
              />
              {jobInput && (
                <button onClick={() => { setJobInput(""); setFetchedJobText(""); setJobFetchState("idle"); }}
                  className="absolute top-2 right-2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* URL fetch status */}
            {jobFetchState === "loading" && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-blue-600">
                <Loader2 className="w-3 h-3 animate-spin" />Buscando vaga...
              </div>
            )}
            {jobFetchState === "success" && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-green-600">
                <CheckCircle className="w-3 h-3" />Vaga importada ({fetchedJobText.length} chars)
              </div>
            )}
            {jobFetchState === "warn" && (
              <div className="flex items-start gap-1.5 mt-1.5 text-xs text-amber-600">
                <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                <span>LinkedIn bloqueado. Cole a descrição da vaga acima.</span>
              </div>
            )}
            {jobInput.trim().startsWith("http") && jobInput.trim().includes("linkedin.com") && jobFetchState === "idle" && (
              <div className="flex items-start gap-1.5 mt-1.5 text-xs text-amber-600">
                <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                <span>LinkedIn: copie o texto da vaga e cole aqui.</span>
              </div>
            )}
          </div>

          {/* Analyze button */}
          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !resumeText || !jobText.trim()}
            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-semibold py-3 rounded-xl"
          >
            {isAnalyzing ? (
              <span className="flex items-center gap-2 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />Analisando...
              </span>
            ) : "Analisar Vaga"}
          </Button>

          {/* Progress bar */}
          {isAnalyzing && (
            <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          )}

          {results && !isAnalyzing && (
            <Button variant="outline" className="w-full text-xs gap-2" onClick={() => {
              setJobInput(""); setFetchedJobText(""); setJobFetchState("idle");
              setResults(null); setTranslatedResume(null); setJobListings([]);
            }}>
              <RefreshCw className="w-3 h-3" />Nova análise
            </Button>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL — Results ─────────────────────────────────────────────── */}
      <div ref={resultsPanelRef} className={`flex-1 ${dk ? "bg-slate-900" : "bg-slate-50"}`}>
        {!results && !isAnalyzing && (
          <div className={`flex flex-col items-center justify-center h-full min-h-96 text-center p-8 ${dk ? "text-slate-400" : "text-slate-400"}`}>
            <LayoutPanelLeft className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-semibold text-lg">Resultados aparecem aqui</p>
            <p className="text-sm mt-1 opacity-70">Faça upload do seu currículo e cole uma vaga para começar</p>
          </div>
        )}

        {isAnalyzing && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <div>
                <p className="font-semibold text-blue-900 text-sm">Analisando com IA...</p>
                <p className="text-xs text-blue-600 mt-0.5">Motor ATS + 4 camadas de inteligência</p>
              </div>
            </div>
            <Skeleton />
          </div>
        )}

        {results && !isAnalyzing && (
          <div className="flex flex-col h-full">
            {/* Sticky tabs */}
            <div className={`sticky top-16 z-30 border-b ${dk ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"} shadow-sm`}>
              <div className="flex overflow-x-auto">
                {TABS.map(tab => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-all ${
                        active
                          ? "border-blue-600 text-blue-700 bg-blue-50/50"
                          : dk ? "border-transparent text-slate-400 hover:text-slate-200" : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}>
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 p-5 overflow-y-auto">
              {activeTab === "overview" && renderOverview()}
              {activeTab === "ats" && renderATS()}
              {activeTab === "salary" && renderSalary()}
              {activeTab === "improvements" && renderImprovements()}
              {activeTab === "cv" && renderCV()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
