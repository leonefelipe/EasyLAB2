import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload, Zap, CheckCircle, Copy, Download, Loader2, FileText,
  TrendingUp, ArrowUpRight, History, Globe, Plus, Trash2,
  ChevronRight, RefreshCw, AlertTriangle, BookOpen, Info,
  Languages, LayoutTemplate, User, Briefcase, GraduationCap,
  Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { extractTextFromFile } from "@/lib/fileExtractor";
import { generateResumePDF } from "@/lib/pdfGenerator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Edit3, Save, X, ExternalLink, MapPin, Building2, Search } from "lucide-react";

interface JobListing {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  description: string;
  matchReason: string;
  applicantCount?: number;
  numVacancies?: number;
  publishedAt?: string;
  expiresAt?: string;
  workType?: string;
  isReal?: boolean;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ImprovedBullet {
  original: string;
  improved: string;
  reason: string;
}

interface AtsScoreBreakdown {
  parsing: number;
  keywordMatch: number;
  experienceQuality: number;
  impactMetrics: number;
  formatting: number;
  skillsAlignment: number;
}

interface AnalysisResult {
  matchScore: number;
  projectedMatchScore: number;
  keywords: string[];
  suggestions: string[];
  optimizedResume: string;
  changes: Array<{ section: string; description: string; impact: "alto" | "medio" | "baixo" }>;
  jobTitle?: string;
  jobArea?: string;
  scrapedJob?: boolean;
  scoreBreakdown: { technicalSkills: number; experience: number; keywords: number; tools: number; seniority: number };
  coverLetterPoints?: string[];
  gapAnalysis?: string[];
  // Elite ATS fields
  atsScore?: number;
  atsScoreBreakdown?: AtsScoreBreakdown;
  strengths?: string[];
  weaknesses?: string[];
  missingKeywords?: string[];
  improvedBullets?: ImprovedBullet[];
  recruiterInsights?: string[];
  seniorityLevel?: string;
  careerTrajectory?: string;
  formattingIssues?: string[];
  // NEW: Competitive Intelligence
  competitiveEdges?: string[];
  competitiveRisks?: string[];
  // NEW: Salary Intelligence
  salaryRange?: {
    cltMin: number; cltMax: number;
    pjMin: number; pjMax: number;
    currency: string;
    confidence: "high" | "medium" | "low";
    rationale: string;
  };
  negotiationTips?: string[];
  // NEW: Recruiter Profile
  recruiterProfile?: {
    companyType: string;
    cultureSignals: string;
    recruiterFears: string[];
    recruiterTriggers: string[];
    idealNarrative: string;
  };
}

interface SavedCV {
  text: string;
  fileName: string;
  savedAt: string;
}

interface HistoryItem {
  id: string;
  jobTitle: string;
  jobArea: string;
  matchScore: number;
  projectedMatchScore: number;
  date: string;
  result: AnalysisResult;
  resumeText: string;
}

// ─── Wizard Types ────────────────────────────────────────────────────────────

interface WizardData {
  name: string; title: string; city: string; phone: string; email: string; linkedin: string;
  summary: string;
  experiences: Array<{ role: string; company: string; period: string; description: string }>;
  education: Array<{ course: string; institution: string; year: string }>;
  skills: string; languages: string; certifications: string;
}

// ─── localStorage helpers ────────────────────────────────────────────────────

const LS_CV_KEY = "easyjobai_saved_cv";
const LS_HISTORY_KEY = "easyjobai_history";

function loadSavedCV(): SavedCV | null {
  try { return JSON.parse(localStorage.getItem(LS_CV_KEY) || "null"); } catch { return null; }
}
function saveCV(cv: SavedCV) { localStorage.setItem(LS_CV_KEY, JSON.stringify(cv)); }
function clearCV() { localStorage.removeItem(LS_CV_KEY); }

function loadHistory(): HistoryItem[] {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveHistory(items: HistoryItem[]) { localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(items.slice(0, 10))); }
function addToHistory(item: HistoryItem) {
  const history = loadHistory();
  saveHistory([item, ...history.filter(h => h.id !== item.id)]);
}

// ─── ResumeRenderer ──────────────────────────────────────────────────────────

function ResumeRenderer({ text }: { text: string }) {
  if (!text) return null;
  const normalized = text.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  // Find the first 3 non-empty lines — they form the header block (name / title / contact)
  const nonEmptyIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) nonEmptyIndices.push(i);
    if (nonEmptyIndices.length === 3) break;
  }
  const headerSet = new Set(nonEmptyIndices);

  const isSectionTitle = (line: string) => {
    const t = line.trim();
    if (t.length < 4) return false;
    const alpha = t.replace(/[^a-zA-ZÀ-ÿ]/g, "");
    if (!alpha.length) return false;
    const upper = t.replace(/[^A-ZÀ-ÖØ-Þ]/g, "");
    return upper.length / alpha.length >= 0.7;
  };
  const isBullet = (line: string) => /^[•\-\*\u2022\u2023\u25E6\u2043]/.test(line.trim());

  const elements: React.ReactNode[] = [];
  let key = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; const t = line.trim();
    if (!t) { elements.push(<div key={key++} className="h-3" />); continue; }

    // Header block: name (idx 0), title (idx 1), contact (idx 2)
    if (headerSet.has(i)) {
      const headerPos = nonEmptyIndices.indexOf(i);
      if (headerPos === 0) {
        elements.push(<h1 key={key++} className="text-2xl font-bold text-slate-900 tracking-tight">{t}</h1>);
      } else if (headerPos === 1) {
        elements.push(<p key={key++} className="text-base font-semibold text-blue-900 mt-0.5">{t}</p>);
      } else {
        // Contact line — split by | and render as inline tags
        const parts = t.split("|").map(p => p.trim()).filter(Boolean);
        elements.push(
          <p key={key++} className="text-xs text-slate-500 mt-1 mb-4 flex flex-wrap gap-x-3 gap-y-1">
            {parts.map((part, pi) => (
              <span key={pi} className="flex items-center gap-1">
                {pi > 0 && <span className="text-slate-300">|</span>}
                {part}
              </span>
            ))}
          </p>
        );
      }
      continue;
    }

    if (isSectionTitle(t)) { elements.push(<div key={key++} className="mt-5 mb-2"><h2 className="text-xs font-bold text-blue-900 uppercase tracking-widest border-b border-blue-200 pb-1">{t}</h2></div>); continue; }
    if (isBullet(t)) { elements.push(<div key={key++} className="flex gap-2 items-start ml-2 my-0.5"><span className="text-blue-600 mt-1 flex-shrink-0 text-xs">•</span><span className="text-slate-700 text-sm leading-relaxed">{t.replace(/^[•\-\*\u2023\u25E6\u2043]\s*/, "")}</span></div>); continue; }
    const isJobLine = /[|\u2014\u2013]/.test(t) || /\(\d{4}/.test(t);
    elements.push(isJobLine
      ? <p key={key++} className="text-sm font-semibold text-slate-800 mt-2 mb-0.5">{t}</p>
      : <p key={key++} className="text-sm text-slate-700 leading-relaxed my-0.5">{t}</p>
    );
  }
  return <div className="font-sans">{elements}</div>;
}

// ─── DiffViewer ──────────────────────────────────────────────────────────────

function DiffViewer({ original, optimized }: { original: string; optimized: string }) {
  const normalize = (t: string) => t.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const origLines = normalize(original).split("\n");
  const optLines = normalize(optimized).split("\n");
  const maxLen = Math.max(origLines.length, optLines.length);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Original</p>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-[500px] overflow-y-auto text-sm font-mono space-y-0.5">
          {origLines.map((line, i) => {
            const changed = line.trim() !== (optLines[i] || "").trim();
            return <div key={i} className={`px-1 rounded ${changed ? "bg-red-100 text-red-800 line-through" : "text-slate-700"}`}>{line || "\u00A0"}</div>;
          })}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Otimizado</p>
        <div className="bg-white border border-slate-200 rounded-lg p-4 max-h-[500px] overflow-y-auto text-sm font-mono space-y-0.5">
          {optLines.map((line, i) => {
            const changed = line.trim() !== (origLines[i] || "").trim();
            return <div key={i} className={`px-1 rounded ${changed ? "bg-green-100 text-green-800" : "text-slate-700"}`}>{line || "\u00A0"}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

function CVWizard({ onComplete }: { onComplete: (text: string, fileName: string) => void; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    name: "", title: "", city: "", phone: "", email: "", linkedin: "",
    summary: "",
    experiences: [{ role: "", company: "", period: "", description: "" }],
    education: [{ course: "", institution: "", year: "" }],
    skills: "", languages: "", certifications: "",
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const generateCVMutation = trpc.resume.generateFromScratch.useMutation({
    onSuccess: (data: { generatedResume: string }) => {
      onComplete(data.generatedResume, "curriculo-criado-ia.txt");
      toast.success("Currículo criado com sucesso!");
    },
    onError: (err: { message: string }) => {
      toast.error("Erro ao gerar currículo: " + err.message);
      setIsGenerating(false);
    },
  });

  const update = (field: keyof WizardData, value: unknown) => setData(d => ({ ...d, [field]: value }));

  const handleGenerate = () => {
    setIsGenerating(true);
    generateCVMutation.mutate({ wizardData: data });
  };

  const steps = [
    { icon: User, label: "Dados Pessoais" },
    { icon: BookOpen, label: "Resumo" },
    { icon: Briefcase, label: "Experiências" },
    { icon: GraduationCap, label: "Formação" },
    { icon: Eye, label: "Revisão" },
  ];

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const active = i + 1 === step;
          const done = i + 1 < step;
          return (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${active ? "bg-blue-900 text-white" : done ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}>
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && <div className={`h-0.5 flex-1 ${done ? "bg-green-300" : "bg-slate-200"}`} />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Dados Pessoais */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Dados Pessoais</h3>
          {[
            { label: "Nome completo *", field: "name" as const, placeholder: "Ex: Felipe Leone" },
            { label: "Cargo/Título profissional *", field: "title" as const, placeholder: "Ex: Executivo Comercial B2B | Headhunter" },
            { label: "Cidade, Estado", field: "city" as const, placeholder: "Ex: São Paulo, SP – Brasil" },
            { label: "Telefone", field: "phone" as const, placeholder: "Ex: +55 11 99446-5011" },
            { label: "E-mail", field: "email" as const, placeholder: "Ex: nome@email.com" },
            { label: "LinkedIn (opcional)", field: "linkedin" as const, placeholder: "Ex: linkedin.com/in/seu-perfil" },
          ].map(f => (
            <div key={f.field}>
              <label className="text-sm font-medium text-slate-700 block mb-1">{f.label}</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                placeholder={f.placeholder}
                value={data[f.field]}
                onChange={e => update(f.field, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Step 2: Resumo */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Resumo Profissional</h3>
          <p className="text-sm text-slate-500">Descreva sua trajetória em 2-3 frases. A IA vai transformar em um Resumo Profissional otimizado para ATS.</p>
          <Textarea
            placeholder="Ex: Tenho 18 anos de experiência em vendas B2B e recrutamento. Trabalhei em empresas de tecnologia e serviços financeiros. Sou especialista em Salesforce e LinkedIn Recruiter."
            value={data.summary}
            onChange={e => update("summary", e.target.value)}
            className="min-h-32"
          />
        </div>
      )}

      {/* Step 3: Experiências */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Experiências Profissionais</h3>
          {data.experiences.map((exp, i) => (
            <Card key={i} className="p-4 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Experiência {i + 1}</span>
                {i > 0 && (
                  <button onClick={() => update("experiences", data.experiences.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {[
                { label: "Cargo *", field: "role", placeholder: "Ex: Executivo de Desenvolvimento de Negócios" },
                { label: "Empresa *", field: "company", placeholder: "Ex: Robert Half" },
                { label: "Período *", field: "period", placeholder: "Ex: Out/2023 – Atual" },
              ].map(f => (
                <div key={f.field}>
                  <label className="text-xs font-medium text-slate-600 block mb-1">{f.label}</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder={f.placeholder}
                    value={exp[f.field as keyof typeof exp]}
                    onChange={e => {
                      const exps = [...data.experiences];
                      exps[i] = { ...exps[i], [f.field]: e.target.value };
                      update("experiences", exps);
                    }}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Descrição (informal) *</label>
                <Textarea
                  placeholder="Ex: Fazia prospecção de clientes, gerenciava o CRM, liderava reuniões com diretores. Bati 120% da meta em 2024."
                  value={exp.description}
                  onChange={e => {
                    const exps = [...data.experiences];
                    exps[i] = { ...exps[i], description: e.target.value };
                    update("experiences", exps);
                  }}
                  className="min-h-20 text-sm"
                />
              </div>
            </Card>
          ))}
          <Button variant="outline" onClick={() => update("experiences", [...data.experiences, { role: "", company: "", period: "", description: "" }])} className="w-full border-dashed">
            <Plus className="w-4 h-4 mr-2" /> Adicionar outra experiência
          </Button>
        </div>
      )}

      {/* Step 4: Formação */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Formação e Competências</h3>
          {data.education.map((edu, i) => (
            <Card key={i} className="p-4 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Formação {i + 1}</span>
                {i > 0 && <button onClick={() => update("education", data.education.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
              </div>
              {[
                { label: "Curso", field: "course", placeholder: "Ex: Administração de Empresas" },
                { label: "Instituição", field: "institution", placeholder: "Ex: FGV" },
                { label: "Ano de conclusão", field: "year", placeholder: "Ex: 2008" },
              ].map(f => (
                <div key={f.field}>
                  <label className="text-xs font-medium text-slate-600 block mb-1">{f.label}</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder={f.placeholder}
                    value={edu[f.field as keyof typeof edu]}
                    onChange={e => {
                      const edus = [...data.education];
                      edus[i] = { ...edus[i], [f.field]: e.target.value };
                      update("education", edus);
                    }}
                  />
                </div>
              ))}
            </Card>
          ))}
          <Button variant="outline" onClick={() => update("education", [...data.education, { course: "", institution: "", year: "" }])} className="w-full border-dashed">
            <Plus className="w-4 h-4 mr-2" /> Adicionar formação
          </Button>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Habilidades técnicas</label>
            <Textarea placeholder="Ex: Salesforce, HubSpot, LinkedIn Recruiter, SPIN Selling, BANT, MEDDIC, CRM, Pipeline Management" value={data.skills} onChange={e => update("skills", e.target.value)} className="min-h-20 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Idiomas</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" placeholder="Ex: Inglês Avançado, Espanhol Intermediário" value={data.languages} onChange={e => update("languages", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Certificações (opcional)</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" placeholder="Ex: Salesforce Certified Sales Cloud, HubSpot Sales" value={data.certifications} onChange={e => update("certifications", e.target.value)} />
          </div>
        </div>
      )}

      {/* Step 5: Revisão */}
      {step === 5 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Revisão e Geração</h3>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-sm">
            <p><span className="font-semibold">Nome:</span> {data.name || "—"}</p>
            <p><span className="font-semibold">Cargo:</span> {data.title || "—"}</p>
            <p><span className="font-semibold">Experiências:</span> {data.experiences.filter(e => e.role).length} cadastradas</p>
            <p><span className="font-semibold">Formação:</span> {data.education.filter(e => e.course).length} cadastradas</p>
            <p><span className="font-semibold">Idiomas:</span> {data.languages || "—"}</p>
          </div>
          <p className="text-sm text-slate-500">A IA vai transformar suas informações em um currículo profissional otimizado para ATS, usando apenas os dados que você forneceu.</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        {step > 1 && (
          <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1">
            Voltar
          </Button>
        )}
        {step < 5 ? (
          <Button onClick={() => setStep(s => s + 1)} className="flex-1 bg-blue-900 hover:bg-blue-800 text-white" disabled={step === 1 && (!data.name || !data.title)}>
            Próximo <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleGenerate} disabled={isGenerating} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
            {isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando com IA...</> : <><Zap className="w-4 h-4 mr-2" /> Gerar CV Profissional</>}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Home() {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState<string>("");
  const [jobUrl, setJobUrl] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<"optimized" | "comparison" | "english">("optimized");
  const [translatedResume, setTranslatedResume] = useState<string | null>(null);
  const [savedCV, setSavedCV] = useState<SavedCV | null>(null);
  const [showSavedCVPrompt, setShowSavedCVPrompt] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  // Edição do currículo otimizado
  const [isEditingResume, setIsEditingResume] = useState(false);
  const [editedResume, setEditedResume] = useState<string>("");
  const [originalAIResume, setOriginalAIResume] = useState<string>(""); // CV da sessão de edição atual
  const [initialAIResume, setInitialAIResume] = useState<string>(""); // Cópia imutável do CV gerado pela IA
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Vagas aderentes
  const [jobListings, setJobListings] = useState<JobListing[]>([]);
  const [isSearchingJobs, setIsSearchingJobs] = useState(false);

  // Load saved state on mount
  useEffect(() => {
    const cv = loadSavedCV();
    if (cv) { setSavedCV(cv); setShowSavedCVPrompt(true); }
    setHistory(loadHistory());
    const dark = localStorage.getItem("easyjobai_dark") === "true";
    setIsDarkMode(dark);
    if (dark) document.documentElement.classList.add("dark");
  }, []);

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem("easyjobai_dark", String(next));
    document.documentElement.classList.toggle("dark", next);
  };

  // Confetti trigger
  useEffect(() => {
    if (results && results.projectedMatchScore > 80) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3500);
    }
  }, [results]);

  // tRPC mutations
  const analyzeResumeMutation = trpc.resume.analyze.useMutation({
    onSuccess: (data: AnalysisResult) => {
      setResults(data);
      setInitialAIResume(data.optimizedResume); // salva cópia imutável do CV gerado pela IA
      setActiveTab("optimized");
      setTranslatedResume(null);
      toast.success("Análise concluída com sucesso!");
      const item: HistoryItem = {
        id: Date.now().toString(),
        jobTitle: data.jobTitle || "Vaga sem título",
        jobArea: data.jobArea || "Área desconhecida",
        matchScore: data.matchScore,
        projectedMatchScore: data.projectedMatchScore,
        date: new Date().toLocaleString("pt-BR"),
        result: data,
        resumeText,
      };
      addToHistory(item);
      setHistory(loadHistory());
    },
    onError: (err: { message: string }) => toast.error("Erro ao analisar: " + err.message),
  });

  const translateMutation = trpc.translate.toEnglish.useMutation({
    onSuccess: (data: { translatedResume: string }) => {
      setTranslatedResume(data.translatedResume);
      setActiveTab("english");
      toast.success("CV traduzido para inglês com sucesso!");
    },
    onError: (err: { message: string }) => toast.error("Erro ao traduzir: " + err.message),
  });

  const searchJobsMutation = trpc.jobs.search.useMutation({
    onSuccess: (data: { jobs: JobListing[]; totalFound: number; realJobsFound?: number }) => {
      setJobListings(data.jobs);
      setIsSearchingJobs(false);
      if (data.jobs.length === 0) {
        toast.info("Nenhuma vaga encontrada. Tente novamente em instantes.");
      } else {
        const real = data.realJobsFound ?? 0;
        toast.success(real > 0
          ? `${data.jobs.length} vagas encontradas — ${real} vagas reais da Gupy/Vagas.com.br`
          : `${data.jobs.length} vagas encontradas`);
      }
    },
    onError: () => {
      setIsSearchingJobs(false);
      toast.error("Erro ao buscar vagas. Tente novamente.");
    },
  });

  // Handlers
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setIsExtracting(true);
    toast.loading("Processando currículo...", { id: "extract" });
    try {
      const text = await extractTextFromFile(file);
      setResumeText(text);
      const cv: SavedCV = { text, fileName: file.name, savedAt: new Date().toLocaleString("pt-BR") };
      saveCV(cv);
      setSavedCV(cv);
      setShowSavedCVPrompt(false);
      toast.success("Currículo carregado e salvo localmente!", { id: "extract" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar arquivo", { id: "extract" });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleUseSavedCV = () => {
    if (savedCV) {
      setResumeText(savedCV.text);
      setResumeFile(new File([], savedCV.fileName));
      setShowSavedCVPrompt(false);
      toast.success("Currículo salvo carregado!");
    }
  };

  const handleClearSavedCV = () => {
    clearCV(); setSavedCV(null); setShowSavedCVPrompt(false);
    setResumeText(""); setResumeFile(null);
    toast.info("Currículo removido. Faça um novo upload.");
  };

  const handleAnalyzeJob = () => {
    if (!resumeText) { toast.error("Por favor, faça upload do seu currículo primeiro"); return; }
    if (!jobUrl.trim()) { toast.error("Por favor, cole o link ou a descrição da vaga"); return; }
    analyzeResumeMutation.mutate({ resumeText, jobUrl: jobUrl.trim() });
  };

  const handleAnalyzeAnotherJob = () => {
    setJobUrl(""); setResults(null); setTranslatedResume(null);
    toast.info("Campo de vaga limpo. Seu currículo permanece carregado.");
  };

  const handleTranslate = () => {
    if (!results?.optimizedResume) return;
    translateMutation.mutate({ resumeText: results.optimizedResume, jobContext: jobUrl });
  };

  const handleDownloadPDF = (lang: "pt" | "en") => {
    const text = lang === "en" ? translatedResume : (isEditingResume ? editedResume : results?.optimizedResume);
    if (!text) return;
    try {
      generateResumePDF(text, lang);
      toast.success("PDF profissional gerado com sucesso!");
    } catch {
      toast.error("Erro ao gerar PDF. Tente novamente.");
    }
  };

  const handleStartEdit = () => {
    const currentResume = results?.optimizedResume || "";
    setEditedResume(currentResume);
    setOriginalAIResume(currentResume); // guarda o original da IA
    setHasUnsavedChanges(false);
    setIsEditingResume(true);
  };

  const handleEditChange = (value: string) => {
    setEditedResume(value);
    setHasUnsavedChanges(value !== originalAIResume);
  };

  const handleSaveEdit = () => {
    if (results) {
      setResults({ ...results, optimizedResume: editedResume });
    }
    setHasUnsavedChanges(false);
    setIsEditingResume(false);
    toast.success("Currículo atualizado com sucesso!");
  };

  const handleCancelEdit = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm("Você tem alterações não salvas. Deseja descartar?")) return;
    }
    setIsEditingResume(false);
    setEditedResume("");
    setHasUnsavedChanges(false);
  };

  const handleRestoreOriginal = () => {
    const restoreTarget = initialAIResume || originalAIResume;
    if (!restoreTarget) return;
    if (!window.confirm("Restaurar o currículo gerado pela IA? Suas edições serão perdidas.")) return;
    setEditedResume(restoreTarget);
    setHasUnsavedChanges(restoreTarget !== originalAIResume);
    toast.success("Currículo restaurado para a versão original da IA.");
  };

  const handleSearchJobs = () => {
    if (!results) return;
    setIsSearchingJobs(true);
    searchJobsMutation.mutate({
      jobTitle: results.jobTitle || "Profissional",
      jobArea: results.jobArea || "Geral",
      keywords: results.keywords || [],
      location: "Brasil",
      seniorityLevel: results.seniorityLevel || "Pleno",
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  const handleWizardComplete = useCallback((text: string, fileName: string) => {
    setResumeText(text);
    setResumeFile(new File([], fileName));
    const cv: SavedCV = { text, fileName, savedAt: new Date().toLocaleString("pt-BR") };
    saveCV(cv); setSavedCV(cv);
    setShowWizard(false);
    toast.success("Currículo criado! Agora cole o link de uma vaga para analisar.");
  }, []);

  const isAnalyzing = analyzeResumeMutation.isPending;
  const isTranslating = translateMutation.isPending;
  const isGeneratingPDF = false; // PDF agora é gerado localmente

  const scoreBreakdownTooltips: Record<string, string> = {
    "Habilidades técnicas": "Mede quantas das habilidades técnicas exigidas na vaga estão presentes no seu currículo (máx. 30 pts)",
    "Experiência profissional": "Avalia se sua experiência profissional é relevante para a função descrita na vaga (máx. 30 pts)",
    "Palavras-chave": "Conta quantas palavras-chave da vaga aparecem literalmente no seu currículo (máx. 20 pts)",
    "Ferramentas citadas": "Verifica se as ferramentas e softwares pedidos na vaga estão no seu currículo (máx. 10 pts)",
    "Senioridade": "Compatibilidade entre seu nível de senioridade e o exigido pela vaga (máx. 10 pts)",
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? "dark bg-slate-900" : "bg-white"}`}>
      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-sm animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 20}%`,
                backgroundColor: ["#1e3a8a", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"][i % 5],
                animationDuration: `${0.8 + Math.random() * 1.5}s`,
                animationDelay: `${Math.random() * 0.5}s`,
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-sm ${isDarkMode ? "bg-slate-900/90 border-slate-700" : "bg-white/90 border-slate-200"}`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-900" />
            <span className={`font-bold text-lg ${isDarkMode ? "text-white" : "text-slate-900"}`}>Easy Job AI</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isDarkMode ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Histórico</span>
              {history.length > 0 && <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{history.length}</span>}
            </button>
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-lg transition-colors ${isDarkMode ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {isDarkMode ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* History Panel */}
      {showHistory && (
        <div className={`border-b ${isDarkMode ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-bold text-sm ${isDarkMode ? "text-white" : "text-slate-900"}`}>Análises Recentes</h3>
              {history.length > 0 && (
                <button onClick={() => { saveHistory([]); setHistory([]); toast.info("Histórico limpo."); }} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Limpar
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className={`text-sm ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Nenhuma análise salva ainda.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {history.map(item => (
                  <button
                    key={item.id}
                    onClick={() => { setResults(item.result); setResumeText(item.resumeText); setActiveTab("optimized"); setShowHistory(false); toast.success("Análise carregada!"); }}
                    className={`text-left p-3 rounded-lg border transition-all hover:border-blue-400 ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200"}`}
                  >
                    <p className={`text-sm font-semibold truncate ${isDarkMode ? "text-white" : "text-slate-900"}`}>{item.jobTitle}</p>
                    <p className={`text-xs mt-0.5 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>{item.jobArea} • {item.date}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs font-bold ${item.matchScore >= 70 ? "text-green-600" : item.matchScore >= 50 ? "text-amber-600" : "text-red-600"}`}>{item.matchScore}%</span>
                      <ArrowUpRight className="w-3 h-3 text-blue-500" />
                      <span className={`text-xs font-bold ${item.projectedMatchScore >= 70 ? "text-green-600" : item.projectedMatchScore >= 50 ? "text-amber-600" : "text-red-600"}`}>{item.projectedMatchScore}%</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hero */}
      <section
        className="relative py-16 px-4 overflow-hidden"
        style={{ backgroundImage: `url('https://d2xsxph8kpxj0f.cloudfront.net/310419663031375231/UygdwGGBceU5M9aiswe96z/hero-background-9G5axcDwGPVBWzbsnhPDbk.webp')`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className={`absolute inset-0 ${isDarkMode ? "bg-slate-900/90" : "bg-white/85"}`} />
        <div className="relative max-w-3xl mx-auto text-center">
          <h1 className={`text-5xl font-bold mb-4 ${isDarkMode ? "text-white" : "text-slate-900"}`}>Easy Job AI</h1>
          <p className={`text-xl ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>Otimize seu currículo para qualquer vaga</p>
          <p className={`text-sm mt-3 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Análise ATS real com IA especializada em recolocação profissional</p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">

        {/* Wizard CTA */}
        {!showWizard && !resumeText && (
          <div className={`flex flex-col sm:flex-row items-center gap-4 p-5 rounded-xl border-2 border-dashed ${isDarkMode ? "border-slate-600 bg-slate-800" : "border-slate-300 bg-slate-50"}`}>
            <div className="flex-1 text-center sm:text-left">
              <p className={`font-semibold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Não tem currículo?</p>
              <p className={`text-sm mt-0.5 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Crie um do zero em 5 etapas com ajuda da IA</p>
            </div>
            <Button onClick={() => setShowWizard(true)} variant="outline" className="flex items-center gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 flex-shrink-0">
              <LayoutTemplate className="w-4 h-4" /> Criar CV do Zero
            </Button>
          </div>
        )}

        {/* Wizard */}
        {showWizard && (
          <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-blue-200"}`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Criar CV do Zero</h2>
              <button onClick={() => setShowWizard(false)} className="text-slate-400 hover:text-slate-600 text-sm">Cancelar</button>
            </div>
            <CVWizard onComplete={handleWizardComplete} onClose={() => setShowWizard(false)} />
          </Card>
        )}

        {/* Saved CV Prompt */}
        {showSavedCVPrompt && savedCV && !resumeText && (
          <Card className={`p-5 border-2 border-blue-200 ${isDarkMode ? "bg-slate-800" : "bg-blue-50"}`}>
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className={`font-semibold text-sm ${isDarkMode ? "text-white" : "text-slate-900"}`}>Currículo salvo encontrado</p>
                <p className={`text-xs mt-0.5 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>{savedCV.fileName} • Salvo em {savedCV.savedAt}</p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={handleUseSavedCV} className="bg-blue-900 hover:bg-blue-800 text-white text-xs">Usar este currículo</Button>
                  <Button size="sm" variant="outline" onClick={handleClearSavedCV} className="text-xs text-red-600 border-red-200 hover:bg-red-50">Fazer novo upload</Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Upload */}
        <Card className={`p-8 border-2 transition-colors ${isDarkMode ? "bg-slate-800 border-slate-700 hover:border-blue-600" : "border-slate-200 hover:border-blue-300"}`}>
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Upload className="w-6 h-6 text-blue-900" />
            </div>
            <div>
              <h2 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Upload do Currículo</h2>
              <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Formatos aceitos: PDF, DOCX, TXT</p>
            </div>
          </div>
          <input type="file" accept=".pdf,.docx,.txt" onChange={handleResumeUpload} className="hidden" id="resume-upload" />
          <label htmlFor="resume-upload" className={`block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${isDarkMode ? "border-slate-600 hover:border-blue-500 hover:bg-slate-700" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/30"}`}>
            <div className="flex flex-col items-center gap-2">
              {isExtracting ? <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                : resumeFile ? <FileText className="w-8 h-8 text-green-500" />
                : <Upload className="w-8 h-8 text-slate-400" />}
              <p className={`font-medium ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                {isExtracting ? "Processando..." : resumeFile ? resumeFile.name : "Clique para selecionar ou arraste seu currículo"}
              </p>
              <p className={`text-xs ${isDarkMode ? "text-slate-500" : "text-slate-500"}`}>Tamanho máximo: 10MB</p>
            </div>
          </label>
          {resumeText && !isExtracting && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800">Currículo carregado e salvo localmente</p>
            </div>
          )}
        </Card>

        {/* Job URL */}
        <Card className={`p-8 border-2 transition-colors ${isDarkMode ? "bg-slate-800 border-slate-700 hover:border-blue-600" : "border-slate-200 hover:border-blue-300"}`}>
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Zap className="w-6 h-6 text-blue-900" />
            </div>
            <div>
              <h2 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Link ou Descrição da Vaga</h2>
              <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Cole o link (Gupy, Vagas.com, etc.) ou a descrição completa. Links do LinkedIn: cole o texto da vaga diretamente.</p>
            </div>
          </div>
          <Textarea
            placeholder="Cole aqui o link da vaga (ex: https://www.linkedin.com/jobs/...) ou a descrição completa da vaga"
            value={jobUrl}
            onChange={e => setJobUrl(e.target.value)}
            className={`min-h-28 ${isDarkMode ? "bg-slate-700 border-slate-600 text-white placeholder:text-slate-400" : "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400"}`}
          />
          {/* LinkedIn warning */}
          {(() => {
            try {
              const u = new URL(jobUrl.trim());
              if (u.hostname.includes("linkedin.com")) {
                return (
                  <div className="flex items-start gap-3 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>LinkedIn não permite leitura automática.</strong> Para uma análise precisa, abra a vaga, selecione toda a descrição e cole o texto aqui no lugar do link.
                    </span>
                  </div>
                );
              }
            } catch { /* not a URL */ }
            return null;
          })()}
          <div className="flex gap-3 mt-6">
            <Button
              onClick={handleAnalyzeJob}
              disabled={isAnalyzing || !resumeText || !jobUrl.trim()}
              className="flex-1 bg-blue-900 hover:bg-blue-800 text-white font-semibold py-3 rounded-lg transition-all duration-300"
            >
              {isAnalyzing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analisando com IA...</span>
                </div>
              ) : "Analisar Vaga"}
            </Button>
            {results && (
              <Button onClick={handleAnalyzeAnotherJob} variant="outline" className="flex items-center gap-2 flex-shrink-0">
                <RefreshCw className="w-4 h-4" /> Outra vaga
              </Button>
            )}
          </div>
        </Card>

        {/* Skeleton Loader */}
        {isAnalyzing && (
          <div className="space-y-6 animate-pulse">
            {[1, 2, 3].map(i => (
              <Card key={i} className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-slate-200"}`}>
                <div className={`h-6 rounded-lg mb-4 w-1/3 ${isDarkMode ? "bg-slate-700" : "bg-slate-200"}`} />
                <div className="space-y-3">
                  <div className={`h-4 rounded w-full ${isDarkMode ? "bg-slate-700" : "bg-slate-200"}`} />
                  <div className={`h-4 rounded w-4/5 ${isDarkMode ? "bg-slate-700" : "bg-slate-200"}`} />
                  <div className={`h-4 rounded w-3/5 ${isDarkMode ? "bg-slate-700" : "bg-slate-200"}`} />
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Results */}
        {results && !isAnalyzing && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Match Score */}
            <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-slate-200"}`}>
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Match Score</h2>
                    {results.jobArea && <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">Área: {results.jobArea}</span>}
                    {results.scrapedJob
                      ? <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">✓ Vaga lida automaticamente</span>
                      : <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">⚠ Análise baseada no texto colado</span>
                    }
                  </div>
                  {results.jobTitle && <p className={`font-medium mt-1 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>{results.jobTitle}</p>}
                  <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Compatibilidade entre seu currículo e a vaga</p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-start gap-8">
                <div className="flex-shrink-0 mx-auto md:mx-0">
                  <div className="relative w-36 h-36">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="54" fill="none" stroke={isDarkMode ? "#334155" : "#e5e7eb"} strokeWidth="8" />
                      <circle cx="60" cy="60" r="54" fill="none"
                        stroke={results.matchScore >= 80 ? "#10b981" : results.matchScore >= 60 ? "#f59e0b" : "#ef4444"}
                        strokeWidth="8"
                        strokeDasharray={`${(results.matchScore / 100) * 339.29} 339.29`}
                        className="transition-all duration-1000"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-3xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>{results.matchScore}%</span>
                      <span className={`text-xs ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>match</span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 w-full">
                  <p className={`mb-5 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                    {results.matchScore >= 80 ? "Excelente compatibilidade! Seu currículo está muito bem alinhado com a vaga."
                      : results.matchScore >= 60 ? "Boa compatibilidade. Algumas melhorias podem aumentar suas chances."
                      : results.matchScore >= 40 ? "Compatibilidade moderada. Siga as sugestões para melhorar."
                      : "Compatibilidade baixa. Veja a análise de gaps para entender o que falta."}
                  </p>
                  <div className="space-y-2">
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Detalhamento por critério</p>
                    {[
                      { label: "Habilidades técnicas", value: results.scoreBreakdown.technicalSkills, max: 30 },
                      { label: "Experiência profissional", value: results.scoreBreakdown.experience, max: 30 },
                      { label: "Palavras-chave", value: results.scoreBreakdown.keywords, max: 20 },
                      { label: "Ferramentas citadas", value: results.scoreBreakdown.tools, max: 10 },
                      { label: "Senioridade", value: results.scoreBreakdown.seniority, max: 10 },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`text-sm w-44 flex-shrink-0 cursor-help flex items-center gap-1 ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                              {item.label}
                              <Info className="w-3 h-3 text-slate-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">{scoreBreakdownTooltips[item.label]}</TooltipContent>
                        </Tooltip>
                        <div className={`flex-1 rounded-full h-2 ${isDarkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                          <div className="h-2 rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${(item.value / item.max) * 100}%` }} />
                        </div>
                        <span className={`text-sm font-medium w-16 text-right ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>{item.value}/{item.max}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Gap Analysis */}
            {results.matchScore < 50 && results.gapAnalysis && results.gapAnalysis.length > 0 && (
              <Card className={`p-8 border-2 border-amber-200 ${isDarkMode ? "bg-slate-800" : "bg-amber-50"}`}>
                <div className="flex items-start gap-3 mb-5">
                  <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>O que falta para aumentar sua compatibilidade</h3>
                    <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>Análise honesta dos gaps entre seu perfil e esta vaga</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {results.gapAnalysis.map((gap, i) => (
                    <div key={i} className={`flex gap-3 items-start p-4 rounded-lg border ${isDarkMode ? "bg-slate-700 border-slate-600" : "bg-white border-amber-200"}`}>
                      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5">{i + 1}</span>
                      <p className={`text-sm ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>{gap}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Keywords */}
            <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-slate-200"}`}>
              <h3 className={`text-2xl font-bold mb-6 ${isDarkMode ? "text-white" : "text-slate-900"}`}>Palavras-chave da Vaga</h3>
              <div className="flex flex-wrap gap-3">
                {results.keywords.map((keyword, idx) => (
                  <span key={idx} className={`px-4 py-2 rounded-full text-sm font-medium border ${isDarkMode ? "bg-blue-900/40 text-blue-300 border-blue-700" : "bg-blue-50 text-blue-900 border-blue-200"}`}>{keyword}</span>
                ))}
              </div>
            </Card>

            {/* Elite ATS Score */}
            {results.atsScore !== undefined && results.atsScoreBreakdown && (
              <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-violet-800" : "border-violet-200 bg-gradient-to-br from-violet-50/60 to-white"}`}>
                <div className="flex items-start gap-3 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-6 h-6 text-violet-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>ATS Score Elite</h3>
                      <span className={`text-3xl font-black ${results.atsScore >= 75 ? "text-green-600" : results.atsScore >= 55 ? "text-amber-600" : "text-red-600"}`}>{results.atsScore}/100</span>
                    </div>
                    <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Pontuação ponderada como os maiores ATS do mercado calculam</p>
                    {results.seniorityLevel && (
                      <span className="mt-2 inline-block px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">{results.seniorityLevel}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-3 mb-6">
                  {[
                    { label: "Parseabilidade ATS", value: results.atsScoreBreakdown.parsing, max: 20, tip: "Quão bem o ATS consegue extrair seu currículo" },
                    { label: "Match de Keywords", value: results.atsScoreBreakdown.keywordMatch, max: 25, tip: "Densidade de palavras-chave da vaga no currículo" },
                    { label: "Qualidade da Experiência", value: results.atsScoreBreakdown.experienceQuality, max: 20, tip: "Bullets de impacto vs. bullets de tarefa" },
                    { label: "Métricas de Impacto", value: results.atsScoreBreakdown.impactMetrics, max: 15, tip: "Conquistas quantificadas (%, R$, escala)" },
                    { label: "Formatação ATS-Safe", value: results.atsScoreBreakdown.formatting, max: 10, tip: "Ausência de emojis, tabelas, markdown" },
                    { label: "Alinhamento de Skills", value: results.atsScoreBreakdown.skillsAlignment, max: 10, tip: "Seção de competências vs. requisitos da vaga" },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`text-sm w-52 flex-shrink-0 cursor-help flex items-center gap-1 ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                            {item.label}
                            <Info className="w-3 h-3 text-slate-400" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">{item.tip}</TooltipContent>
                      </Tooltip>
                      <div className={`flex-1 rounded-full h-2.5 ${isDarkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                        <div className="h-2.5 rounded-full bg-violet-600 transition-all duration-700" style={{ width: `${(item.value / item.max) * 100}%` }} />
                      </div>
                      <span className={`text-sm font-medium w-14 text-right ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>{item.value}/{item.max}</span>
                    </div>
                  ))}
                </div>
                {results.careerTrajectory && (
                  <div className={`p-4 rounded-lg border ${isDarkMode ? "bg-slate-700 border-slate-600" : "bg-violet-50 border-violet-200"}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${isDarkMode ? "text-violet-400" : "text-violet-700"}`}>Trajetória de Carreira</p>
                    <p className={`text-sm ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>{results.careerTrajectory}</p>
                  </div>
                )}
              </Card>
            )}

            {/* Strengths & Weaknesses */}
            {results.strengths && results.weaknesses && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className={`p-6 border-2 ${isDarkMode ? "bg-slate-800 border-green-800" : "border-green-200 bg-green-50/30"}`}>
                  <h4 className={`text-lg font-bold mb-4 flex items-center gap-2 ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                    <CheckCircle className="w-5 h-5 text-green-600" /> Pontos Fortes
                  </h4>
                  <ul className="space-y-2">
                    {results.strengths.map((s, i) => (
                      <li key={i} className={`text-sm flex gap-2 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                        <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>{s}
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className={`p-6 border-2 ${isDarkMode ? "bg-slate-800 border-red-800" : "border-red-200 bg-red-50/30"}`}>
                  <h4 className={`text-lg font-bold mb-4 flex items-center gap-2 ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                    <AlertTriangle className="w-5 h-5 text-red-500" /> Pontos a Melhorar
                  </h4>
                  <ul className="space-y-2">
                    {results.weaknesses.map((w, i) => (
                      <li key={i} className={`text-sm flex gap-2 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                        <span className="text-red-400 mt-0.5 flex-shrink-0">!</span>{w}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            )}

            {/* Missing Keywords */}
            {results.missingKeywords && results.missingKeywords.length > 0 && (
              <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-amber-700" : "border-amber-200 bg-amber-50/30"}`}>
                <div className="flex items-start gap-3 mb-5">
                  <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Keywords Ausentes no Currículo</h3>
                    <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Termos exatos da vaga não encontrados no seu currículo — o ATS vai penalizar</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {results.missingKeywords.map((kw, i) => (
                    <span key={i} className={`px-3 py-1.5 rounded-full text-sm font-medium border ${isDarkMode ? "bg-red-900/30 text-red-300 border-red-700" : "bg-red-50 text-red-700 border-red-200"}`}>{kw}</span>
                  ))}
                </div>
              </Card>
            )}

            {/* Improved Bullets */}
            {results.improvedBullets && results.improvedBullets.length > 0 && (
              <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-slate-200"}`}>
                <div className="flex items-start gap-3 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-blue-700" />
                  </div>
                  <div>
                    <h3 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Bullets Reescritos (Método STAR)</h3>
                    <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Transformação de bullets fracos em bullets de alto impacto</p>
                  </div>
                </div>
                <div className="space-y-5">
                  {results.improvedBullets.map((bullet, i) => (
                    <div key={i} className={`rounded-xl border p-5 ${isDarkMode ? "bg-slate-700 border-slate-600" : "bg-slate-50 border-slate-200"}`}>
                      <div className="space-y-3">
                        <div className={`p-3 rounded-lg ${isDarkMode ? "bg-red-900/20 border border-red-800" : "bg-red-50 border border-red-200"}`}>
                          <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">Original (fraco)</p>
                          <p className={`text-sm ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>{bullet.original}</p>
                        </div>
                        <div className={`p-3 rounded-lg ${isDarkMode ? "bg-green-900/20 border border-green-800" : "bg-green-50 border border-green-200"}`}>
                          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Reescrito (STAR)</p>
                          <p className={`text-sm font-medium ${isDarkMode ? "text-green-300" : "text-green-800"}`}>{bullet.improved}</p>
                        </div>
                        <p className={`text-xs ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}><span className="font-semibold">Por quê: </span>{bullet.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Recruiter Insights */}
            {results.recruiterInsights && results.recruiterInsights.length > 0 && (
              <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-blue-800" : "border-blue-100 bg-blue-50/20"}`}>
                <div className="flex items-start gap-3 mb-5">
                  <User className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Olhar do Recrutador Sênior</h3>
                    <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>O que um headhunter experiente notaria ao analisar seu perfil para esta vaga</p>
                  </div>
                </div>
                <ul className="space-y-3">
                  {results.recruiterInsights.map((insight, i) => (
                    <li key={i} className={`flex gap-3 items-start p-3 rounded-lg ${isDarkMode ? "bg-slate-700" : "bg-white border border-blue-100"}`}>
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">{i + 1}</span>
                      <p className={`text-sm ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>{insight}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Formatting Issues */}
            {results.formattingIssues && results.formattingIssues.length > 0 && (
              <Card className={`p-6 border-2 ${isDarkMode ? "bg-slate-800 border-red-800" : "border-red-200 bg-red-50/20"}`}>
                <h4 className={`font-bold mb-3 flex items-center gap-2 ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                  <AlertTriangle className="w-5 h-5 text-red-500" /> Problemas de Formatação Detectados pelo ATS
                </h4>
                <ul className="space-y-1.5">
                  {results.formattingIssues.map((issue, i) => (
                    <li key={i} className={`text-sm flex gap-2 ${isDarkMode ? "text-red-300" : "text-red-700"}`}>
                      <span className="flex-shrink-0 mt-0.5">⚠</span>{issue}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Suggestions */}
            <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-slate-200"}`}>
              <h3 className={`text-2xl font-bold mb-6 ${isDarkMode ? "text-white" : "text-slate-900"}`}>Sugestões de Melhoria</h3>
              <ul className="space-y-4">
                {results.suggestions.map((suggestion, idx) => (
                  <li key={idx} className="flex gap-4 items-start">
                    <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5">{idx + 1}</div>
                    <p className={`text-sm ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>{suggestion}</p>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Cover Letter Points */}
            {results.coverLetterPoints && results.coverLetterPoints.length > 0 && (
              <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-blue-800" : "border-blue-100 bg-blue-50/30"}`}>
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="flex items-start gap-3">
                    <BookOpen className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Carta de Apresentação</h3>
                      <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>3 pontos-chave para personalizar sua carta para esta vaga</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(results.coverLetterPoints!.join("\n\n"))} className="flex-shrink-0 text-xs">
                    <Copy className="w-3 h-3 mr-1" /> Copiar
                  </Button>
                </div>
                <div className="space-y-3">
                  {results.coverLetterPoints.map((point, i) => (
                    <div key={i} className={`flex gap-3 items-start p-4 rounded-lg border ${isDarkMode ? "bg-slate-700 border-slate-600" : "bg-white border-blue-200"}`}>
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5">{i + 1}</span>
                      <p className={`text-sm ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>{point}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Optimized Resume with Tabs */}
            <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-slate-200"}`}>
              <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                <div>
                  <h3 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Currículo Otimizado</h3>
                  <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Versão reescrita com base nas suas informações reais</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={handleStartEdit}
                    className={`flex items-center gap-2 flex-shrink-0 font-semibold shadow-sm transition-all ${
                      results.optimizedResume !== (originalAIResume || results.optimizedResume)
                        ? "bg-amber-500 hover:bg-amber-600 text-white"
                        : "bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300"
                    }`}
                  >
                    <Edit3 className="w-4 h-4" />
                    {results.optimizedResume !== (originalAIResume || results.optimizedResume) ? "CV Editado ✓" : "Editar CV"}
                  </Button>
                  <Button
                    onClick={handleTranslate}
                    disabled={isTranslating}
                    variant="outline"
                    className="flex items-center gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 flex-shrink-0"
                  >
                    {isTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                    {isTranslating ? "Traduzindo..." : "Traduzir para Inglês"}
                  </Button>
                </div>
              </div>

              {/* Tabs */}
              <div className={`flex gap-1 p-1 rounded-lg mb-6 ${isDarkMode ? "bg-slate-700" : "bg-slate-100"}`}>
                {[
                  { id: "optimized" as const, label: "CV Otimizado (PT)" },
                  { id: "comparison" as const, label: "Comparação" },
                  ...(translatedResume ? [{ id: "english" as const, label: "CV em Inglês" }] : []),
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${activeTab === tab.id ? "bg-white shadow text-blue-900" : isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === "optimized" && (
                <>
                  {isEditingResume ? (
                    <>
                      {/* Editor Header */}
                      <div className={`border-2 rounded-xl mb-4 overflow-hidden ${hasUnsavedChanges ? "border-amber-400" : "border-amber-300"} ${isDarkMode ? "bg-slate-900" : ""}`}>
                        {/* Toolbar */}
                        <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b ${isDarkMode ? "border-slate-700 bg-slate-800" : "border-amber-200 bg-amber-50"}`}>
                          <div className="flex items-center gap-2">
                            <Edit3 className="w-4 h-4 text-amber-600" />
                            <span className={`text-sm font-semibold ${isDarkMode ? "text-amber-400" : "text-amber-700"}`}>Modo de Edição</span>
                            {hasUnsavedChanges && (
                              <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-2 py-0.5 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                Alterações não salvas
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                              {editedResume.split("\n").length} linhas &bull; {editedResume.length} caracteres
                            </span>
                            <button
                              onClick={handleRestoreOriginal}
                              title="Restaurar versão original da IA"
                              className={`text-xs px-2 py-1 rounded border flex items-center gap-1 transition-colors ${isDarkMode ? "border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-400" : "border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400"}`}
                            >
                              <RefreshCw className="w-3 h-3" /> Restaurar original
                            </button>
                          </div>
                        </div>
                        {/* Dica de uso */}
                        <div className={`px-4 py-2 text-xs border-b ${isDarkMode ? "border-slate-700 bg-slate-800/50 text-slate-400" : "border-amber-100 bg-amber-50/50 text-amber-600"}`}>
                          Dica: edite livremente o texto. Use maiúsculas para títulos de seção (ex: EXPERIÊNCIA PROFISSIONAL) e • ou - para bullets.
                        </div>
                        {/* Textarea */}
                        <textarea
                          value={editedResume}
                          onChange={e => handleEditChange(e.target.value)}
                          className={`w-full min-h-[520px] p-6 text-sm font-mono leading-relaxed resize-y focus:outline-none ${isDarkMode ? "bg-slate-900 text-slate-200" : "bg-white text-slate-800"}`}
                          spellCheck
                          autoFocus
                        />
                      </div>
                      {/* Action Buttons */}
                      <div className="flex gap-3 mb-4">
                        <Button
                          onClick={handleSaveEdit}
                          className={`flex-1 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all ${hasUnsavedChanges ? "bg-emerald-600 hover:bg-emerald-700 shadow-md" : "bg-slate-400 cursor-default"}`}
                        >
                          <Save className="w-4 h-4" /> {hasUnsavedChanges ? "Salvar Edições" : "Sem alterações"}
                        </Button>
                        <Button onClick={handleCancelEdit} variant="outline" className="flex items-center gap-2 border-red-300 text-red-600 hover:bg-red-50">
                          <X className="w-4 h-4" /> Cancelar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className={`border rounded-lg p-8 mb-6 max-h-[600px] overflow-y-auto shadow-inner ${isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
                      <ResumeRenderer text={results.optimizedResume} />
                    </div>
                  )}
                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={() => copyToClipboard(isEditingResume ? editedResume : results.optimizedResume)} className="flex-1 bg-blue-900 hover:bg-blue-800 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2">
                      <Copy className="w-4 h-4" /> Copiar Texto
                    </Button>
                    <Button
                      onClick={() => handleDownloadPDF("pt")}
                      disabled={isGeneratingPDF}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"
                    >
                      {isGeneratingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {isGeneratingPDF ? "Gerando PDF..." : "Baixar como PDF"}
                    </Button>
                  </div>
                </>
              )}

              {activeTab === "comparison" && (
                <DiffViewer original={resumeText} optimized={results.optimizedResume} />
              )}

              {activeTab === "english" && translatedResume && (
                <>
                  <div className={`border rounded-lg p-8 mb-6 max-h-[600px] overflow-y-auto shadow-inner ${isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
                    <ResumeRenderer text={translatedResume} />
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={() => copyToClipboard(translatedResume)} className="flex-1 bg-blue-900 hover:bg-blue-800 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2">
                      <Copy className="w-4 h-4" /> Copiar (EN)
                    </Button>
                    <Button
                      onClick={() => handleDownloadPDF("en")}
                      disabled={isGeneratingPDF}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"
                    >
                      {isGeneratingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                      {isGeneratingPDF ? "Gerando PDF..." : "Baixar PDF (EN)"}
                    </Button>
                  </div>
                </>
              )}
            </Card>

            {/* Changes + Projected Score */}
            {results.changes && results.changes.length > 0 && (
              <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-blue-100 bg-gradient-to-br from-blue-50/60 to-white"}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-6 h-6 text-blue-700" />
                    </div>
                    <div>
                      <h3 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>O que foi alterado</h3>
                      <p className={`text-sm mt-0.5 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Comparação entre o currículo original e o otimizado</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-3 border rounded-xl px-5 py-3 shadow-sm flex-shrink-0 ${isDarkMode ? "bg-slate-700 border-slate-600" : "bg-white border-blue-200"}`}>
                    <div className="text-center">
                      <p className={`text-xs font-medium uppercase tracking-wide ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Antes</p>
                      <p className="text-2xl font-bold" style={{ color: results.matchScore >= 70 ? "#10b981" : results.matchScore >= 50 ? "#f59e0b" : "#ef4444" }}>{results.matchScore}%</p>
                    </div>
                    <ArrowUpRight className="w-6 h-6 text-blue-500 flex-shrink-0" />
                    <div className="text-center">
                      <p className={`text-xs font-medium uppercase tracking-wide ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Projetado</p>
                      <p className="text-2xl font-bold" style={{ color: results.projectedMatchScore >= 70 ? "#10b981" : results.projectedMatchScore >= 50 ? "#f59e0b" : "#ef4444" }}>{results.projectedMatchScore}%</p>
                    </div>
                    {results.projectedMatchScore > results.matchScore && (
                      <span className="ml-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">+{results.projectedMatchScore - results.matchScore}pts</span>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  {results.changes.map((change, idx) => {
                    const colors = {
                      alto: { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-700", dot: "bg-red-400" },
                      medio: { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400" },
                      baixo: { bg: "bg-slate-50", border: "border-slate-200", badge: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
                    }[change.impact] || { bg: "bg-slate-50", border: "border-slate-200", badge: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
                    const label = { alto: "Alto impacto", medio: "Médio impacto", baixo: "Baixo impacto" }[change.impact];
                    return (
                      <div key={idx} className={`flex gap-4 items-start p-4 rounded-lg border ${isDarkMode ? "bg-slate-700 border-slate-600" : `${colors.bg} ${colors.border}`}`}>
                        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${colors.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-slate-800"}`}>{change.section}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>{label}</span>
                          </div>
                          <p className={`text-sm leading-relaxed ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>{change.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* ── COMPETITIVE INTELLIGENCE ───────────────────────────────── */}
            {(results.competitiveEdges?.length || results.competitiveRisks?.length) && (
              <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-indigo-100 bg-gradient-to-br from-indigo-50/40 to-white"}`}>
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-6 h-6 text-indigo-700" />
                  </div>
                  <div>
                    <h3 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Inteligência Competitiva</h3>
                    <p className={`text-sm mt-0.5 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Como você se posiciona vs. o pool de candidatos desta vaga</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {results.competitiveEdges && results.competitiveEdges.length > 0 && (
                    <div className={`rounded-xl p-5 border ${isDarkMode ? "bg-emerald-900/20 border-emerald-700/40" : "bg-emerald-50 border-emerald-200"}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? "text-emerald-400" : "text-emerald-700"}`}>Seus diferenciais competitivos</span>
                      </div>
                      <ul className="space-y-2">
                        {results.competitiveEdges.map((edge, i) => (
                          <li key={i} className={`text-sm leading-relaxed flex gap-2 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                            <span className="text-emerald-500 mt-0.5 flex-shrink-0">▸</span>{edge}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {results.competitiveRisks && results.competitiveRisks.length > 0 && (
                    <div className={`rounded-xl p-5 border ${isDarkMode ? "bg-amber-900/20 border-amber-700/40" : "bg-amber-50 border-amber-200"}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? "text-amber-400" : "text-amber-700"}`}>Riscos competitivos</span>
                      </div>
                      <ul className="space-y-2">
                        {results.competitiveRisks.map((risk, i) => (
                          <li key={i} className={`text-sm leading-relaxed flex gap-2 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                            <span className="text-amber-500 mt-0.5 flex-shrink-0">▸</span>{risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* ── SALARY INTELLIGENCE ────────────────────────────────────── */}
            {results.salaryRange && (
              <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-violet-100 bg-gradient-to-br from-violet-50/40 to-white"}`}>
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <ArrowUpRight className="w-6 h-6 text-violet-700" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Inteligência Salarial</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        results.salaryRange.confidence === "high"
                          ? "bg-emerald-100 text-emerald-700"
                          : results.salaryRange.confidence === "medium"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}>
                        Confiança: {results.salaryRange.confidence === "high" ? "Alta" : results.salaryRange.confidence === "medium" ? "Média" : "Baixa"}
                      </span>
                    </div>
                    <p className={`text-sm mt-0.5 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Faixas estimadas para o mercado brasileiro · {new Date().getFullYear()}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  <div className={`rounded-xl p-5 border ${isDarkMode ? "bg-slate-700/60 border-slate-600" : "bg-white border-violet-200"}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDarkMode ? "text-violet-400" : "text-violet-600"}`}>CLT (com benefícios)</p>
                    <p className={`text-2xl font-black ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                      R$ {results.salaryRange.cltMin.toLocaleString("pt-BR")}
                      <span className={`text-base font-normal mx-1 ${isDarkMode ? "text-slate-400" : "text-slate-400"}`}>–</span>
                      R$ {results.salaryRange.cltMax.toLocaleString("pt-BR")}
                    </p>
                    <p className={`text-xs mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>bruto mensal</p>
                  </div>
                  <div className={`rounded-xl p-5 border ${isDarkMode ? "bg-slate-700/60 border-slate-600" : "bg-white border-violet-200"}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDarkMode ? "text-violet-400" : "text-violet-600"}`}>PJ (sem benefícios)</p>
                    <p className={`text-2xl font-black ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                      R$ {results.salaryRange.pjMin.toLocaleString("pt-BR")}
                      <span className={`text-base font-normal mx-1 ${isDarkMode ? "text-slate-400" : "text-slate-400"}`}>–</span>
                      R$ {results.salaryRange.pjMax.toLocaleString("pt-BR")}
                    </p>
                    <p className={`text-xs mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>bruto mensal</p>
                  </div>
                </div>
                <p className={`text-sm leading-relaxed mb-5 p-4 rounded-lg ${isDarkMode ? "bg-slate-700/40 text-slate-300" : "bg-violet-50/60 text-slate-600"}`}>
                  {results.salaryRange.rationale}
                </p>
                {results.negotiationTips && results.negotiationTips.length > 0 && (
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDarkMode ? "text-violet-400" : "text-violet-700"}`}>Dicas de negociação para seu perfil</p>
                    <ul className="space-y-2">
                      {results.negotiationTips.map((tip, i) => (
                        <li key={i} className={`text-sm leading-relaxed flex gap-2 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                          <span className="text-violet-500 font-bold flex-shrink-0">{i + 1}.</span>{tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            {/* ── RECRUITER PSYCHOLOGICAL PROFILE ────────────────────────── */}
            {results.recruiterProfile && (
              <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-rose-100 bg-gradient-to-br from-rose-50/30 to-white"}`}>
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6 text-rose-700" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Perfil do Recrutador</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${isDarkMode ? "bg-rose-900/40 text-rose-300" : "bg-rose-100 text-rose-700"}`}>
                        {results.recruiterProfile.companyType}
                      </span>
                    </div>
                    <p className={`text-sm mt-0.5 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>O que o recrutador pensa, teme e quer ouvir</p>
                  </div>
                </div>

                {/* Culture signals */}
                <div className={`rounded-xl p-4 mb-4 ${isDarkMode ? "bg-slate-700/40" : "bg-slate-50"}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Sinais de cultura da empresa</p>
                  <p className={`text-sm leading-relaxed ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>{results.recruiterProfile.cultureSignals}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {results.recruiterProfile.recruiterFears.length > 0 && (
                    <div className={`rounded-xl p-4 border ${isDarkMode ? "bg-red-900/20 border-red-700/30" : "bg-red-50 border-red-200"}`}>
                      <p className={`text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${isDarkMode ? "text-red-400" : "text-red-700"}`}>
                        <AlertTriangle className="w-3.5 h-3.5" /> O que o recrutador teme
                      </p>
                      <ul className="space-y-1.5">
                        {results.recruiterProfile.recruiterFears.map((fear, i) => (
                          <li key={i} className={`text-sm leading-relaxed flex gap-2 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                            <span className="text-red-400 flex-shrink-0 mt-0.5">✕</span>{fear}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {results.recruiterProfile.recruiterTriggers.length > 0 && (
                    <div className={`rounded-xl p-4 border ${isDarkMode ? "bg-emerald-900/20 border-emerald-700/30" : "bg-emerald-50 border-emerald-200"}`}>
                      <p className={`text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${isDarkMode ? "text-emerald-400" : "text-emerald-700"}`}>
                        <Zap className="w-3.5 h-3.5" /> O que aciona o "vou ligar agora"
                      </p>
                      <ul className="space-y-1.5">
                        {results.recruiterProfile.recruiterTriggers.map((trigger, i) => (
                          <li key={i} className={`text-sm leading-relaxed flex gap-2 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                            <span className="text-emerald-500 flex-shrink-0 mt-0.5">✓</span>{trigger}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Ideal narrative */}
                <div className={`rounded-xl p-4 border-l-4 ${isDarkMode ? "bg-slate-700/40 border-rose-500" : "bg-rose-50/60 border-rose-400"}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? "text-rose-400" : "text-rose-700"}`}>A narrativa ideal para este recrutador</p>
                  <p className={`text-sm leading-relaxed italic ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>"{results.recruiterProfile.idealNarrative}"</p>
                </div>
              </Card>
            )}

            {/* Vagas Aderentes */}
            <Card className={`p-8 border-2 ${isDarkMode ? "bg-slate-800 border-slate-700" : "border-slate-200"}`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Search className="w-6 h-6 text-blue-700" />
                  </div>
                  <div>
                    <h3 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>Vagas Aderentes</h3>
                    <p className={`text-sm mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Vagas do Brasil compatíveis com seu perfil em múltiplos sites</p>
                  </div>
                </div>
                <Button
                  onClick={handleSearchJobs}
                  disabled={isSearchingJobs}
                  className="bg-blue-900 hover:bg-blue-800 text-white font-semibold px-6 py-2.5 rounded-lg flex items-center gap-2 flex-shrink-0"
                >
                  {isSearchingJobs ? <><Loader2 className="w-4 h-4 animate-spin" /> Buscando vagas...</> : <><Search className="w-4 h-4" /> Buscar Vagas</>}
                </Button>
              </div>

              {isSearchingJobs && (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map(i => (
                    <div key={i} className={`h-24 rounded-lg ${isDarkMode ? "bg-slate-700" : "bg-slate-100"}`} />
                  ))}
                </div>
              )}

              {!isSearchingJobs && jobListings.length === 0 && (
                <div className={`text-center py-10 rounded-lg border-2 border-dashed ${isDarkMode ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-400"}`}>
                  <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Clique em "Buscar Vagas" para encontrar oportunidades compatíveis com seu perfil</p>
                </div>
              )}

              {!isSearchingJobs && jobListings.length > 0 && (
                <div className="space-y-3">
                  {jobListings.map((job, idx) => (
                    <a
                      key={idx}
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block p-5 rounded-xl border transition-all hover:shadow-md hover:-translate-y-0.5 ${isDarkMode ? "bg-slate-700 border-slate-600 hover:border-blue-500" : "bg-white border-slate-200 hover:border-blue-300"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h4 className={`font-semibold text-sm ${isDarkMode ? "text-white" : "text-slate-900"}`}>{job.title}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              job.source === "Gupy"
                                ? isDarkMode ? "bg-green-900/50 text-green-300" : "bg-green-100 text-green-700"
                                : job.source === "LinkedIn"
                                  ? isDarkMode ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"
                                  : job.source === "Vagas.com.br"
                                    ? isDarkMode ? "bg-orange-900/50 text-orange-300" : "bg-orange-100 text-orange-700"
                                    : isDarkMode ? "bg-slate-600 text-slate-300" : "bg-slate-100 text-slate-600"
                            }`}>{job.source}</span>
                            {job.isReal && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isDarkMode ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
                                Vaga real
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                            {job.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{job.company}</span>}
                            {job.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location}</span>}
                            {job.publishedAt && <span className="text-slate-400">Publicada {job.publishedAt}</span>}
                          </div>
                          {job.matchReason && (
                            <p className={`text-xs mt-2 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                              {job.matchReason}
                            </p>
                          )}
                        </div>
                        <ExternalLink className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </Card>

          </div>
        )}
      </div>
    </div>
  );
}
