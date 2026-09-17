"use client";

import { AlertTriangle, ArrowUpRight, BrainCircuit, Calculator, Check, ChevronRight, CircleStop, Clock3, FileSearch, FlaskConical, Globe2, LoaderCircle, Search, ShieldCheck, Sparkles, TerminalSquare, Wrench, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

type ToolResult = { ok: true; data: unknown; durationMs: number } | { ok: false; error: string; code: string; retryable: boolean; durationMs: number };
type ResearchResult = {
  answer: string; status: "completed" | "max_steps";
  state: { goal: string; plan: string[]; step: number;
    observations: Array<{ step: number; tool: string; input: Record<string, unknown>; result: ToolResult }>;
    trace: Array<{ id: string; step: number; type: "decision" | "tool_started" | "observation" | "recovery" | "final"; title: string; detail: string; timestamp: string }>;
  };
};

const examples = ["Compare solar and nuclear power for India's next decade.", "Is an electric car cheaper over 5 years than a petrol car in Dubai?", "Research whether a four-day work week improves productivity."];
const loadingStages = ["Breaking the question into research steps", "Selecting the next tool autonomously", "Collecting and checking evidence", "Synthesizing the final report"];

export default function Home() {
  const [question, setQuestion] = useState(examples[0]);
  const [chaosMode, setChaosMode] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => setLoadingStage((stage) => Math.min(stage + 1, loadingStages.length - 1)), 2400);
    return () => window.clearInterval(timer);
  }, [loading]);

  const stats = useMemo(() => {
    const observations = result?.state.observations ?? [];
    return { calls: observations.length, recoveries: observations.filter((item) => !item.result.ok).length, duration: observations.reduce((sum, item) => sum + item.result.durationMs, 0), sources: new Set(observations.flatMap((item) => extractUrls(item.result.ok ? item.result.data : null))).size };
  }, [result]);

  async function startResearch() {
    if (question.trim().length < 10 || loading) return;
    setLoading(true); setLoadingStage(0); setError(""); setResult(null);
    try {
      const response = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question.trim(), chaosMode }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Research run failed");
      setResult(body as ResearchResult);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "An unexpected error occurred"); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen overflow-hidden bg-[#06080d] text-white">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <nav className="relative z-10 mx-auto flex max-w-[1480px] items-center justify-between px-5 py-5 lg:px-10">
      <div className="flex items-center gap-3"><Logo /><div><div className="text-[15px] font-semibold tracking-[-0.02em]">ProofPilot</div><div className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/35">Transparent research agent</div></div></div>
      <div className="hidden items-center gap-2 md:flex"><Badge icon={<ShieldCheck size={13} />} label="Custom agent loop" /><a className="nav-link" href="https://github.com/vatshalpandey-commits/proofpilot" target="_blank" rel="noreferrer">View source <ArrowUpRight size={13} /></a></div>
    </nav>

    <section className="relative z-10 mx-auto max-w-[1480px] px-5 pb-16 pt-10 lg:px-10 lg:pt-16">
      <div className="mx-auto max-w-4xl text-center">
        <div className="eyebrow"><Sparkles size={13} /> Research you can inspect</div>
        <h1 className="mt-6 text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.065em] sm:text-6xl lg:text-[82px]">Watch the agent<span className="gradient-text block">think in actions.</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-7 text-[#9ba3b5] sm:text-lg">ProofPilot plans, chooses tools, observes the results, and recovers from failure—while every step stays visible.</p>
      </div>

      <div className="research-box mx-auto mt-11 max-w-4xl">
        <div className="flex items-start gap-4"><Search className="mt-1 shrink-0 text-violet-300" size={20} /><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") startResearch(); }} className="min-h-24 w-full resize-none bg-transparent text-lg leading-7 text-white outline-none placeholder:text-white/25" placeholder="Ask a complex question that needs evidence..." maxLength={3000} /></div>
        <div className="mt-5 flex flex-col justify-between gap-4 border-t border-white/[0.07] pt-4 sm:flex-row sm:items-center">
          <button className={`chaos-toggle ${chaosMode ? "chaos-active" : ""}`} onClick={() => setChaosMode((value) => !value)} type="button"><FlaskConical size={15} />Chaos mode<span>{chaosMode ? "ON" : "OFF"}</span></button>
          <button className="launch-button" onClick={startResearch} disabled={loading || question.trim().length < 10} type="button">{loading ? <LoaderCircle className="animate-spin" size={17} /> : <Zap size={17} />}{loading ? "Researching" : "Launch research"}{!loading && <ChevronRight size={16} />}</button>
        </div>
      </div>

      {!result && !loading && !error && <div className="mx-auto mt-5 flex max-w-4xl flex-wrap justify-center gap-2">{examples.map((example) => <button key={example} className="example-chip" onClick={() => setQuestion(example)}>{example}</button>)}</div>}
      {loading && <LoadingPanel stage={loadingStage} chaosMode={chaosMode} />}
      {error && <ErrorPanel message={error} />}
      {result && <Workspace result={result} stats={stats} />}
    </section>
  </main>;
}

function Workspace({ result, stats }: { result: ResearchResult; stats: { calls: number; recoveries: number; duration: number; sources: number } }) {
  return <div className="mt-12 grid gap-4 xl:grid-cols-[0.72fr_1.45fr_0.83fr]">
    <aside className="glass-panel h-fit"><PanelTitle icon={<BrainCircuit size={16} />} title="Research plan" eyebrow="Agent state" /><div className="mt-6 space-y-2">{result.state.plan.map((item, index) => <div className="plan-row" key={`${item}-${index}`}><span className="plan-number">{String(index + 1).padStart(2, "0")}</span><p>{item}</p><Check size={14} className="ml-auto shrink-0 text-emerald-300" /></div>)}</div><div className="mt-6 rounded-xl border border-white/[0.06] bg-black/20 p-4"><div className="flex items-center gap-2 text-xs font-medium text-white/45"><TerminalSquare size={14} /> Safety controls</div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><MiniStat label="Step limit" value={`${result.state.step}/8`} /><MiniStat label="Status" value={result.status === "completed" ? "Complete" : "Stopped"} /></div></div></aside>
    <section className="glass-panel min-w-0"><PanelTitle icon={<Sparkles size={16} />} title="Agent trace" eyebrow={`${result.state.trace.length} visible events`} /><div className="mt-6 space-y-3">{result.state.trace.map((event) => <TraceCard key={event.id} event={event} />)}</div></section>
    <aside className="space-y-4"><div className="glass-panel"><PanelTitle icon={<Wrench size={16} />} title="Run telemetry" eyebrow="Live evidence" /><div className="mt-5 grid grid-cols-2 gap-3"><Metric icon={<Zap size={14} />} label="Tool calls" value={stats.calls} /><Metric icon={<Globe2 size={14} />} label="Sources" value={stats.sources} /><Metric icon={<AlertTriangle size={14} />} label="Recoveries" value={stats.recoveries} /><Metric icon={<Clock3 size={14} />} label="Tool time" value={`${stats.duration}ms`} /></div></div><div className="glass-panel"><PanelTitle icon={<FileSearch size={16} />} title="Tool ledger" eyebrow="Autonomous choices" /><div className="mt-5 space-y-2">{result.state.observations.map((observation, index) => <div className="tool-row" key={`${observation.step}-${index}`}><ToolIcon name={observation.tool} /><div className="min-w-0"><div className="truncate text-xs font-medium text-white/80">{observation.tool}</div><div className="text-[11px] text-white/35">Step {observation.step} · {observation.result.durationMs}ms</div></div><span className={`tool-status ${observation.result.ok ? "success" : "failed"}`}>{observation.result.ok ? "OK" : "FAIL"}</span></div>)}</div></div></aside>
    <article className="report-panel xl:col-span-3"><div className="flex flex-col justify-between gap-4 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-center"><PanelTitle icon={<FileSearch size={16} />} title="Evidence-backed report" eyebrow="Final output" /><Badge icon={<ShieldCheck size={13} />} label="Trace verified" /></div><div className="report-prose mt-7"><ReactMarkdown>{result.answer}</ReactMarkdown></div></article>
  </div>;
}

function TraceCard({ event }: { event: ResearchResult["state"]["trace"][number] }) {
  const config = { decision: { icon: <BrainCircuit size={15} />, label: "Decision", tone: "violet" }, tool_started: { icon: <Wrench size={15} />, label: "Action", tone: "blue" }, observation: { icon: <FileSearch size={15} />, label: "Observation", tone: "green" }, recovery: { icon: <AlertTriangle size={15} />, label: "Recovery", tone: "amber" }, final: { icon: <Check size={15} />, label: "Complete", tone: "green" } }[event.type];
  return <div className={`trace-card trace-${config.tone}`}><div className="trace-icon">{config.icon}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{config.label} · Step {event.step}</span><span className="h-1 w-1 rounded-full bg-white/20" /><span className="text-[10px] text-white/25">{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></div><h3 className="mt-1.5 text-sm font-medium text-white/90">{event.title}</h3><p className="mt-1 break-words text-xs leading-5 text-white/45">{event.detail}</p></div></div>;
}

function LoadingPanel({ stage, chaosMode }: { stage: number; chaosMode: boolean }) { return <div className="loading-panel mx-auto mt-10 max-w-4xl"><div className="brain-loader"><BrainCircuit size={26} /></div><div className="flex-1"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Agent running</div><div className="mt-1 text-sm text-white/65">{loadingStages[stage]}</div></div><span className="text-xs text-white/30">{stage + 1}/{loadingStages.length}</span></div><div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="progress-line" style={{ width: `${((stage + 1) / loadingStages.length) * 100}%` }} /></div>{chaosMode && <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-300/70"><AlertTriangle size={12} /> First search failure will be simulated</div>}</div></div>; }
function ErrorPanel({ message }: { message: string }) { return <div className="mx-auto mt-10 flex max-w-4xl items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-5 text-sm text-red-100/75"><CircleStop className="mt-0.5 shrink-0 text-red-300" size={18} /><div><div className="font-medium text-red-200">Research run stopped</div><div className="mt-1 text-xs leading-5">{message}</div></div></div>; }
function Logo() { return <div className="logo-mark"><BrainCircuit size={19} /></div>; }
function Badge({ icon, label }: { icon: React.ReactNode; label: string }) { return <div className="badge">{icon}{label}</div>; }
function PanelTitle({ icon, title, eyebrow }: { icon: React.ReactNode; title: string; eyebrow: string }) { return <div className="flex items-center gap-3"><div className="panel-icon">{icon}</div><div><div className="text-[10px] font-semibold uppercase tracking-[0.17em] text-white/30">{eyebrow}</div><h2 className="mt-0.5 text-sm font-semibold text-white/90">{title}</h2></div></div>; }
function MiniStat({ label, value }: { label: string; value: string }) { return <div><div className="text-[10px] text-white/30">{label}</div><div className="mt-1 font-mono text-xs text-white/70">{value}</div></div>; }
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) { return <div className="metric"><div className="flex items-center gap-1.5 text-white/35">{icon}<span>{label}</span></div><div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white/90">{value}</div></div>; }
function ToolIcon({ name }: { name: string }) { return <div className="tool-icon">{name === "calculator" ? <Calculator size={14} /> : name === "web_search" ? <Search size={14} /> : <Globe2 size={14} />}</div>; }
function extractUrls(value: unknown): string[] { if (!value || typeof value !== "object") return []; if (Array.isArray(value)) return value.flatMap(extractUrls); return Object.entries(value).flatMap(([key, child]) => key === "url" && typeof child === "string" ? [child] : extractUrls(child)); }
