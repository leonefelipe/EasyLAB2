/**
 * LinkedInJobImporter.tsx
 *
 * Smart LinkedIn job URL importer.
 * - Detects LinkedIn URLs on paste
 * - Runs 5-layer extraction pipeline automatically
 * - Falls back to manual paste with LLM-powered structuring
 * - Populates the job description field and shows extracted metadata
 */

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Linkedin, Loader2, CheckCircle, AlertTriangle, ChevronDown,
  ChevronUp, Copy, Sparkles, X, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  employmentType: string;
  seniority: string;
  description: string;
  requirements: string[];
  skills: string[];
  benefits: string[];
  extractionMethod: string;
  scrapedSuccessfully: boolean;
  jobId?: string;
}

interface Props {
  onJobLoaded: (description: string, metadata?: Partial<ExtractedJob>) => void;
  isDarkMode?: boolean;
  placeholder?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLinkedInUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.hostname.includes("linkedin.com") && s.includes("jobs");
  } catch { return false; }
}

function methodLabel(method: string): string {
  const m: Record<string, string> = {
    json_ld:      "JSON-LD",
    opengraph:    "OpenGraph",
    html_parse:   "HTML",
    api:          "API LinkedIn",
    llm_parse:    "IA",
    manual_paste: "Colado manualmente",
  };
  return m[method] ?? method;
}

// ─── Extracted Job Card ───────────────────────────────────────────────────────

function ExtractedJobCard({ job, isDark }: { job: ExtractedJob; isDark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const dk = isDark;

  return (
    <div className={`rounded-xl border overflow-hidden mt-3 ${dk ? "border-emerald-700/40 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50/60"}`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-start justify-between gap-3 ${dk ? "border-b border-emerald-700/30" : "border-b border-emerald-100"}`}>
        <div className="flex items-start gap-2 min-w-0">
          <CheckCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${dk ? "text-emerald-400" : "text-emerald-600"}`} />
          <div className="min-w-0">
            {job.title && (
              <p className={`text-sm font-semibold truncate ${dk ? "text-white" : "text-slate-900"}`}>
                {job.title}
              </p>
            )}
            <div className={`text-xs flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 ${dk ? "text-slate-400" : "text-slate-500"}`}>
              {job.company  && <span>{job.company}</span>}
              {job.location && <span>📍 {job.location}</span>}
              {job.employmentType && <span>{job.employmentType}</span>}
              {job.seniority && <span>{job.seniority}</span>}
            </div>
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${dk ? "border-emerald-700/40 text-emerald-400" : "border-emerald-200 text-emerald-600"}`}>
          via {methodLabel(job.extractionMethod)}
        </span>
      </div>

      {/* Skills */}
      {job.skills.length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-1.5">
          {job.skills.slice(0, 12).map((s, i) => (
            <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full ${dk ? "bg-slate-700 text-slate-300" : "bg-white border border-slate-200 text-slate-600"}`}>
              {s}
            </span>
          ))}
          {job.skills.length > 12 && (
            <span className={`text-[11px] ${dk ? "text-slate-500" : "text-slate-400"}`}>
              +{job.skills.length - 12}
            </span>
          )}
        </div>
      )}

      {/* Expand/collapse description */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full px-4 py-2 flex items-center gap-2 text-xs transition-colors ${dk ? "text-slate-400 hover:text-slate-300 hover:bg-slate-700/30" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Ocultar descrição" : "Ver descrição extraída"}
      </button>

      {expanded && (
        <div className={`px-4 pb-4 max-h-48 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap ${dk ? "text-slate-400" : "text-slate-600"}`}>
          {job.description.slice(0, 1500)}
          {job.description.length > 1500 && "…"}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LinkedInJobImporter({ onJobLoaded, isDarkMode = false, placeholder }: Props) {
  const [url, setUrl]                     = useState("");
  const [pasteMode, setPasteMode]         = useState(false);
  const [pastedText, setPastedText]       = useState("");
  const [extractedJob, setExtractedJob]   = useState<ExtractedJob | null>(null);
  const [isExtracted, setIsExtracted]     = useState(false);

  const dk = isDarkMode;

  const extractMutation = trpc.jobExtractor.extractJob.useMutation({
    onSuccess: (data) => {
      if (data.success && data.job) {
        setExtractedJob(data.job);
        setIsExtracted(true);
        onJobLoaded(data.job.description, data.job);
        toast.success("Vaga extraída com sucesso!");
      } else {
        // Extraction failed — show paste fallback
        setPasteMode(true);
        toast.info(data.userMessage ?? "Não foi possível extrair automaticamente. Cole o texto abaixo.");
      }
    },
    onError: () => {
      setPasteMode(true);
      toast.error("Erro ao acessar a vaga. Cole o texto manualmente.");
    },
  });

  const parseMutation = trpc.jobExtractor.parseJobText.useMutation({
    onSuccess: (data) => {
      if (data.success && data.job) {
        setExtractedJob(data.job);
        setIsExtracted(true);
        onJobLoaded(data.job.description, data.job);
        toast.success("Descrição processada com IA!");
      }
    },
    onError: () => toast.error("Erro ao processar texto."),
  });

  const isLoading = extractMutation.isPending || parseMutation.isPending;

  // Detect LinkedIn URL on change
  const handleUrlChange = useCallback((val: string) => {
    setUrl(val);
    setExtractedJob(null);
    setIsExtracted(false);
    setPasteMode(false);
  }, []);

  const handleExtract = () => {
    if (!url.trim()) return;
    if (!isLinkedInUrl(url)) {
      toast.error("Cole uma URL de vaga do LinkedIn (linkedin.com/jobs/...)");
      return;
    }
    extractMutation.mutate({ url: url.trim() });
  };

  const handleParsePaste = () => {
    if (!pastedText.trim() || pastedText.length < 50) {
      toast.error("Cole pelo menos a descrição completa da vaga.");
      return;
    }
    parseMutation.mutate({ text: pastedText.trim() });
  };

  const handleReset = () => {
    setUrl("");
    setPasteMode(false);
    setPastedText("");
    setExtractedJob(null);
    setIsExtracted(false);
    extractMutation.reset();
    parseMutation.reset();
  };

  const inputCls = `text-sm rounded-xl border transition-all focus:ring-2 focus:ring-blue-500/30 focus:outline-none px-3 py-2.5 w-full ${
    dk
      ? "bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
      : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400"
  }`;

  return (
    <div className="space-y-3">
      {/* URL input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Linkedin className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${dk ? "text-blue-400" : "text-blue-600"}`} />
          <input
            type="url"
            value={url}
            onChange={e => handleUrlChange(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleExtract()}
            placeholder={placeholder ?? "Cole a URL da vaga do LinkedIn..."}
            className={`${inputCls} pl-10 pr-10`}
          />
          {url && (
            <button
              onClick={handleReset}
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 ${dk ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Button
          onClick={handleExtract}
          disabled={isLoading || !url.trim() || isExtracted}
          className={`flex-shrink-0 gap-2 ${
            isExtracted
              ? "bg-emerald-600 hover:bg-emerald-600 cursor-default"
              : "bg-blue-700 hover:bg-blue-600"
          } text-white rounded-xl px-4`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isExtracted ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">
            {isLoading ? "Extraindo..." : isExtracted ? "Extraído" : "Extrair"}
          </span>
        </Button>
        {isExtracted && (
          <Button variant="outline" size="sm" onClick={handleReset} className="flex-shrink-0 rounded-xl">
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* LinkedIn URL hint */}
      {url && !isLinkedInUrl(url) && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${dk ? "bg-amber-900/20 text-amber-400 border border-amber-700/30" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          URL deve ser do LinkedIn Jobs (ex: linkedin.com/jobs/view/123456)
        </div>
      )}

      {/* Extracted job card */}
      {extractedJob && isExtracted && (
        <ExtractedJobCard job={extractedJob} isDark={dk} />
      )}

      {/* Manual paste fallback */}
      {pasteMode && !isExtracted && (
        <div className={`rounded-xl border p-4 space-y-3 ${dk ? "border-slate-600 bg-slate-700/30" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex items-start gap-2">
            <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${dk ? "text-amber-400" : "text-amber-600"}`} />
            <div>
              <p className={`text-sm font-medium ${dk ? "text-white" : "text-slate-900"}`}>
                Extração automática bloqueada
              </p>
              <p className={`text-xs mt-0.5 ${dk ? "text-slate-400" : "text-slate-500"}`}>
                Abra a vaga no LinkedIn, selecione e copie toda a descrição (Ctrl+A na seção da vaga), e cole abaixo. Nossa IA estrutura automaticamente.
              </p>
            </div>
          </div>
          <Textarea
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            placeholder="Cole aqui o texto completo da vaga..."
            className={`min-h-[160px] text-sm resize-none rounded-xl ${dk ? "bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" : "bg-white border-slate-300"}`}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPasteMode(false); setPastedText(""); }}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleParsePaste}
              disabled={parseMutation.isPending || pastedText.length < 50}
              size="sm"
              className="bg-blue-700 hover:bg-blue-600 text-white rounded-xl gap-2"
            >
              {parseMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processando...</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> Processar com IA</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Show manual paste button if URL extraction succeeded but user wants to refine */}
      {!pasteMode && !isExtracted && url && isLinkedInUrl(url) && !isLoading && (
        <button
          onClick={() => setPasteMode(true)}
          className={`text-xs ${dk ? "text-slate-500 hover:text-slate-400" : "text-slate-400 hover:text-slate-600"} underline`}
        >
          Prefere colar o texto manualmente?
        </button>
      )}
    </div>
  );
}

export default LinkedInJobImporter;
