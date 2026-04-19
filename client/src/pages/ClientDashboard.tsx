/**
 * ClientDashboard.tsx
 * Painel de consultoria de carreira — Leone Consultoria de Carreira
 *
 * FLUXO COMPLETO:
 *   1. Gerir clientes (cadastro, status, pacotes, receita)
 *   2. Seleccionar cliente → abrir painel de análise
 *   3. Upload CV + vaga (opcional) → Analisar com IA
 *   4. Gerar pacote de entrega: PDF CV optimizado + Relatório PDF
 *   5. Status do cliente actualizado automaticamente
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Trash2, CheckCircle, Clock, AlertCircle,
  DollarSign, User, FileText, ChevronDown, ChevronUp,
  Search, Upload, Loader2, Zap, Download, X, ArrowLeft,
  MessageCircle, Mail, Star, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { extractTextFromFile } from "@/lib/fileExtractor";
import { generateResumePDF } from "@/lib/pdfGenerator";
import { generateClientReport } from "@/lib/clientReportGenerator";
import type { AnalysisResult } from "@/components/AnalysisLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "aguardando_cv" | "em_analise" | "entregue" | "pago" | "cancelado";
type Pacote = "cv_basico" | "cv_linkedin" | "premium";

interface Client {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  pacote: Pacote;
  status: Status;
  valor: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  atsScore?: number;
  jobTitle?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const LS_KEY = "easylab2_clients";

const PACOTES: Record<Pacote, { label: string; valor: number; cor: string; desc: string }> = {
  cv_basico:   { label: "CV Básico",     valor: 250, cor: "bg-slate-100 text-slate-700",   desc: "CV optimizado + Relatório PDF" },
  cv_linkedin: { label: "CV + LinkedIn", valor: 450, cor: "bg-blue-100 text-blue-700",     desc: "CV + LinkedIn + Relatório PDF" },
  premium:     { label: "Premium",       valor: 750, cor: "bg-purple-100 text-purple-700", desc: "CV + LinkedIn + Estratégia completa" },
};

const STATUS_CONFIG: Record<Status, { label: string; cor: string; icon: React.ElementType }> = {
  aguardando_cv: { label: "Aguardando CV",  cor: "bg-amber-100 text-amber-700",    icon: Clock },
  em_analise:    { label: "Em análise",     cor: "bg-blue-100 text-blue-700",      icon: AlertCircle },
  entregue:      { label: "Entregue",       cor: "bg-green-100 text-green-700",    icon: CheckCircle },
  pago:          { label: "Pago ✓",         cor: "bg-emerald-100 text-emerald-800", icon: DollarSign },
  cancelado:     { label: "Cancelado",      cor: "bg-red-100 text-red-700",        icon: Trash2 },
};

const STATUS_ORDER: Status[] = ["aguardando_cv", "em_analise", "entregue", "pago", "cancelado"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadClients(): Client[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; }
}
function saveClients(clients: Client[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(clients));
}
function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ─── Modal de criação/edição ──────────────────────────────────────────────────

function ClientModal({ initial, onSave, onClose }: {
  initial?: Client; onSave: (c: Client) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<Client, "id" | "createdAt" | "updatedAt">>({
    name:     initial?.name     ?? "",
    email:    initial?.email    ?? "",
    whatsapp: initial?.whatsapp ?? "",
    pacote:   initial?.pacote   ?? "cv_linkedin",
    status:   initial?.status   ?? "aguardando_cv",
    valor:    initial?.valor    ?? PACOTES.cv_linkedin.valor,
    notes:    initial?.notes    ?? "",
    atsScore: initial?.atsScore,
    jobTitle: initial?.jobTitle ?? "",
  });

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  function handleSave() {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    const now = new Date().toISOString();
    onSave({ ...form, id: initial?.id ?? newId(), createdAt: initial?.createdAt ?? now, updatedAt: now });
    onClose();
  }

  const inputCls = "w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
  const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-4">
          <h2 className="text-white font-semibold">{initial ? "Editar cliente" : "Novo cliente"}</h2>
        </div>
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Nome completo *</label>
              <input className={inputCls} value={form.name}
                onChange={e => set("name", e.target.value)} placeholder="Maria Silva" />
            </div>
            <div>
              <label className={labelCls}>E-mail</label>
              <input className={inputCls} value={form.email}
                onChange={e => set("email", e.target.value)} placeholder="maria@email.com" />
            </div>
            <div>
              <label className={labelCls}>WhatsApp</label>
              <input className={inputCls} value={form.whatsapp}
                onChange={e => set("whatsapp", e.target.value)} placeholder="+55 11 99999-0000" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Pacote</label>
              <select className={inputCls} value={form.pacote}
                onChange={e => { const p = e.target.value as Pacote; set("pacote", p); set("valor", PACOTES[p].valor); }}>
                {Object.entries(PACOTES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label} — {fmt(v.valor)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Valor (R$)</label>
              <input className={inputCls} type="number" value={form.valor}
                onChange={e => set("valor", Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={form.status}
                onChange={e => set("status", e.target.value as Status)}>
                {STATUS_ORDER.map(s => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Vaga-alvo</label>
              <input className={inputCls} value={form.jobTitle ?? ""}
                onChange={e => set("jobTitle", e.target.value)} placeholder="Senior PM, Dev React..." />
            </div>
          </div>

          <div>
            <label className={labelCls}>Notas internas</label>
            <textarea className={`${inputCls} min-h-20 resize-y`} value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Contexto, observações, histórico da conversa..." />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 bg-blue-700 hover:bg-blue-800 text-white" onClick={handleSave}>
            {initial ? "Guardar alterações" : "Adicionar cliente"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de análise do cliente ─────────────────────────────────────────────

function ClientAnalysisPanel({ client, onBack, onComplete }: {
  client: Client;
  onBack: () => void;
  onComplete: (atsScore: number, jobTitle: string) => void;
}) {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jobInput, setJobInput] = useState(client.jobTitle ?? "");
  const [isExtracting, setIsExtracting] = useState(false);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [isGeneratingCV, setIsGeneratingCV] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const analyzeMutation = trpc.resume.analyze.useMutation({
    onSuccess: (data: AnalysisResult) => {
      setResults(data);
      toast.success("Análise concluída!");
      // Actualiza o cliente automaticamente com score e vaga
      onComplete(data.atsScore ?? data.matchScore, data.jobTitle ?? jobInput);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setIsExtracting(true);
    try {
      const text = await extractTextFromFile(file);
      setResumeText(text);
      toast.success("CV carregado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar arquivo");
    } finally { setIsExtracting(false); }
  };

  const handleAnalyze = () => {
    if (!resumeText) { toast.error("Carrega o CV primeiro"); return; }
    analyzeMutation.mutate({ resumeText, jobUrl: jobInput.trim() || "" });
  };

  const handleDownloadCV = async () => {
    if (!results) return;
    setIsGeneratingCV(true);
    try {
      await generateResumePDF(results.optimizedResume, client.name);
      toast.success("CV PDF gerado!");
    } catch { toast.error("Erro ao gerar CV"); }
    finally { setIsGeneratingCV(false); }
  };

  const handleDownloadReport = async () => {
    if (!results) return;
    setIsGeneratingReport(true);
    try {
      await generateClientReport(results, client.name);
      toast.success("Relatório PDF gerado!");
    } catch { toast.error("Erro ao gerar relatório"); }
    finally { setIsGeneratingReport(false); }
  };

  const isAnalyzing = analyzeMutation.isPending;
  const pkg = PACOTES[client.pacote];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-300 hover:text-white text-sm mb-3 transition-colors">
            <ArrowLeft className="w-4 h-4" />Voltar aos clientes
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">
                {client.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div>
                <h1 className="text-white font-bold">{client.name}</h1>
                <p className="text-blue-300 text-xs">{pkg.label} · {fmt(client.valor)} · {pkg.desc}</p>
              </div>
            </div>
            {client.whatsapp && (
              <a href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`}
                target="_blank" rel="noreferrer"
                className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                <MessageCircle className="w-3.5 h-3.5" />WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* Inputs */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-600" />Análise de CV
          </h2>

          {/* Upload CV */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Currículo do cliente
            </label>
            <input type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" id="cv-upload-client" />
            <label htmlFor="cv-upload-client"
              className={`flex items-center gap-3 p-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                resumeText ? "border-green-300 bg-green-50" : "border-slate-300 hover:border-blue-400 bg-slate-50"
              }`}>
              {isExtracting ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                : resumeText ? <CheckCircle className="w-5 h-5 text-green-500" />
                : <Upload className="w-5 h-5 text-slate-400" />}
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {isExtracting ? "Processando..." : resumeFile ? resumeFile.name : "Clique para fazer upload do CV"}
                </p>
                <p className="text-xs text-slate-400">{resumeText ? `${resumeText.length.toLocaleString()} caracteres extraídos` : "PDF, DOCX ou TXT"}</p>
              </div>
            </label>
          </div>

          {/* Vaga alvo */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Vaga alvo <span className="normal-case font-normal text-slate-400">(opcional — deixe em branco para análise geral)</span>
            </label>
            <div className="relative">
              <Textarea
                placeholder="Cole o link da vaga (Gupy, etc.) ou o título/descrição da posição"
                value={jobInput}
                onChange={e => setJobInput(e.target.value)}
                className="min-h-24 text-sm bg-slate-50 border-slate-300"
              />
              {jobInput && (
                <button onClick={() => setJobInput("")} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Botão analisar */}
          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !resumeText}
            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-semibold py-3 rounded-xl text-sm"
          >
            {isAnalyzing ? (
              <span className="flex items-center gap-2 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />Analisando com IA...
              </span>
            ) : (
              <span className="flex items-center gap-2 justify-center">
                <Zap className="w-4 h-4" />{jobInput.trim() ? "Analisar CV para esta vaga" : "Analisar CV (análise geral)"}
              </span>
            )}
          </Button>

          {isAnalyzing && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-xs text-blue-700 text-center">Motor ATS + 4 camadas de inteligência a processar...</p>
            </div>
          )}
        </div>

        {/* Resultados + Entrega */}
        {results && (
          <>
            {/* Score summary */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />Resultados da Análise
              </h2>

              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: "Score ATS", value: results.atsScore ?? results.matchScore, suffix: "/100" },
                  { label: "Score Projetado", value: results.projectedMatchScore, suffix: "/100" },
                  { label: "Ganho esperado", value: `+${Math.round(results.projectedMatchScore - (results.atsScore ?? results.matchScore))}`, suffix: " pts" },
                ].map(m => {
                  const v = typeof m.value === "number" ? m.value : 0;
                  const color = typeof m.value === "number"
                    ? v >= 75 ? "text-green-600" : v >= 55 ? "text-amber-600" : "text-red-600"
                    : "text-blue-700";
                  return (
                    <div key={m.label} className="text-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-400 mb-1">{m.label}</p>
                      <p className={`text-2xl font-bold ${color}`}>{m.value}<span className="text-sm font-normal text-slate-400">{m.suffix}</span></p>
                    </div>
                  );
                })}
              </div>

              {results.jobTitle && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg mb-4">
                  <p className="text-xs text-blue-600 font-semibold">{results.jobTitle}</p>
                  {results.seniorityLevel && <p className="text-xs text-blue-500">{results.seniorityLevel}</p>}
                </div>
              )}

              {/* Keywords */}
              {results.keywords && results.keywords.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Keywords identificadas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {results.keywords.slice(0, 12).map((k, i) => (
                      <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">{k}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing keywords */}
              {results.missingKeywords && results.missingKeywords.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">A adicionar ao CV</p>
                  <div className="flex flex-wrap gap-1.5">
                    {results.missingKeywords.slice(0, 8).map((k, i) => (
                      <span key={i} className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">{k}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Pacote de entrega */}
            <div className="bg-gradient-to-br from-slate-900 to-blue-900 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-yellow-400" />
                <h2 className="font-bold text-white">Pacote de Entrega</h2>
              </div>
              <p className="text-blue-300 text-xs mb-5">Gera os documentos para entregar ao cliente — {client.name}</p>

              <div className="grid grid-cols-2 gap-3">
                {/* CV Optimizado */}
                <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                  <FileText className="w-6 h-6 text-blue-300 mb-2" />
                  <p className="text-white font-semibold text-sm mb-1">CV Optimizado</p>
                  <p className="text-blue-300 text-xs mb-3">Formato ATS-friendly, pronto a usar</p>
                  <Button
                    onClick={handleDownloadCV}
                    disabled={isGeneratingCV}
                    className="w-full bg-white text-blue-900 hover:bg-blue-50 text-xs font-semibold gap-2"
                    size="sm"
                  >
                    {isGeneratingCV ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {isGeneratingCV ? "A gerar..." : "Descarregar CV PDF"}
                  </Button>
                </div>

                {/* Relatório */}
                <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                  <TrendingUp className="w-6 h-6 text-green-300 mb-2" />
                  <p className="text-white font-semibold text-sm mb-1">Relatório de Análise</p>
                  <p className="text-blue-300 text-xs mb-3">Documento executivo com score, salário e estratégia</p>
                  <Button
                    onClick={handleDownloadReport}
                    disabled={isGeneratingReport}
                    className="w-full bg-green-500 hover:bg-green-400 text-white text-xs font-semibold gap-2"
                    size="sm"
                  >
                    {isGeneratingReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {isGeneratingReport ? "A gerar..." : "Descarregar Relatório"}
                  </Button>
                </div>
              </div>

              {/* Mensagem WhatsApp */}
              {client.whatsapp && (
                <div className="mt-4 p-3 bg-white/10 border border-white/20 rounded-xl">
                  <p className="text-xs text-blue-300 font-semibold mb-2 flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5" />Mensagem de entrega pronta
                  </p>
                  <p className="text-xs text-white/80 leading-relaxed mb-2">
                    "Olá {client.name.split(" ")[0]}! Acabei de concluir a análise do teu CV. O score ATS actual é {results.atsScore ?? results.matchScore}/100 e com as optimizações aplicadas sobe para {results.projectedMatchScore}/100. Envio agora os dois documentos: CV optimizado e relatório completo de análise. 🚀"
                  </p>
                  <a
                    href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá ${client.name.split(" ")[0]}! Acabei de concluir a análise do teu CV. O score ATS actual é ${results.atsScore ?? results.matchScore}/100 e com as optimizações aplicadas sobe para ${results.projectedMatchScore}/100. Envio agora os dois documentos: CV optimizado e relatório completo de análise. 🚀`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white text-xs font-semibold px-3 py-2 rounded-lg w-fit transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />Abrir WhatsApp
                  </a>
                </div>
              )}

              {/* Mensagem Email */}
              {client.email && (
                <div className="mt-3">
                  <a
                    href={`mailto:${client.email}?subject=Análise CV concluída — ${client.name}&body=Olá ${client.name.split(" ")[0]},%0A%0ASegue em anexo o teu CV optimizado e o relatório completo de análise de carreira.%0A%0AScore ATS actual: ${results.atsScore ?? results.matchScore}/100%0AScore projectado: ${results.projectedMatchScore}/100%0A%0AQualquer dúvida, estou disponível.%0A%0AAbração,%0ALeone`}
                    className="flex items-center gap-2 text-blue-300 hover:text-white text-xs transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />Abrir e-mail de entrega
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Card de cliente ──────────────────────────────────────────────────────────

function ClientCard({ client, onEdit, onDelete, onStatusChange, onAnalyze }: {
  client: Client;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: Status) => void;
  onAnalyze: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const st = STATUS_CONFIG[client.status];
  const pkg = PACOTES[client.pacote];
  const StIcon = st.icon;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-blue-900 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              {client.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 text-sm truncate">{client.name}</p>
              {client.jobTitle && <p className="text-xs text-slate-400 truncate">{client.jobTitle}</p>}
              {client.atsScore !== undefined && (
                <p className={`text-xs font-bold mt-0.5 ${client.atsScore >= 75 ? "text-green-600" : client.atsScore >= 55 ? "text-amber-600" : "text-red-600"}`}>
                  ATS {client.atsScore}/100
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${pkg.cor}`}>{pkg.label}</span>
            <span className="text-sm font-bold text-slate-800">{fmt(client.valor)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1.5">
            <StIcon className="w-3.5 h-3.5" />
            <select
              value={client.status}
              onChange={e => onStatusChange(e.target.value as Status)}
              className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${st.cor}`}
            >
              {STATUS_ORDER.map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">{fmtDate(client.createdAt)}</span>
            {/* Botão principal — Analisar CV */}
            <Button size="sm" onClick={onAnalyze}
              className="text-xs gap-1 bg-blue-700 hover:bg-blue-800 text-white h-7">
              <Zap className="w-3 h-3" />Analisar
            </Button>
            <button onClick={() => setExpanded(!expanded)}
              className="p-1 text-slate-400 hover:text-slate-600">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          {client.email && (
            <div className="flex gap-2 text-xs">
              <span className="text-slate-400 w-20">E-mail</span>
              <a href={`mailto:${client.email}`} className="text-blue-600 hover:underline">{client.email}</a>
            </div>
          )}
          {client.whatsapp && (
            <div className="flex gap-2 text-xs">
              <span className="text-slate-400 w-20">WhatsApp</span>
              <a href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`}
                target="_blank" rel="noreferrer"
                className="text-green-600 hover:underline">{client.whatsapp}</a>
            </div>
          )}
          {client.notes && (
            <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 leading-relaxed">
              {client.notes}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="text-xs gap-1.5 flex-1" onClick={onEdit}>
              <FileText className="w-3.5 h-3.5" />Editar
            </Button>
            <Button size="sm" variant="outline"
              className="text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
              onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5" />Remover
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ClientDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Client | undefined>();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Status | "todos">("todos");
  const [analysisClient, setAnalysisClient] = useState<Client | null>(null);

  useEffect(() => { setClients(loadClients()); }, []);

  function persist(next: Client[]) { setClients(next); saveClients(next); }

  function handleSave(c: Client) {
    const existing = clients.findIndex(x => x.id === c.id);
    const next = existing >= 0 ? clients.map(x => x.id === c.id ? c : x) : [c, ...clients];
    persist(next);
    toast.success(existing >= 0 ? "Cliente actualizado!" : "Cliente adicionado!");
  }

  function handleDelete(id: string) {
    if (!confirm("Remover este cliente?")) return;
    persist(clients.filter(c => c.id !== id));
    toast.success("Removido.");
  }

  function handleStatusChange(id: string, status: Status) {
    persist(clients.map(c => c.id === id ? { ...c, status, updatedAt: new Date().toISOString() } : c));
  }

  // Callback quando análise termina — actualiza ATS score e status
  function handleAnalysisComplete(clientId: string, atsScore: number, jobTitle: string) {
    persist(clients.map(c => c.id === clientId
      ? { ...c, atsScore, jobTitle: jobTitle || c.jobTitle, status: "entregue", updatedAt: new Date().toISOString() }
      : c
    ));
    toast.success("Cliente actualizado para 'Entregue'!");
  }

  const filtered = clients.filter(c => {
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.jobTitle ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "todos" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalReceita  = clients.filter(c => c.status === "pago").reduce((s, c) => s + c.valor, 0);
  const totalPendente = clients.filter(c => c.status === "entregue").reduce((s, c) => s + c.valor, 0);
  const totalAtivos   = clients.filter(c => !["cancelado", "pago"].includes(c.status)).length;

  // ── Se um cliente está seleccionado para análise, mostra o painel ────────────
  if (analysisClient) {
    const current = clients.find(c => c.id === analysisClient.id) ?? analysisClient;
    return (
      <ClientAnalysisPanel
        client={current}
        onBack={() => setAnalysisClient(null)}
        onComplete={(atsScore, jobTitle) => {
          handleAnalysisComplete(current.id, atsScore, jobTitle);
          setAnalysisClient(null);
        }}
      />
    );
  }

  // ── Lista de clientes ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-lg">Clientes</h1>
            <p className="text-blue-300 text-xs mt-0.5">Leone Consultoria de Carreira</p>
          </div>
          <Button onClick={() => { setEditTarget(undefined); setModalOpen(true); }}
            className="bg-white text-blue-900 hover:bg-blue-50 gap-2 font-semibold text-sm">
            <Plus className="w-4 h-4" />Novo cliente
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* Métricas */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Receita recebida", value: fmt(totalReceita),   sub: `${clients.filter(c => c.status === "pago").length} pagos`,          color: "text-green-600" },
            { label: "A receber",        value: fmt(totalPendente),  sub: `${clients.filter(c => c.status === "entregue").length} por cobrar`,   color: "text-amber-600" },
            { label: "Em andamento",     value: String(totalAtivos), sub: "clientes activos",                                                    color: "text-blue-700" },
          ].map(m => (
            <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1">{m.label}</p>
              <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar por nome, e-mail ou vaga..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as Status | "todos")}
            className="text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="todos">Todos os status</option>
            {STATUS_ORDER.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>

        {/* Lista */}
        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <User className="w-14 h-14 mb-4 opacity-20" />
            <p className="font-semibold text-slate-600 mb-1">Nenhum cliente ainda</p>
            <p className="text-sm mb-6">Adiciona o primeiro cliente para começar</p>
            <Button onClick={() => { setEditTarget(undefined); setModalOpen(true); }}
              className="bg-blue-700 hover:bg-blue-800 text-white gap-2">
              <Plus className="w-4 h-4" />Adicionar cliente
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p>Nenhum cliente encontrado para "{search}"</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => (
              <ClientCard
                key={c.id}
                client={c}
                onEdit={() => { setEditTarget(c); setModalOpen(true); }}
                onDelete={() => handleDelete(c.id)}
                onStatusChange={s => handleStatusChange(c.id, s)}
                onAnalyze={() => setAnalysisClient(c)}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <ClientModal
          initial={editTarget}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
