import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Download, RotateCcw, FileText, Copy } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { generatePremiumReportPDF, type PremiumReportData } from "@/lib/premiumReportPdf";

const STORAGE_KEY = "easylab2_premium_report_v1";

export default function PremiumReportPage() {
  const [clientName, setClientName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [report, setReport] = useState<PremiumReportData | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.report) setReport(parsed.report);
        if (parsed.clientName) setClientName(parsed.clientName);
      }
    } catch {
      // ignore
    }
  }, []);

  const mutation = trpc.premiumReport.generate.useMutation({
    onSuccess: (data: { report: PremiumReportData }) => {
      setReport(data.report);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ report: data.report, clientName }));
      } catch {
        // ignore
      }
      toast.success("Relatório premium gerado com sucesso");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: { message: string }) => toast.error("Erro: " + err.message),
  });

  const canGenerate =
    clientName.trim().length > 0 &&
    resumeText.trim().length >= 50 &&
    linkedinText.trim().length >= 50 &&
    !mutation.isPending;

  function handleGenerate() {
    if (!canGenerate) {
      toast.error("Preencha nome, CV (50+ chars) e LinkedIn (50+ chars)");
      return;
    }
    mutation.mutate({
      clientName: clientName.trim(),
      resumeText: resumeText.trim(),
      linkedinText: linkedinText.trim(),
      targetRole: targetRole.trim() || undefined,
    });
  }

  function handleExportPDF() {
    if (!report) return;
    try {
      const doc = generatePremiumReportPDF(report);
      const safeName = report.clientName.replace(/[^a-zA-Z0-9]/g, "_");
      doc.save(`Relatorio_Premium_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF exportado");
    } catch (err) {
      toast.error("Erro ao exportar PDF: " + (err as Error).message);
    }
  }

  function handleReset() {
    if (!confirm("Limpar relatório e dados do cliente atual?")) return;
    setReport(null);
    setClientName("");
    setResumeText("");
    setLinkedinText("");
    setTargetRole("");
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b bg-[#1B2F4A] border-[#C8A15E]/40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-0.5">
              <span className="text-white font-serif text-xl font-bold" style={{ fontFamily: "'Cinzel', serif" }}>L</span>
              <span className="text-[#C8A15E] font-serif text-lg font-bold" style={{ fontFamily: "'Cinzel', serif" }}>B</span>
            </div>
            <div className="h-8 w-px bg-white/30" />
            <div>
              <div className="text-white font-bold text-sm" style={{ fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>LEONE BERTO</div>
              <div className="text-[#C8A15E] text-[9px] tracking-[0.3em] font-medium">CONSULTORIA</div>
            </div>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" className="text-xs bg-white/10 text-white border-white/30 hover:bg-white/20">
              ← Dashboard
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl text-[#1B2F4A]" style={{ fontFamily: "'Cinzel', serif", fontWeight: 600 }}>
            Relatório Estratégico Premium
          </h1>
          <p className="text-sm text-[#C8A15E] uppercase tracking-[0.3em] font-medium">
            Diagnóstico · Estratégia · Posicionamento
          </p>
        </div>

        {!report && (
          <Card className="p-6 border-[#E3DCCF] border-l-4 border-l-[#C8A15E]">
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-[#1B2F4A] uppercase tracking-wide mb-2">
                  Nome do Cliente <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Ex: Maria Silva"
                  className="w-full px-3 py-2 border border-[#E3DCCF] rounded-lg focus:ring-2 focus:ring-[#C8A15E] focus:border-[#C8A15E] outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1B2F4A] uppercase tracking-wide mb-2">
                  Cargo ou Vaga Alvo <span className="text-slate-400 font-normal normal-case">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={e => setTargetRole(e.target.value)}
                  placeholder="Ex: Gerente de Produto Sênior"
                  className="w-full px-3 py-2 border border-[#E3DCCF] rounded-lg focus:ring-2 focus:ring-[#C8A15E] focus:border-[#C8A15E] outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1B2F4A] uppercase tracking-wide mb-2">
                  Currículo (texto colado) <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={resumeText}
                  onChange={e => setResumeText(e.target.value)}
                  placeholder="Cole aqui o texto completo do CV do cliente..."
                  className="min-h-48 text-sm border-[#E3DCCF] focus:ring-2 focus:ring-[#C8A15E]"
                />
                <p className="text-xs text-slate-500 mt-1">{resumeText.length.toLocaleString()} caracteres</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1B2F4A] uppercase tracking-wide mb-2">
                  Conteúdo do LinkedIn (texto colado) <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={linkedinText}
                  onChange={e => setLinkedinText(e.target.value)}
                  placeholder="Cole aqui o conteúdo do perfil LinkedIn do cliente (headline, sobre, experiências)..."
                  className="min-h-48 text-sm border-[#E3DCCF] focus:ring-2 focus:ring-[#C8A15E]"
                />
                <p className="text-xs text-slate-500 mt-1">{linkedinText.length.toLocaleString()} caracteres</p>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full bg-[#1B2F4A] hover:bg-[#2A4261] text-white font-semibold py-6 text-base disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Gerando relatório premium...</>
                ) : (
                  <><Sparkles className="w-5 h-5 mr-2 text-[#C8A15E]" /> Gerar Relatório Premium</>
                )}
              </Button>

              {mutation.isPending && (
                <p className="text-center text-xs text-slate-500">
                  Analisando CV + LinkedIn + gerando relatório. Leva ~45–90 segundos.
                </p>
              )}
            </div>
          </Card>
        )}

        {report && (
          <>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                onClick={handleExportPDF}
                className="bg-[#C8A15E] hover:bg-[#D4B278] text-[#1B2F4A] font-bold"
              >
                <Download className="w-4 h-4 mr-2" /> Exportar PDF
              </Button>
              <Button onClick={handleReset} variant="outline" className="border-[#1B2F4A] text-[#1B2F4A]">
                <RotateCcw className="w-4 h-4 mr-2" /> Novo Cliente
              </Button>
            </div>

            <Card className="p-8 border-[#E3DCCF] border-l-4 border-l-[#C8A15E] space-y-3">
              <div className="text-xs uppercase tracking-[0.3em] text-[#C8A15E] font-bold">Cliente</div>
              <div className="text-2xl font-bold text-[#1B2F4A]" style={{ fontFamily: "'Cinzel', serif" }}>{report.clientName}</div>
              <div className="text-xs text-slate-500">
                Gerado em {new Date(report.generatedAt).toLocaleString("pt-BR")}
              </div>
            </Card>

            <Section title="Sumário Executivo">
              <p className="text-lg font-semibold text-[#1B2F4A] italic leading-relaxed" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                {report.executiveSummary.headline}
              </p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {report.executiveSummary.diagnosis}
              </p>
              <BeforeAfter
                before={report.executiveSummary.beforeAfter.before}
                after={report.executiveSummary.beforeAfter.after}
              />
              <SubTitle>Valor entregue</SubTitle>
              <BulletList items={report.executiveSummary.valueDelivered} />
            </Section>

            <Section title="Análise ATS">
              <div className="flex flex-wrap gap-6 justify-around py-3">
                <ScoreBadge value={report.atsAnalysis.currentScore} label="Score Atual" />
                <ScoreBadge value={report.atsAnalysis.projectedScore} label="Score Projetado" accent />
              </div>
              <SubTitle>Breakdown</SubTitle>
              <div className="space-y-2">
                {report.atsAnalysis.breakdown.map((b, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className="w-40 text-slate-700">{b.name}</div>
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#C8A15E]"
                        style={{ width: `${(b.current / b.max) * 100}%` }}
                      />
                    </div>
                    <div className="w-14 text-right font-bold text-[#1B2F4A]">{b.current}/{b.max}</div>
                  </div>
                ))}
              </div>
              <SubTitle>O que estava prejudicando</SubTitle>
              <BulletList items={report.atsAnalysis.whatWasWrong} />
              <SubTitle>O que foi corrigido</SubTitle>
              <BulletList items={report.atsAnalysis.whatWasFixed} />
              <SubTitle>Racional estratégico</SubTitle>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {report.atsAnalysis.strategicRationale}
              </p>
            </Section>

            <Section title="Percepção do Recrutador">
              <SubTitle>Como o perfil era lido</SubTitle>
              <p className="text-sm text-slate-700 leading-relaxed">{report.recruiterPerception.currentRead}</p>
              <SubTitle>Como será lido agora</SubTitle>
              <p className="text-sm text-slate-700 leading-relaxed">{report.recruiterPerception.optimizedRead}</p>
              <SubTitle>Gatilhos de interesse</SubTitle>
              <BulletList items={report.recruiterPerception.triggers} />
              <SubTitle>Receios neutralizados</SubTitle>
              <BulletList items={report.recruiterPerception.fears} />
              <SubTitle>Narrativa ideal</SubTitle>
              <p className="text-sm text-slate-700 leading-relaxed italic">{report.recruiterPerception.idealNarrative}</p>
            </Section>

            <Section title="Otimização do Currículo">
              <SubTitle>Síntese estratégica</SubTitle>
              <p className="text-sm text-slate-700 leading-relaxed">{report.cvOptimization.strategicSummary}</p>

              <div className="grid grid-cols-2 gap-3 bg-[#F5F1EB] p-3 rounded-lg text-xs">
                <div><span className="font-bold text-[#1B2F4A]">Senioridade:</span> {report.cvOptimization.seniorityLevel}</div>
                <div><span className="font-bold text-[#1B2F4A]">Trajetória:</span> {report.cvOptimization.careerTrajectory}</div>
              </div>

              <SubTitle>Bullets reescritos</SubTitle>
              <div className="space-y-5">
                {report.cvOptimization.improvedBullets.map((b, i) => (
                  <div key={i} className="border border-[#E3DCCF] rounded-lg p-4 space-y-2">
                    <div className="text-xs font-bold text-[#C8A15E] uppercase tracking-wider">{b.section}</div>
                    <BeforeAfter before={b.before} after={b.after} />
                    <p className="text-xs text-slate-600 italic">
                      <span className="font-bold not-italic">Por que funciona: </span>{b.reasoning}
                    </p>
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => copyText(b.after, "Bullet")}>
                        <Copy className="w-3 h-3 mr-1" /> Copiar novo bullet
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <SubTitle>Palavras-chave integradas</SubTitle>
              <KeywordChips items={report.cvOptimization.missingKeywords} />
            </Section>

            <Section title="Otimização do LinkedIn">
              <div className="flex flex-wrap gap-6 justify-around py-3">
                <ScoreBadge value={report.linkedinOptimization.profileStrength} label="Força do Perfil" />
                <ScoreBadge value={report.linkedinOptimization.ssiEstimate} label="SSI Estimado" />
                <ScoreBadge value={report.linkedinOptimization.recruiterVisibility} label="Visibilidade" accent />
              </div>

              <SubTitle>Headline</SubTitle>
              <BeforeAfter
                before={report.linkedinOptimization.headline.before}
                after={report.linkedinOptimization.headline.after}
              />
              <p className="text-xs text-slate-600 italic">{report.linkedinOptimization.headline.rationale}</p>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => copyText(report.linkedinOptimization.headline.after, "Headline")}>
                  <Copy className="w-3 h-3 mr-1" /> Copiar headline otimizada
                </Button>
              </div>

              <SubTitle>Sobre (About)</SubTitle>
              <BeforeAfter
                before={report.linkedinOptimization.about.before}
                after={report.linkedinOptimization.about.after}
              />
              <p className="text-xs text-slate-600 italic">{report.linkedinOptimization.about.rationale}</p>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => copyText(report.linkedinOptimization.about.after, "About")}>
                  <Copy className="w-3 h-3 mr-1" /> Copiar About otimizado
                </Button>
              </div>

              <SubTitle>Quick wins</SubTitle>
              <BulletList items={report.linkedinOptimization.quickWins} />

              <SubTitle>Pontos fortes</SubTitle>
              <BulletList items={report.linkedinOptimization.topStrengths} />

              <SubTitle>Palavras-chave a adicionar</SubTitle>
              <KeywordChips items={report.linkedinOptimization.missingKeywords} />
            </Section>

            <Section title="Palavras-chave Estratégicas">
              <SubTitle>Primárias (uso intensivo)</SubTitle>
              <KeywordChips items={report.strategicKeywords.primary} emphasis />
              <SubTitle>Secundárias (uso complementar)</SubTitle>
              <KeywordChips items={report.strategicKeywords.secondary} />
              <SubTitle>Racional de seleção</SubTitle>
              <p className="text-sm text-slate-700 leading-relaxed">{report.strategicKeywords.rationale}</p>
            </Section>

            <Section title="Próximos Passos">
              <BulletList items={report.nextSteps} />
            </Section>

            <Section title="Mensagem de Fechamento">
              <p className="text-base text-[#1B2F4A] leading-relaxed italic" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                {report.closingMessage}
              </p>
            </Section>

            <div className="flex justify-end gap-2 pt-6 pb-10">
              <Button
                onClick={handleExportPDF}
                size="lg"
                className="bg-[#C8A15E] hover:bg-[#D4B278] text-[#1B2F4A] font-bold"
              >
                <FileText className="w-5 h-5 mr-2" /> Exportar PDF para entrega
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-6 space-y-4 border-[#E3DCCF] border-l-4 border-l-[#C8A15E]">
      <div className="flex items-center gap-3 pb-3 border-b border-[#E3DCCF]">
        <div className="w-2 h-6 bg-[#C8A15E] rounded-sm" />
        <h2 className="text-lg font-bold text-[#1B2F4A] uppercase tracking-[0.15em]" style={{ fontFamily: "'Cinzel', serif" }}>
          {title}
        </h2>
      </div>
      {children}
    </Card>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-bold text-[#1B2F4A] mt-4 mb-2" style={{ fontFamily: "'Cinzel', serif" }}>
      {children}
    </h3>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="space-y-1.5 text-sm text-slate-700">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 leading-relaxed">
          <span className="text-[#C8A15E] font-bold mt-0.5">▸</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function BeforeAfter({ before, after }: { before: string; after: string }) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="bg-red-50/40 border-l-2 border-red-300 p-3 rounded">
        <div className="text-[10px] font-bold text-red-700 uppercase tracking-widest mb-1">Antes</div>
        <div className="text-xs text-slate-700 whitespace-pre-wrap">{before || "—"}</div>
      </div>
      <div className="bg-green-50/40 border-l-2 border-[#C8A15E] p-3 rounded">
        <div className="text-[10px] font-bold text-[#C8A15E] uppercase tracking-widest mb-1">Depois</div>
        <div className="text-xs text-slate-900 font-medium whitespace-pre-wrap">{after || "—"}</div>
      </div>
    </div>
  );
}

function KeywordChips({ items, emphasis = false }: { items: string[]; emphasis?: boolean }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((kw, i) => (
        <span
          key={i}
          className={
            emphasis
              ? "text-xs px-2.5 py-1 rounded bg-[#1B2F4A] text-white font-semibold"
              : "text-xs px-2.5 py-1 rounded bg-[#F5F1EB] text-[#1B2F4A] border border-[#E3DCCF]"
          }
        >
          {kw}
        </span>
      ))}
    </div>
  );
}

function ScoreBadge({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={
          accent
            ? "w-20 h-20 rounded-full flex items-center justify-center bg-[#C8A15E] border-2 border-[#1B2F4A]"
            : "w-20 h-20 rounded-full flex items-center justify-center bg-[#1B2F4A] border-2 border-[#C8A15E]"
        }
      >
        <span
          className={accent ? "text-2xl font-bold text-[#1B2F4A]" : "text-2xl font-bold text-[#C8A15E]"}
          style={{ fontFamily: "'Cinzel', serif" }}
        >
          {value}
        </span>
      </div>
      <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center max-w-[80px]">
        {label}
      </div>
    </div>
  );
}
