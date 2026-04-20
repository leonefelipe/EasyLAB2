/**
 * ClientDashboard.tsx — EasyLAB2 Internal CRM
 *
 * Features:
 *  - Client dashboard with stats, pipeline, search
 *  - Client detail with projects, contact, notes
 *  - Analysis panel (CV upload + AI analysis)
 *  - Before/After CV comparison view
 *  - Professional PDF report (browser print, no html2canvas)
 *  - Status tracking: aguardando_cv → em_analise → entregue → pago
 *  - Persistent localStorage storage
 */

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Trash2, CheckCircle, Clock, AlertCircle, DollarSign,
  User, FileText, Search, Upload, Loader2, Zap, Download, X,
  ArrowLeft, MessageCircle, Mail, Star, TrendingUp, Linkedin,
  BarChart2, Edit2, FolderOpen, Package, ExternalLink,
  GitCompare, ChevronLeft, ChevronRight, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { extractTextFromFile } from "@/lib/fileExtractor";
import { generateResumePDF } from "@/lib/pdfGenerator";
import { generateClientReport } from "@/lib/clientReportGenerator";
import type { AnalysisResult } from "@/components/AnalysisLayout";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type Status = "aguardando_cv" | "em_analise" | "entregue" | "pago" | "cancelado";
type Pacote = "cv_basico" | "cv_linkedin" | "premium";

interface Client {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  linkedin: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  clientId: string;
  pacote: Pacote;
  status: Status;
  valor: number;
  jobTitle: string;
  jobLink: string;
  targetPositions: string;  // Positions the client wants to apply for
  atsScore?: number;
  cvOriginal?: string;   // raw text of uploaded CV
  cvOptimized?: string;  // AI-optimized CV text
  lastAnalysis?: AnalysisResult;
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const LS_CLIENTS  = "easylab2_clients";
const LS_PROJECTS = "easylab2_projects";

const PACOTES: Record<Pacote, { label: string; valor: number; cor: string; desc: string }> = {
  cv_basico:   { label: "CV Básico",     valor: 250, cor: "bg-slate-100 text-slate-700",   desc: "CV optimizado + Relatório PDF" },
  cv_linkedin: { label: "CV + LinkedIn", valor: 450, cor: "bg-blue-100 text-blue-700",     desc: "CV + LinkedIn + Relatório PDF" },
  premium:     { label: "Premium",       valor: 750, cor: "bg-purple-100 text-purple-700", desc: "CV + LinkedIn + Estratégia completa" },
};

const STATUS_CONFIG: Record<Status, { label: string; cor: string; icon: React.ElementType }> = {
  aguardando_cv: { label: "Aguardando CV",  cor: "bg-amber-100 text-amber-700",     icon: Clock },
  em_analise:    { label: "Em análise",     cor: "bg-blue-100 text-blue-700",       icon: AlertCircle },
  entregue:      { label: "Entregue",       cor: "bg-green-100 text-green-700",     icon: CheckCircle },
  pago:          { label: "Pago ✓",         cor: "bg-emerald-100 text-emerald-800", icon: DollarSign },
  cancelado:     { label: "Cancelado",      cor: "bg-red-100 text-red-700",         icon: Trash2 },
};

const STATUS_ORDER: Status[] = ["aguardando_cv", "em_analise", "entregue", "pago", "cancelado"];
const PIPELINE_STEPS: Status[] = ["aguardando_cv", "em_analise", "entregue", "pago"];

// ═══════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadClients(): Client[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_CLIENTS) ?? "[]") as any[];
    return raw.map(r => ({
      id:        r.id        ?? newId(),
      name:      r.name      ?? "",
      email:     r.email     ?? "",
      whatsapp:  r.whatsapp  ?? "",
      linkedin:  r.linkedin  ?? "",
      notes:     r.notes     ?? "",
      createdAt: r.createdAt ?? new Date().toISOString(),
      updatedAt: r.updatedAt ?? new Date().toISOString(),
    }));
  } catch { return []; }
}

function saveClients(clients: Client[]) {
  localStorage.setItem(LS_CLIENTS, JSON.stringify(clients));
}

function loadProjects(): Project[] {
  try {
    const existing = JSON.parse(localStorage.getItem(LS_PROJECTS) ?? "[]") as any[];
    if (existing.length > 0) return existing.map((p: any) => ({ targetPositions: "", ...p }));
    // Migrate old format
    const raw = JSON.parse(localStorage.getItem(LS_CLIENTS) ?? "[]") as any[];
    const migrated: Project[] = [];
    for (const c of raw) {
      if (c.pacote) {
        migrated.push({
          id: newId(), clientId: c.id,
          pacote: c.pacote ?? "cv_basico", status: c.status ?? "aguardando_cv",
          valor: c.valor ?? 0, jobTitle: c.jobTitle ?? "", jobLink: c.jobLink ?? "",
          targetPositions: c.targetPositions ?? "",
          atsScore: c.atsScore, cvOptimized: undefined,
          createdAt: c.createdAt ?? new Date().toISOString(),
          updatedAt: c.updatedAt ?? new Date().toISOString(),
        });
      }
    }
    if (migrated.length > 0) localStorage.setItem(LS_PROJECTS, JSON.stringify(migrated));
    return migrated;
  } catch { return []; }
}

function saveProjects(projects: Project[]) {
  localStorage.setItem(LS_PROJECTS, JSON.stringify(projects));
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

function exportCSV(clients: Client[], projects: Project[]) {
  const header = ["Nome","Email","WhatsApp","Pacote","Status","Valor","Vaga","Score ATS","Data"];
  const rows = projects.map(p => {
    const c = clients.find(x => x.id === p.clientId);
    return [c?.name ?? "", c?.email ?? "", c?.whatsapp ?? "",
      PACOTES[p.pacote]?.label ?? "", STATUS_CONFIG[p.status]?.label ?? "",
      p.valor, p.jobTitle, p.atsScore ?? "", fmtDate(p.createdAt),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  const blob = new Blob(["\uFEFF" + [header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: `Leone_CRM_${new Date().toISOString().slice(0, 10)}.csv` }).click();
  URL.revokeObjectURL(url);
  toast.success("CSV exportado");
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════════

function DashboardStats({ clients, projects }: { clients: Client[]; projects: Project[] }) {
  const thisMonth    = new Date().toISOString().slice(0, 7);
  const totalRevenue = projects.filter(p => p.status === "pago").reduce((s, p) => s + p.valor, 0);
  const monthRevenue = projects.filter(p => p.status === "pago" && p.updatedAt.startsWith(thisMonth)).reduce((s, p) => s + p.valor, 0);
  const pendingRev   = projects.filter(p => p.status === "entregue").reduce((s, p) => s + p.valor, 0);
  const activeClts   = new Set(projects.filter(p => !["pago","cancelado"].includes(p.status)).map(p => p.clientId)).size;
  const paid         = projects.filter(p => p.status === "pago");
  const avgTicket    = paid.length > 0 ? Math.round(totalRevenue / paid.length) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: "Receita Total",     value: fmt(totalRevenue),    sub: `${paid.length} pagos`,                                              color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
        { label: "Este Mês",          value: fmt(monthRevenue),    sub: "receita do mês corrente",                                          color: "text-blue-600",    bg: "bg-blue-50 border-blue-100" },
        { label: "A Receber",         value: fmt(pendingRev),      sub: `${projects.filter(p => p.status === "entregue").length} entregues`, color: "text-amber-600",   bg: "bg-amber-50 border-amber-100" },
        { label: "Clientes Activos",  value: String(activeClts),   sub: `ticket médio ${fmt(avgTicket)}`,                                   color: "text-slate-700",   bg: "bg-slate-50 border-slate-200" },
      ].map(s => (
        <div key={s.label} className={`${s.bg} border rounded-xl p-4`}>
          <p className="text-xs text-slate-500 mb-1 font-medium">{s.label}</p>
          <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CLIENT MODAL
// ═══════════════════════════════════════════════════════════════════

function ClientModal({ initial, onSave, onClose }: {
  initial?: Client; onSave: (c: Client) => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "", email: initial?.email ?? "",
    whatsapp: initial?.whatsapp ?? "", linkedin: initial?.linkedin ?? "",
    notes: initial?.notes ?? "",
  });
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  function handleSave() {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    const now = new Date().toISOString();
    onSave({ ...form, id: initial?.id ?? newId(), createdAt: initial?.createdAt ?? now, updatedAt: now });
    onClose();
  }

  const inp = "w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
  const lbl = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold">{initial ? "Editar Cliente" : "Novo Cliente"}</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div><label className={lbl}>Nome completo *</label>
            <input className={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Maria Silva" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>E-mail</label>
              <input className={inp} value={form.email} onChange={e => set("email", e.target.value)} placeholder="maria@email.com" /></div>
            <div><label className={lbl}>WhatsApp</label>
              <input className={inp} value={form.whatsapp} onChange={e => set("whatsapp", e.target.value)} placeholder="+55 11 99999-0000" /></div>
          </div>
          <div><label className={lbl}>LinkedIn</label>
            <input className={inp} value={form.linkedin} onChange={e => set("linkedin", e.target.value)} placeholder="linkedin.com/in/maria-silva" /></div>
          <div><label className={lbl}>Notas internas</label>
            <textarea className={`${inp} min-h-24 resize-y`} value={form.notes} onChange={e => set("notes", e.target.value)}
              placeholder="Contexto, observações, histórico..." /></div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 bg-blue-700 hover:bg-blue-800 text-white" onClick={handleSave}>
            {initial ? "Guardar" : "Adicionar cliente"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PROJECT MODAL
// ═══════════════════════════════════════════════════════════════════

function ProjectModal({ clientName, initial, clientId, onSave, onClose }: {
  clientName: string; initial?: Project; clientId: string;
  onSave: (p: Project) => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    pacote:          (initial?.pacote   ?? "cv_linkedin") as Pacote,
    status:          (initial?.status   ?? "aguardando_cv") as Status,
    valor:           initial?.valor    ?? PACOTES.cv_linkedin.valor,
    jobTitle:        initial?.jobTitle ?? "",
    jobLink:         initial?.jobLink  ?? "",
    targetPositions: initial?.targetPositions ?? "",
  });
  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  function handleSave() {
    const now = new Date().toISOString();
    onSave({
      ...form, id: initial?.id ?? newId(), clientId: initial?.clientId ?? clientId,
      atsScore: initial?.atsScore, cvOptimized: initial?.cvOptimized,
      cvOriginal: initial?.cvOriginal, lastAnalysis: initial?.lastAnalysis,
      createdAt: initial?.createdAt ?? now, updatedAt: now,
    });
    onClose();
  }

  const inp = "w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
  const lbl = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">{initial ? "Editar Projecto" : "Novo Projecto"}</h2>
            <p className="text-blue-300 text-xs">{clientName}</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* TARGET POSITIONS — primário e mais importante */}
          <div>
            <label className={lbl}>
              🎯 Posições que o cliente quer se candidatar *
            </label>
            <textarea
              className={`${inp} min-h-20 resize-y`}
              value={form.targetPositions}
              onChange={e => set("targetPositions", e.target.value)}
              placeholder={`Ex:\n- Head de Vendas B2B\n- Gerente Comercial SaaS\n- Business Development Director\n\nEspecifique os cargos, áreas e nível de senioridade desejados`}
            />
            <p className="text-xs text-blue-600 mt-1">💡 Estas posições guiam toda a análise da IA — seja específico</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Pacote</label>
              <select className={inp} value={form.pacote}
                onChange={e => { const p = e.target.value as Pacote; set("pacote", p); set("valor", PACOTES[p].valor); }}>
                {Object.entries(PACOTES).map(([k, v]) => <option key={k} value={k}>{v.label} — {fmt(v.valor)}</option>)}
              </select></div>
            <div><label className={lbl}>Valor (R$)</label>
              <input className={inp} type="number" value={form.valor} onChange={e => set("valor", Number(e.target.value))} /></div>
          </div>
          <div><label className={lbl}>Status</label>
            <select className={inp} value={form.status} onChange={e => set("status", e.target.value as Status)}>
              {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
            </select></div>
          <div><label className={lbl}>Vaga específica <span className="normal-case font-normal text-slate-400">(se aplicável)</span></label>
            <input className={inp} value={form.jobTitle} onChange={e => set("jobTitle", e.target.value)} placeholder="Ex: Head de Vendas B2B — Empresa X" /></div>
          <div><label className={lbl}>Link da vaga <span className="normal-case font-normal text-slate-400">(opcional)</span></label>
            <input className={inp} value={form.jobLink} onChange={e => set("jobLink", e.target.value)} placeholder="https://gupy.io/..." /></div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 bg-blue-700 hover:bg-blue-800 text-white" onClick={handleSave}>
            {initial ? "Guardar" : "Criar projecto"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CV COMPARISON VIEW
// ═══════════════════════════════════════════════════════════════════

function CVComparison({ original, optimized, onClose }: {
  original: string; optimized: string; onClose: () => void;
}) {
  const [activePanel, setActivePanel] = useState<"split" | "original" | "optimized">("split");

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-3 flex items-center justify-between border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-blue-300 hover:text-white text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />Voltar
          </button>
          <span className="text-white/30">|</span>
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-blue-400" />
            <span className="text-white font-semibold text-sm">Comparação Antes / Depois</span>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
          {[
            { id: "split", label: "Split" },
            { id: "original", label: "Original" },
            { id: "optimized", label: "Optimizado" },
          ].map(opt => (
            <button key={opt.id}
              onClick={() => setActivePanel(opt.id as typeof activePanel)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activePanel === opt.id
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Original */}
        {(activePanel === "split" || activePanel === "original") && (
          <div className={`${activePanel === "split" ? "w-1/2 border-r border-slate-700" : "flex-1"} flex flex-col bg-slate-50`}>
            <div className="bg-red-900/30 border-b border-red-800/40 px-5 py-2.5 flex items-center gap-2">
              <ChevronLeft className="w-4 h-4 text-red-400" />
              <span className="text-red-300 text-xs font-bold uppercase tracking-wider">CV Original</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <pre className="font-mono text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{original}</pre>
            </div>
          </div>
        )}

        {/* Optimized */}
        {(activePanel === "split" || activePanel === "optimized") && (
          <div className={`${activePanel === "split" ? "w-1/2" : "flex-1"} flex flex-col bg-emerald-50`}>
            <div className="bg-green-900/30 border-b border-green-800/40 px-5 py-2.5 flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-green-400" />
              <span className="text-green-300 text-xs font-bold uppercase tracking-wider">CV Optimizado</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <pre className="font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">{optimized}</pre>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-slate-800 border-t border-slate-700 px-6 py-2.5 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-400/40 border border-red-400/60" />
          <span className="text-slate-400 text-xs">CV original enviado pelo cliente</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-400/40 border border-green-400/60" />
          <span className="text-slate-400 text-xs">CV optimizado com IA para ATS</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PROJECT CARD
// ═══════════════════════════════════════════════════════════════════

function ProjectCard({ project, onEdit, onDelete, onStatusChange, onAnalyze, onCompare }: {
  project: Project; onEdit: () => void; onDelete: () => void;
  onStatusChange: (s: Status) => void; onAnalyze: () => void;
  onCompare: () => void;
}) {
  const st  = STATUS_CONFIG[project.status];
  const pkg = PACOTES[project.pacote];
  const pipelineIdx = PIPELINE_STEPS.indexOf(project.status);
  const hasComparison = !!(project.cvOriginal && project.cvOptimized);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pkg.cor}`}>{pkg.label}</span>
            <span className="text-sm font-bold text-slate-800">{fmt(project.valor)}</span>
            {project.atsScore !== undefined && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                project.atsScore >= 75 ? "bg-green-100 text-green-700" :
                project.atsScore >= 55 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
              }`}>
                ATS {project.atsScore}/100
              </span>
            )}
          </div>
          {project.jobTitle && (
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <FileText className="w-3 h-3" />{project.jobTitle}
            </p>
          )}
          {project.jobLink && (
            <a href={project.jobLink} target="_blank" rel="noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
              <ExternalLink className="w-3 h-3" />Ver vaga
            </a>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
          <Button size="sm" onClick={onAnalyze} className="text-xs gap-1 bg-blue-700 hover:bg-blue-800 text-white h-7">
            <Zap className="w-3 h-3" />Analisar
          </Button>
          {hasComparison && (
            <Button size="sm" onClick={onCompare} variant="outline" className="text-xs gap-1 h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              <GitCompare className="w-3 h-3" />Comparar
            </Button>
          )}
          <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Pipeline bar */}
      <div className="mt-3">
        <div className="flex items-center gap-0.5">
          {PIPELINE_STEPS.map((step, i) => (
            <button key={step} onClick={() => onStatusChange(step)} title={STATUS_CONFIG[step].label}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                project.status === "cancelado" ? "bg-red-200" :
                pipelineIdx > i  ? "bg-blue-600" :
                step === project.status ? "bg-blue-400" : "bg-slate-200"
              }`} />
          ))}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cor}`}>{st.label}</span>
          <div className="flex items-center gap-2">
            {project.status !== "cancelado" && project.status !== "pago" && (
              <button onClick={() => onStatusChange("cancelado")} className="text-xs text-slate-400 hover:text-red-500">cancelar</button>
            )}
            {project.status === "cancelado" && (
              <button onClick={() => onStatusChange("aguardando_cv")} className="text-xs text-blue-600 hover:underline">reactivar</button>
            )}
            <span className="text-xs text-slate-400">{fmtDate(project.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CLIENT CARD (list view)
// ═══════════════════════════════════════════════════════════════════

function ClientCard({ client, projects, onOpen, onEdit, onDelete }: {
  client: Client; projects: Project[];
  onOpen: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const cp        = projects.filter(p => p.clientId === client.id);
  const active    = cp.find(p => !["pago","cancelado"].includes(p.status));
  const latest    = [...cp].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const display   = active ?? latest;
  const totalPaid = cp.filter(p => p.status === "pago").reduce((s, p) => s + p.valor, 0);
  const st        = display ? STATUS_CONFIG[display.status] : null;
  const StIcon    = st?.icon ?? Clock;

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
      onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-800 to-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {initials(client.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm">{client.name}</p>
            <p className="text-xs text-slate-400 truncate">{client.email || client.whatsapp || "—"}</p>
            {display?.jobTitle && <p className="text-xs text-blue-600 truncate mt-0.5">{display.jobTitle}</p>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {display && (
            <>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PACOTES[display.pacote].cor}`}>{PACOTES[display.pacote].label}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${st?.cor}`}>
                <StIcon className="w-3 h-3" />{st?.label}
              </span>
            </>
          )}
          {!display && <span className="text-xs text-slate-400 italic">Sem projectos</span>}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{cp.length} projecto{cp.length !== 1 ? "s" : ""}</span>
          {totalPaid > 0 && <span className="text-xs font-semibold text-emerald-600">{fmt(totalPaid)} pago</span>}
          {display?.atsScore !== undefined && (
            <span className={`text-xs font-bold ${display.atsScore >= 75 ? "text-green-600" : display.atsScore >= 55 ? "text-amber-600" : "text-red-600"}`}>
              ATS {display.atsScore}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
          <button onClick={onOpen} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><FolderOpen className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ANALYSIS PANEL
// ═══════════════════════════════════════════════════════════════════

function AnalysisPanel({ client, project, onBack, onComplete }: {
  client: Client; project: Project; onBack: () => void;
  onComplete: (atsScore: number, jobTitle: string, cvOriginal: string, cvOptimized: string, analysis: AnalysisResult) => void;
}) {
  const [resumeFile,   setResumeFile]   = useState<File | null>(null);
  const [resumeText,   setResumeText]   = useState(project.cvOriginal ?? "");
  const [jobInput,     setJobInput]     = useState(project.jobLink || project.jobTitle || "");
  const [isExtracting, setIsExtracting] = useState(false);
  const [results,      setResults]      = useState<AnalysisResult | null>(project.lastAnalysis ?? null);
  const [genCV,        setGenCV]        = useState(false);
  const [genReport,    setGenReport]    = useState(false);

  const analyzeMutation = trpc.resume.analyze.useMutation({
    onSuccess: (data: AnalysisResult) => {
      setResults(data);
      toast.success("Análise concluída!");
      onComplete(
        data.atsScore ?? data.matchScore,
        data.jobTitle ?? project.jobTitle,
        resumeText,
        data.optimizedResume,
        data
      );
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setResumeFile(file); setIsExtracting(true);
    try { setResumeText(await extractTextFromFile(file)); toast.success("CV carregado!"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao processar ficheiro"); }
    finally { setIsExtracting(false); }
  };

  const whatsappMsg = results
    ? `Olá ${client.name.split(" ")[0]}! 👋\n\nConclui a análise do teu CV.\n\n📊 Score ATS: ${results.atsScore ?? results.matchScore}/100\n🎯 Score optimizado: ${results.projectedMatchScore}/100\n\nEnvio agora o CV optimizado e o relatório completo. 🚀`
    : "";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-300 hover:text-white text-sm mb-3 transition-colors">
            <ArrowLeft className="w-4 h-4" />Voltar ao cliente
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
                {initials(client.name)}
              </div>
              <div>
                <h1 className="text-white font-bold">{client.name}</h1>
                <p className="text-blue-300 text-xs">{PACOTES[project.pacote].label} · {fmt(project.valor)} · {project.jobTitle || "Análise geral"}</p>
              </div>
            </div>
            {client.whatsapp && (
              <a href={`https://wa.me/${client.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white text-xs font-semibold px-3 py-2 rounded-lg">
                <MessageCircle className="w-3.5 h-3.5" />WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* Upload + Analyse */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-blue-600" />Análise de CV com IA</h2>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Currículo</label>
            <input type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" id="ap-cv-upload" />
            <label htmlFor="ap-cv-upload" className={`flex items-center gap-3 p-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${resumeText ? "border-green-300 bg-green-50" : "border-slate-300 hover:border-blue-400 bg-slate-50"}`}>
              {isExtracting ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin" /> : resumeText ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Upload className="w-5 h-5 text-slate-400" />}
              <div>
                <p className="text-sm font-medium text-slate-700">{isExtracting ? "Processando..." : resumeFile ? resumeFile.name : resumeText ? "CV carregado ✓" : "Clique para upload do CV"}</p>
                <p className="text-xs text-slate-400">{resumeText ? `${resumeText.length.toLocaleString()} caracteres extraídos` : "PDF, DOCX ou TXT"}</p>
              </div>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Vaga <span className="normal-case font-normal text-slate-400">(opcional)</span>
            </label>
            <div className="relative">
              <Textarea placeholder="Cole o link ou descrição da vaga — deixe em branco para análise geral" value={jobInput}
                onChange={e => setJobInput(e.target.value)} className="min-h-20 text-sm bg-slate-50 border-slate-300 resize-none" />
              {jobInput && <button onClick={() => setJobInput("")} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>

          <Button onClick={() => analyzeMutation.mutate({ resumeText, jobUrl: jobInput.trim() || "", targetPositions: project.targetPositions || "" })}
            disabled={analyzeMutation.isPending || !resumeText}
            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-semibold py-3 rounded-xl">
            {analyzeMutation.isPending
              ? <span className="flex items-center gap-2 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Analisando com IA...</span>
              : <span className="flex items-center gap-2 justify-center"><Zap className="w-4 h-4" />{jobInput.trim() ? "Analisar para esta vaga" : "Analisar CV (geral)"}</span>}
          </Button>
        </div>

        {/* Results */}
        {results && (
          <ResultsPanel results={results} client={client} genCV={genCV} genReport={genReport}
            setGenCV={setGenCV} setGenReport={setGenReport} />
        )}
      </div>
    </div>
  );
}

// ── Results Panel (extracted for clarity) ────────────────────────────────────
function ResultsPanel({ results, client, genCV, genReport, setGenCV, setGenReport }: {
  results: AnalysisResult; client: Client;
  genCV: boolean; genReport: boolean;
  setGenCV: (v: boolean) => void; setGenReport: (v: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<"analise" | "linkedin" | "salario">("analise");

  const whatsappMsg = `Olá ${client.name.split(" ")[0]}! 👋\n\nConclui a análise do teu CV.\n\n📊 Score ATS: ${results.atsScore ?? results.matchScore}/100\n🎯 Score optimizado: ${results.projectedMatchScore}/100\n\nEnvio agora o CV optimizado e o relatório completo. 🚀`;

  const tabs = [
    { id: "analise",  label: "📊 Análise ATS" },
    { id: "linkedin", label: "💼 LinkedIn" },
    { id: "salario",  label: "💰 Salário" },
  ] as const;

  return (
    <>
      {/* Score header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Score ATS", value: results.atsScore ?? results.matchScore, suffix: "/100" },
            { label: "Projetado",  value: results.projectedMatchScore, suffix: "/100" },
            { label: "Ganho",      value: `+${Math.round(results.projectedMatchScore - (results.atsScore ?? results.matchScore))}`, suffix: " pts" },
          ].map(m => {
            const v = typeof m.value === "number" ? m.value : 0;
            const color = typeof m.value === "number" ? (v >= 75 ? "text-green-600" : v >= 55 ? "text-amber-600" : "text-red-600") : "text-blue-700";
            return (
              <div key={m.label} className="text-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-400 mb-1">{m.label}</p>
                <p className={`text-xl font-bold ${color}`}>{m.value}<span className="text-xs font-normal text-slate-400">{m.suffix}</span></p>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-all ${
                activeTab === t.id ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Análise ATS */}
      {activeTab === "analise" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          {results.keywords?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Keywords encontradas</p>
              <div className="flex flex-wrap gap-1.5">
                {results.keywords.slice(0, 16).map((k, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">{k}</span>
                ))}
              </div>
            </div>
          )}
          {(results.missingKeywords?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Keywords em falta</p>
              <div className="flex flex-wrap gap-1.5">
                {results.missingKeywords!.slice(0, 12).map((k, i) => (
                  <span key={i} className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">{k}</span>
                ))}
              </div>
            </div>
          )}
          {(results.strengths?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Pontos fortes</p>
              <ul className="space-y-1">
                {results.strengths!.slice(0, 5).map((s, i) => (
                  <li key={i} className="text-xs text-slate-700 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {results.suggestions?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recomendações</p>
              <ul className="space-y-1.5">
                {results.suggestions.slice(0, 5).map((s, i) => (
                  <li key={i} className="text-xs text-slate-700 flex gap-2"><span className="text-amber-500 flex-shrink-0">→</span>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {results.careerTrajectory && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Trajectória de carreira</p>
              <p className="text-xs text-slate-600 leading-relaxed">{results.careerTrajectory}</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: LinkedIn */}
      {activeTab === "linkedin" && results.linkedinOptimization && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <Linkedin className="w-4 h-4 text-blue-700" />
            <h3 className="font-semibold text-slate-800 text-sm">Optimização do LinkedIn</h3>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">📌 Headline</p>
            <p className="text-sm text-blue-900 font-medium leading-relaxed">{results.linkedinOptimization.headline}</p>
            <button onClick={() => { navigator.clipboard.writeText(results.linkedinOptimization!.headline); toast.success("Headline copiada!"); }}
              className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1">
              📋 Copiar headline
            </button>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">📝 Resumo / About</p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-48 overflow-y-auto">
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{results.linkedinOptimization.about}</p>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(results.linkedinOptimization!.about); toast.success("About copiado!"); }}
              className="mt-1.5 text-xs text-blue-600 hover:underline flex items-center gap-1">
              📋 Copiar texto completo
            </button>
          </div>

          {results.linkedinOptimization.featuredSection && (
            <div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">⭐ Secção em Destaque</p>
              <p className="text-xs text-slate-600 leading-relaxed">{results.linkedinOptimization.featuredSection}</p>
            </div>
          )}

          {results.linkedinOptimization.skillsToAdd?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">🏷️ Skills a adicionar</p>
              <div className="flex flex-wrap gap-1.5">
                {results.linkedinOptimization.skillsToAdd.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}

          {results.linkedinOptimization.profileTips?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">💡 Dicas de perfil</p>
              <ul className="space-y-2">
                {results.linkedinOptimization.profileTips.map((tip, i) => (
                  <li key={i} className="text-xs text-slate-700 flex gap-2 leading-relaxed">
                    <span className="text-blue-500 flex-shrink-0 font-bold">{i + 1}.</span>{tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {activeTab === "linkedin" && !results.linkedinOptimization && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <Linkedin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Re-execute a análise para obter a optimização do LinkedIn</p>
        </div>
      )}

      {/* Tab: Salário */}
      {activeTab === "salario" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          {results.salaryRange ? (
            <>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Inteligência Salarial — Mercado BR 2025</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs text-blue-600 font-semibold mb-1">Regime CLT</p>
                  <p className="text-lg font-bold text-blue-900">
                    R$ {(results.salaryRange.cltMin / 1000).toFixed(0)}k – R$ {(results.salaryRange.cltMax / 1000).toFixed(0)}k
                  </p>
                  <p className="text-xs text-blue-500 mt-0.5">Bruto mensal</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-xs text-green-600 font-semibold mb-1">Regime PJ</p>
                  <p className="text-lg font-bold text-green-900">
                    R$ {(results.salaryRange.pjMin / 1000).toFixed(0)}k – R$ {(results.salaryRange.pjMax / 1000).toFixed(0)}k
                  </p>
                  <p className="text-xs text-green-500 mt-0.5">Gross mensal</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 font-semibold mb-1">
                  Confiança: {results.salaryRange.confidence === "high" ? "🟢 Alta" : results.salaryRange.confidence === "medium" ? "🟡 Média" : "🔴 Baixa"}
                </p>
                {results.salaryRange.rationale && (
                  <p className="text-xs text-slate-600 leading-relaxed">{results.salaryRange.rationale}</p>
                )}
              </div>
              {(results.negotiationTips?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Estratégia de Negociação</p>
                  <ul className="space-y-2">
                    {results.negotiationTips!.map((tip, i) => (
                      <li key={i} className="text-xs text-slate-700 flex gap-2 leading-relaxed">
                        <span className="text-green-500 flex-shrink-0 font-bold">→</span>{tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">Dados salariais não disponíveis para esta análise</p>
          )}
        </div>
      )}

      {/* Delivery */}
      <div className="bg-gradient-to-br from-slate-900 to-blue-900 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1"><Star className="w-4 h-4 text-yellow-400" /><h2 className="font-bold text-white text-sm">Pacote de Entrega</h2></div>
        <p className="text-blue-300 text-xs mb-5">Para: {client.name}</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white/10 border border-white/20 rounded-xl p-4">
            <FileText className="w-5 h-5 text-blue-300 mb-2" />
            <p className="text-white font-semibold text-sm mb-1">CV Optimizado</p>
            <p className="text-blue-300 text-xs mb-3">Formato ATS-friendly</p>
            <Button onClick={async () => { setGenCV(true); try { await generateResumePDF(results.optimizedResume, "pt"); toast.success("PDF gerado!"); } catch { toast.error("Erro ao gerar PDF"); } finally { setGenCV(false); } }}
              disabled={genCV} size="sm" className="w-full bg-white text-blue-900 hover:bg-blue-50 text-xs font-semibold gap-1.5">
              {genCV ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}{genCV ? "A gerar..." : "Exportar CV PDF"}
            </Button>
          </div>
          <div className="bg-white/10 border border-white/20 rounded-xl p-4">
            <TrendingUp className="w-5 h-5 text-green-300 mb-2" />
            <p className="text-white font-semibold text-sm mb-1">Relatório Profissional</p>
            <p className="text-blue-300 text-xs mb-3">ATS + LinkedIn + Salário</p>
            <Button onClick={async () => { setGenReport(true); try { await generateClientReport(results, client.name); toast.success("Relatório aberto!"); } catch { toast.error("Erro ao gerar relatório"); } finally { setGenReport(false); } }}
              disabled={genReport} size="sm" className="w-full bg-green-500 hover:bg-green-400 text-white text-xs font-semibold gap-1.5">
              {genReport ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}{genReport ? "A gerar..." : "Gerar Relatório PDF"}
            </Button>
          </div>
        </div>
        {client.whatsapp && (
          <div className="bg-white/10 border border-white/20 rounded-xl p-4">
            <p className="text-xs text-green-300 font-semibold mb-2 flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />Mensagem pronta</p>
            <p className="text-xs text-white/70 leading-relaxed mb-3 whitespace-pre-line">{whatsappMsg}</p>
            <div className="flex gap-2">
              <a href={`https://wa.me/${client.whatsapp.replace(/\D/g,"")}?text=${encodeURIComponent(whatsappMsg)}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white text-xs font-semibold px-3 py-2 rounded-lg">
                <MessageCircle className="w-3.5 h-3.5" />WhatsApp
              </a>
              {client.email && (
                <a href={`mailto:${client.email}?subject=CV Optimizado + Relatório&body=${encodeURIComponent(`Olá ${client.name.split(" ")[0]},\n\nSegue em anexo o CV optimizado e o relatório completo.\n\nScore ATS: ${results.atsScore ?? results.matchScore}/100 → ${results.projectedMatchScore}/100.\n\nAbração,\nLeone`)}`}
                  className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-lg">
                  <Mail className="w-3.5 h-3.5" />E-mail
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CLIENT DETAIL
// ═══════════════════════════════════════════════════════════════════

function ClientDetail({ client, projects, onBack, onNewProject, onEditProject, onDeleteProject,
  onStatusChange, onEditClient, onAnalyze, onCompare }: {
  client: Client; projects: Project[]; onBack: () => void;
  onNewProject: () => void; onEditProject: (p: Project) => void;
  onDeleteProject: (id: string) => void; onStatusChange: (id: string, s: Status) => void;
  onEditClient: () => void; onAnalyze: (p: Project) => void; onCompare: (p: Project) => void;
}) {
  const cp        = projects.filter(p => p.clientId === client.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const totalPaid = cp.filter(p => p.status === "pago").reduce((s, p) => s + p.valor, 0);

  // Quick status update for the most recent active project
  const activeProject = cp.find(p => !["pago","cancelado"].includes(p.status));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-300 hover:text-white text-sm mb-3 transition-colors">
            <ArrowLeft className="w-4 h-4" />Voltar aos clientes
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">{initials(client.name)}</div>
              <div>
                <h1 className="text-white font-bold text-lg">{client.name}</h1>
                <p className="text-blue-300 text-xs">{cp.length} projecto{cp.length !== 1 ? "s" : ""}{totalPaid > 0 ? ` · ${fmt(totalPaid)} pagos` : ""}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={onEditClient} className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium px-3 py-2 rounded-lg">
                <Edit2 className="w-3.5 h-3.5" />Editar
              </button>
              <Button onClick={onNewProject} className="bg-white text-blue-900 hover:bg-blue-50 gap-2 text-xs font-semibold">
                <Plus className="w-3.5 h-3.5" />Novo projecto
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* Contact + quick status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Contacto</h2>
          <div className="grid grid-cols-2 gap-3">
            {client.email && <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline"><Mail className="w-4 h-4 text-slate-400" />{client.email}</a>}
            {client.whatsapp && <a href={`https://wa.me/${client.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-green-600 hover:underline"><MessageCircle className="w-4 h-4 text-slate-400" />{client.whatsapp}</a>}
            {client.linkedin && <a href={client.linkedin.startsWith("http") ? client.linkedin : `https://${client.linkedin}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline col-span-2"><Linkedin className="w-4 h-4 text-slate-400" />{client.linkedin}</a>}
          </div>
          {client.notes && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Notas internas</p>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{client.notes}</p>
            </div>
          )}

          {/* Quick status update */}
          {activeProject && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Atualizar Status</p>
              <div className="flex gap-2 flex-wrap">
                {PIPELINE_STEPS.map(step => {
                  const cfg = STATUS_CONFIG[step];
                  const StIcon = cfg.icon;
                  const isActive = activeProject.status === step;
                  return (
                    <button key={step}
                      onClick={() => onStatusChange(activeProject.id, step)}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                        isActive ? `${cfg.cor} border-current shadow-sm` : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}>
                      <StIcon className="w-3 h-3" />{cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Projects */}
        <div>
          <p className="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-blue-600" />Projectos ({cp.length})
          </p>
          {cp.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center">
              <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-3">Nenhum projecto ainda</p>
              <Button onClick={onNewProject} size="sm" className="bg-blue-700 hover:bg-blue-800 text-white gap-2">
                <Plus className="w-3.5 h-3.5" />Criar primeiro projecto
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {cp.map(p => (
                <ProjectCard key={p.id} project={p}
                  onEdit={() => onEditProject(p)}
                  onDelete={() => onDeleteProject(p.id)}
                  onStatusChange={s => onStatusChange(p.id, s)}
                  onAnalyze={() => onAnalyze(p)}
                  onCompare={() => onCompare(p)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════

type View = "list" | "detail" | "analysis" | "compare";

export default function ClientDashboard() {
  const [clients,      setClients]      = useState<Client[]>([]);
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [view,         setView]         = useState<View>("list");
  const [selClientId,  setSelClientId]  = useState<string | null>(null);
  const [selProjectId, setSelProjectId] = useState<string | null>(null);
  const [clientModal,  setClientModal]  = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [editClient,   setEditClient]   = useState<Client | undefined>();
  const [editProject,  setEditProject]  = useState<Project | undefined>();
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState<Status | "todos">("todos");

  useEffect(() => { setClients(loadClients()); setProjects(loadProjects()); }, []);

  const persistC = (next: Client[])  => { setClients(next);  saveClients(next); };
  const persistP = (next: Project[]) => { setProjects(next); saveProjects(next); };

  function handleSaveClient(c: Client) {
    const i = clients.findIndex(x => x.id === c.id);
    persistC(i >= 0 ? clients.map(x => x.id === c.id ? c : x) : [c, ...clients]);
    toast.success(i >= 0 ? "Cliente actualizado!" : "Cliente adicionado!");
  }

  function handleDeleteClient(id: string) {
    if (!confirm("Remover este cliente e todos os seus projectos?")) return;
    persistC(clients.filter(c => c.id !== id));
    persistP(projects.filter(p => p.clientId !== id));
    if (selClientId === id) { setView("list"); setSelClientId(null); }
    toast.success("Cliente removido.");
  }

  function handleSaveProject(p: Project) {
    const i = projects.findIndex(x => x.id === p.id);
    persistP(i >= 0 ? projects.map(x => x.id === p.id ? p : x) : [p, ...projects]);
    toast.success(i >= 0 ? "Projecto actualizado!" : "Projecto criado!");
  }

  function handleDeleteProject(id: string) {
    if (!confirm("Remover este projecto?")) return;
    persistP(projects.filter(p => p.id !== id));
    toast.success("Projecto removido.");
  }

  function handleStatusChange(projectId: string, status: Status) {
    persistP(projects.map(p => p.id === projectId ? { ...p, status, updatedAt: new Date().toISOString() } : p));
    toast.success(`Status → ${STATUS_CONFIG[status].label}`);
  }

  function handleAnalysisComplete(projectId: string, atsScore: number, jobTitle: string, cvOriginal: string, cvOptimized: string, analysis: AnalysisResult) {
    persistP(projects.map(p => p.id === projectId
      ? { ...p, atsScore, jobTitle: jobTitle || p.jobTitle, cvOriginal, cvOptimized, lastAnalysis: analysis, status: "entregue", updatedAt: new Date().toISOString() }
      : p));
    toast.success("Score guardado · Status → Entregue");
  }

  const selClient  = clients.find(c => c.id === selClientId)  ?? null;
  const selProject = projects.find(p => p.id === selProjectId) ?? null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter(c => {
      const cp = projects.filter(p => p.clientId === c.id);
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
        || c.whatsapp.includes(q) || c.notes.toLowerCase().includes(q)
        || cp.some(p => p.jobTitle.toLowerCase().includes(q));
      const matchStatus = filterStatus === "todos" || cp.some(p => p.status === filterStatus);
      return matchSearch && matchStatus;
    });
  }, [clients, projects, search, filterStatus]);

  // ── Compare view ─────────────────────────────────────────────────
  if (view === "compare" && selProject?.cvOriginal && selProject?.cvOptimized) {
    return (
      <CVComparison
        original={selProject.cvOriginal}
        optimized={selProject.cvOptimized}
        onClose={() => { setView("detail"); }}
      />
    );
  }

  // ── Analysis view ─────────────────────────────────────────────────
  if (view === "analysis" && selClient && selProject) {
    return (
      <AnalysisPanel client={selClient} project={selProject}
        onBack={() => { setView("detail"); setSelProjectId(null); }}
        onComplete={(ats, jt, orig, opt, analysis) => {
          handleAnalysisComplete(selProject.id, ats, jt, orig, opt, analysis);
          setView("detail"); setSelProjectId(null);
        }} />
    );
  }

  // ── Detail view ───────────────────────────────────────────────────
  if (view === "detail" && selClient) {
    return (
      <>
        <ClientDetail client={selClient} projects={projects}
          onBack={() => { setView("list"); setSelClientId(null); }}
          onNewProject={() => { setEditProject(undefined); setProjectModal(true); }}
          onEditProject={p => { setEditProject(p); setProjectModal(true); }}
          onDeleteProject={handleDeleteProject}
          onStatusChange={handleStatusChange}
          onEditClient={() => { setEditClient(selClient); setClientModal(true); }}
          onAnalyze={p => { setSelProjectId(p.id); setView("analysis"); }}
          onCompare={p => { setSelProjectId(p.id); setView("compare"); }}
        />
        {projectModal && (
          <ProjectModal clientName={selClient.name} initial={editProject} clientId={selClient.id}
            onSave={handleSaveProject} onClose={() => setProjectModal(false)} />
        )}
        {clientModal && (
          <ClientModal initial={editClient} onSave={handleSaveClient} onClose={() => setClientModal(false)} />
        )}
      </>
    );
  }

  // ── List view ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-lg flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-300" />CRM de Clientes
            </h1>
            <p className="text-blue-300 text-xs mt-0.5">Leone Consultoria de Carreira</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => exportCSV(clients, projects)}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
              <Download className="w-3.5 h-3.5" />CSV
            </button>
            <Button onClick={() => { setEditClient(undefined); setClientModal(true); }}
              className="bg-white text-blue-900 hover:bg-blue-50 gap-2 font-semibold text-sm">
              <Plus className="w-4 h-4" />Novo cliente
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        <DashboardStats clients={clients} projects={projects} />

        {/* Pipeline summary */}
        {projects.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Pipeline</p>
            <div className="grid grid-cols-5 gap-2">
              {STATUS_ORDER.map(s => {
                const count = projects.filter(p => p.status === s).length;
                const cfg = STATUS_CONFIG[s];
                return (
                  <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "todos" : s)}
                    className={`text-center p-2 rounded-lg border transition-all ${filterStatus === s ? `${cfg.cor} border-current` : "border-slate-100 hover:border-slate-200 bg-slate-50"}`}>
                    <p className="text-lg font-bold text-slate-800">{count}</p>
                    <p className="text-[10px] text-slate-500 leading-tight">{cfg.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Pesquisar nome, e-mail, vaga, notas..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
          </div>
          {filterStatus !== "todos" && (
            <button onClick={() => setFilterStatus("todos")}
              className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border font-medium ${STATUS_CONFIG[filterStatus].cor}`}>
              {STATUS_CONFIG[filterStatus].label} <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* List */}
        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <User className="w-14 h-14 mb-4 opacity-20" />
            <p className="font-semibold text-slate-600 mb-1">Nenhum cliente ainda</p>
            <p className="text-sm mb-6">Adiciona o primeiro cliente para começar</p>
            <Button onClick={() => { setEditClient(undefined); setClientModal(true); }}
              className="bg-blue-700 hover:bg-blue-800 text-white gap-2">
              <Plus className="w-4 h-4" />Adicionar cliente
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Nenhum resultado para "{search}"</p>
            <button onClick={() => { setSearch(""); setFilterStatus("todos"); }} className="text-sm text-blue-600 hover:underline mt-1">Limpar filtros</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">{filtered.length} cliente{filtered.length !== 1 ? "s" : ""}</p>
            {filtered.map(c => (
              <ClientCard key={c.id} client={c} projects={projects}
                onOpen={() => { setSelClientId(c.id); setView("detail"); }}
                onEdit={() => { setEditClient(c); setClientModal(true); }}
                onDelete={() => handleDeleteClient(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      {clientModal && (
        <ClientModal initial={editClient} onSave={handleSaveClient} onClose={() => setClientModal(false)} />
      )}
    </div>
  );
}
