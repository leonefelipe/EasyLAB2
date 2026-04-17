/**
 * Home.tsx — Slim shell that delegates to AnalysisLayout.
 * Keeps: header, dark mode, history panel, confetti, wizard CTA.
 * The full analysis UI lives in AnalysisLayout.tsx.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { History, Eye, EyeOff, Zap, Trash2, ArrowUpRight, Linkedin } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import AnalysisLayout from "@/components/AnalysisLayout";

// ─── localStorage helpers ─────────────────────────────────────────────────────
const LS_HIST = "easyjobai_history";
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HIST) || "[]"); } catch { return []; }
}
function clearHistory() { localStorage.removeItem(LS_HIST); }

// ─── Confetti ────────────────────────────────────────────────────────────────
function Confetti() {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {Array.from({ length: 50 }).map((_, i) => (
        <div key={i} className="absolute w-2 h-2 rounded-sm animate-bounce"
          style={{
            left: `${Math.random() * 100}%`,
            top: `-${Math.random() * 20}%`,
            backgroundColor: ["#1e3a8a","#10b981","#f59e0b","#ef4444","#8b5cf6"][i % 5],
            animationDuration: `${0.8 + Math.random() * 1.5}s`,
            animationDelay: `${Math.random() * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Home() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ReturnType<typeof loadHistory>>([]);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
    const dark = localStorage.getItem("easyjobai_dark") === "true";
    setIsDarkMode(dark);
    if (dark) document.documentElement.classList.add("dark");

    // Listen for new analyses added to history
    const onStorage = () => setHistory(loadHistory());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Poll history to pick up new analyses (trpc runs in same tab, no storage event)
  useEffect(() => {
    const interval = setInterval(() => {
      const h = loadHistory();
      if (h.length !== history.length) {
        setHistory(h);
        if (h[0]?.projectedMatchScore > 80) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 3500);
        }
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [history.length]);

  const toggleDark = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem("easyjobai_dark", String(next));
    document.documentElement.classList.toggle("dark", next);
  };

  const dk = isDarkMode;

  return (
    <div className={`min-h-screen ${dk ? "dark bg-slate-900" : "bg-white"}`}>
      {showConfetti && <Confetti />}

      {/* Header */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-sm h-16 flex items-center ${dk ? "bg-slate-900/90 border-slate-700" : "bg-white/90 border-slate-200"}`}>
        <div className="max-w-none w-full px-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-900" />
            <span className={`font-bold text-lg ${dk ? "text-white" : "text-slate-900"}`}>Easy Job AI</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowHistory(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${dk ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-100"}`}>
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Histórico</span>
              {history.length > 0 && <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{history.length}</span>}
            </button>
            <Link href="/linkedin">
              <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${dk ? "text-blue-300 hover:bg-slate-700" : "text-blue-700 hover:bg-blue-50 border border-blue-200"}`}>
                <Linkedin className="w-4 h-4" />
                <span className="hidden sm:inline">LinkedIn</span>
              </button>
            </Link>
            <button onClick={toggleDark} className={`p-2 rounded-lg transition-colors ${dk ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-100"}`}>
              {dk ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* History panel */}
      {showHistory && (
        <div className={`border-b ${dk ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
          <div className="px-5 py-4 max-w-none">
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-bold text-sm ${dk ? "text-white" : "text-slate-900"}`}>Análises Recentes</h3>
              {history.length > 0 && (
                <button onClick={() => { clearHistory(); setHistory([]); toast.info("Histórico limpo."); }}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" />Limpar
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className={`text-sm ${dk ? "text-slate-400" : "text-slate-500"}`}>Nenhuma análise salva.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {history.map((item: { id: string; jobTitle: string; jobArea: string; matchScore: number; projectedMatchScore: number; date: string }) => (
                  <div key={item.id}
                    className={`flex-shrink-0 p-3 rounded-lg border w-52 ${dk ? "bg-slate-700 border-slate-600" : "bg-white border-slate-200"}`}>
                    <p className={`text-xs font-semibold truncate ${dk ? "text-white" : "text-slate-900"}`}>{item.jobTitle}</p>
                    <p className={`text-[10px] mt-0.5 ${dk ? "text-slate-400" : "text-slate-500"}`}>{item.jobArea} · {item.date}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-xs font-bold ${item.matchScore >= 70 ? "text-green-600" : item.matchScore >= 50 ? "text-amber-600" : "text-red-600"}`}>{item.matchScore}%</span>
                      <ArrowUpRight className="w-3 h-3 text-blue-400" />
                      <span className="text-xs font-bold text-green-600">{item.projectedMatchScore}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content — split panel */}
      <AnalysisLayout isDarkMode={isDarkMode} />
    </div>
  );
}
