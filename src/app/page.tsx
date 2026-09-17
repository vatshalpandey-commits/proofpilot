"use client";

import { AlertTriangle, ArrowUpRight, BrainCircuit, Calculator, Check, ChevronRight, CircleStop, FileSearch, FlaskConical, Gauge, GitBranch, GitCompareArrows, Globe2, History, Info, Layers3, LoaderCircle, Radio, Search, ShieldCheck, Sparkles, TerminalSquare, Wrench, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { OrbitalFilm } from "./orbital-film";

type ToolResult = { ok: true; data: unknown; durationMs: number } | { ok: false; error: string; code: string; retryable: boolean; durationMs: number };
type TraceEvent = { id: string; step: number; type: "decision" | "tool_started" | "observation" | "recovery" | "final"; title: string; detail: string; timestamp: string };
type Observation = { step: number; tool: string; input: Record<string, unknown>; result: ToolResult };
type Result = { answer: string; status: "completed" | "max_steps"; state: { goal: string; plan: string[]; step: number; observations: Observation[]; trace: TraceEvent[] } };
type View = "observe" | "trace" | "report" | "compare";
type Comparison = { configuration:{model:string;tools:string[];stepCap:number;prompt:string}; proofpilot:{durationMs:number;toolCalls:number;events:number;recoveries:number;answer:string}; baseline:{answer:string;durationMs:number;modelCalls:number;toolCalls:number;events:Array<{sequence:number;type:string;title:string;detail:string}>} };

const examples = ["Compare solar and nuclear power for India's next decade.", "Is an electric car cheaper over 5 years than a petrol car in Dubai?", "Does a four-day work week improve productivity?"];

export default function Home() {
  const [question, setQuestion] = useState(examples[0]);
  const [chaos, setChaos] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("observe");
  const [transitionId, setTransitionId] = useState(0);
  function navigate(next: View) {
    if (next === view) return;
    setTransitionId(id => id + 1);
    setView(next);
  }
  function moveTo(id: string) {
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    }), 80);
  }
  function openComparison() {
    navigate("compare");
    moveTo("workspace");
  }
  const [eventId, setEventId] = useState<string | null>(null);
  const [claim, setClaim] = useState<number | null>(null);
  const [judge, setJudge] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const observations = useMemo(() => result?.state.observations ?? [], [result]);
  const stats = useMemo(() => ({ calls: observations.length, failures: observations.filter(x => !x.result.ok).length, sources: new Set(observations.flatMap(x => urls(x.result.ok ? x.result.data : null))).size, time: observations.reduce((n, x) => n + x.result.durationMs, 0) }), [observations]);
  const activeEvent = result?.state.trace.find(x => x.id === eventId) ?? result?.state.trace.at(-1) ?? null;

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("revealed"); observer.unobserve(entry.target); } });
    }, { threshold: 0.08 });
    document.querySelectorAll("[data-reveal]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  async function launch() {
    if (question.trim().length < 10 || loading) return;
    setLoading(true); setError(""); setResult(null); setEventId(null); setClaim(null); navigate("observe"); moveTo("workspace");
    try {
      const response = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question.trim(), chaosMode: chaos }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Research run failed");
      setResult(body);
      navigate("report");
      moveTo("workspace");
    } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error"); }
    finally { setLoading(false); }
  }

  async function compare() {
    if (question.trim().length < 10 || comparing) return;
    setComparing(true); setError(""); navigate("compare"); moveTo("workspace");
    try {
      const response = await fetch("/api/compare", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({question:question.trim()}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Comparison failed");
      setComparison(body);
    } catch(e) { setError(e instanceof Error ? e.message : "Comparison failed"); }
    finally { setComparing(false); }
  }

  return <main className="shell">
    <a className="skip-link" href="#investigation">Skip to investigation</a>
    <header className="topbar">
      <div className="brand"><Logo /><div><b>ProofPilot</b><span>Agent Observatory · V2</span></div></div>
      <div className="run-id"><i className={loading ? "live" : ""} />{loading ? "RUNNING" : result ? result.status.toUpperCase() : "READY"}<em />{result ? `${result.state.trace.length} EVENTS` : "NO ACTIVE TRACE"}</div>
      <div className="top-actions"><button className="top-compare" onClick={openComparison}><GitCompareArrows size={14} />Compare <span>Bonus</span></button><button className={judge ? "selected" : ""} onClick={() => setJudge(!judge)}><Gauge size={14} />Judge mode</button><a href="https://github.com/vatshalpandey-commits/proofpilot" target="_blank" rel="noreferrer">Source <ArrowUpRight size={13} /></a></div>
    </header>

    <section className="intro">
      <p className="eyebrow">THE AGENT OBSERVATORY</p>
      <h1>A little more clarity.<br/><span>A lot more proof.</span></h1>
      <p className="intro-copy">Give your curiosity a direction. Follow the tools, explore the evidence, and see how an answer takes shape.</p>
      <a className="intro-link" href="#investigation">Start an investigation <ChevronRight size={18}/></a>
      <div className="intro-foot"><span>Built to investigate. Open to inspection.</span><span>01 — OBSERVE</span></div>
      <OrbitalFilm />
    </section>
    <section className="investigation" id="investigation" aria-label="Research workspace">
    <div className="section-title" data-reveal><div><p className="eyebrow">YOUR NEXT QUESTION</p><h2>Look a little closer.</h2></div><p>One question. A trail you can follow.</p></div>
    <section className="mission-bar"><label><Search size={22} /><textarea rows={2} aria-label="Research mission" maxLength={3000} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); launch(); } }} /></label><div className="mission-actions"><button aria-pressed={chaos} title="Simulate the first search failure to test recovery" className={`chaos ${chaos ? "on" : ""}`} onClick={() => setChaos(!chaos)} disabled={loading}><FlaskConical size={17} />Test recovery <span>{chaos ? "ON" : "OFF"}</span></button><div className="run-actions"><button className="bonus-launch" onClick={openComparison} disabled={loading || comparing || question.trim().length<10}><GitCompareArrows size={17}/><span><b>Compare with LangChain</b><small>Bonus experiment</small></span></button><button className="launch" onClick={launch} disabled={loading || comparing || question.trim().length<10}>{loading ? <LoaderCircle className="spin" size={18} /> : <ChevronRight size={18} />}{loading ? "Investigating…" : "Investigate"}</button></div></div></section>
    <div className="suggestions"><span>Or explore</span>{examples.map((example,index)=><button key={example} disabled={loading} onClick={()=>setQuestion(example)}>{["The energy transition","The real cost of an EV","The four-day week"][index]}<ArrowUpRight size={14}/></button>)}</div>
    {judge && <div className="judge"><Gauge size={17} /><b>JUDGE MODE · 1/5 · CUSTOM LOOP</b><p>The center instrument is driven by our own plan → act → observe loop. {result ? "This run contains inspectable evidence." : "Launch a run to create evidence."}</p><button onClick={() => setJudge(false)}><X size={13} /></button></div>}
    {error && <div className="error"><CircleStop size={17} /><div><b>Research run stopped</b><p>{error}</p></div><button onClick={() => setError("")}><X size={14} /></button></div>}
    <nav className="mobile-tabs" style={{"--active": ["observe","trace","report","compare"].indexOf(view)} as React.CSSProperties} aria-label="Investigation views">{(["observe", "trace", "report", "compare"] as View[]).map(x => <button aria-current={view===x?"page":undefined} className={view === x ? "selected" : ""} onClick={() => { navigate(x); moveTo("workspace"); }} key={x}>{x}{x==="compare"&&<small>BONUS</small>}</button>)}</nav>

    <div className={`workspace mode-${view}`} id="workspace">
      {transitionId > 0 && <OrbitalFilm key={transitionId} transition />}
      <MissionRail result={result} stats={stats} show={view === "observe"} />
      <section key={view} className={`field view-${view}`}>{view === "report" ? <Report result={result} claim={claim} setClaim={setClaim} /> : view === "compare" ? <Arena comparison={comparison} loading={comparing} run={compare} /> : <><div className="field-heading"><span>The observatory</span><span className="field-status"><i className={loading?"live":""}/>{loading?"Awaiting recorded results":result?"Recorded investigation":"Ready when you are"}</span></div><Constellation result={result} loading={loading} claim={claim} activeEvent={activeEvent} selectEvent={setEventId} /></>}</section>
      <Inspector result={result} event={activeEvent} claim={claim} clearClaim={() => setClaim(null)} show={view === "trace"} />
      <Recorder result={result} eventId={eventId} select={setEventId} show={view === "trace"} />
    </div>
    </section>
    <section className="principles" data-reveal><div><p className="eyebrow">NOT JUST AN ANSWER</p><h2>The work behind it.</h2></div><div className="principle-grid"><article><span>01</span><h3>Decisions, in context.</h3><p>Inspect the agent’s recorded choices. See which tool it selected and what it asked.</p></article><article><span>02</span><h3>Evidence, kept close.</h3><p>Read source-backed findings alongside the observations gathered during the investigation.</p></article><article><span>03</span><h3>Failures, left visible.</h3><p>Unsuccessful attempts stay in the record. An incomplete run is never passed off as a finished answer.</p></article></div></section>
    <footer><span><ShieldCheck size={12} />Custom plan → act → observe loop</span><span><TerminalSquare size={12} />Max 3 decisions</span><span><Radio size={12} />Recorded events only—never simulated</span><span>Gemini + Groq fallback + Tavily</span></footer>
  </main>;
}

function MissionRail({ result, stats, show }: { result: Result | null; stats: { calls:number; failures:number; sources:number; time:number }; show:boolean }) {
  const plan = result?.state.plan ?? ["Frame the research question", "Choose the best available tool", "Observe, verify, and synthesize"];
  return <aside className={`mission-rail mobile-panel ${show ? "mobile-show" : ""}`}><Heading overline="Mission rail" title="Investigation plan" icon={<Layers3 size={15} />} /><div className="plan">{plan.map((x,i) => <div className={result ? "done" : i === 0 ? "current" : ""} key={x+i}><span>{String(i+1).padStart(2,"0")}</span><p>{x}</p>{result ? <Check size={12}/> : <i/>}</div>)}</div><hr/><small>RUN TELEMETRY</small><div className="metrics"><Metric label="Calls" value={stats.calls}/><Metric label="Sources" value={stats.sources}/><Metric label="Failed calls" value={stats.failures} amber={stats.failures>0}/><Metric label="Tool time" value={`${stats.time}ms`}/></div><div className="note"><Info size={13}/><p>Nodes keep stable positions. Events illuminate the map; they never rearrange it.</p></div></aside>;
}

function Constellation({ result, loading, claim, activeEvent, selectEvent }: { result:Result|null; loading:boolean; claim:number|null; activeEvent:TraceEvent|null; selectEvent:(id:string)=>void }) {
  const obs=result?.state.observations??[]; const failed=obs.filter(x=>!x.result.ok); const state=loading?"RUNNING":result?.status==="max_steps"?"STOPPED":activeEvent?.type==="recovery"?"FAILED":result?"COMPLETE":"READY";
  return <div className={`constellation ${claim!==null?"tracing":""}`}>
    <span className="zone z-plan">PLAN NODES</span><span className="zone z-tools">TOOL PORTS</span><span className="zone z-evidence">EVIDENCE</span><span className="zone z-observe">OBSERVATIONS</span>
    <svg viewBox="0 0 900 620" preserveAspectRatio="none" aria-hidden="true"><path className="route violet" d="M430 310C340 250 270 180 175 145"/><path className="route blue" d="M470 295C575 230 635 150 742 142"/><path className={`route mint ${result?"lit":""}`} d="M485 335C610 355 657 424 742 463"/><path className={`route mint evidence ${result?"lit":""}`} d="M430 350C340 405 280 456 170 476"/>{failed.length>0&&<><path className="route failed" d="M475 315C590 290 650 268 748 250"/>{failed.some(f=>result?.state.trace.some(e=>e.type==="decision"&&e.step>f.step))&&<path className="route recover" d="M748 250C650 300 610 350 690 408"/>}<g className="interrupt"><circle cx="625" cy="280" r="12"/><path d="M620 275l10 10M630 275l-10 10"/></g></>}</svg>
    <div className={`core ${state.toLowerCase()}`}><i/><i/><div><BrainCircuit size={24}/><span>DECISION CORE</span><b>{state}</b><small>{loading?"Awaiting results":result?`${result.state.step} decisions recorded`:"Awaiting a mission"}</small></div></div>
    <Node cls="n-plan" overline="P-01" title={result?.state.plan[0]??"Research plan"} icon={<GitBranch size={14}/>} tone="violet"/>
    <Node cls="n-search" overline="TOOL 01" title="Web search" icon={<Search size={14}/>} tone="blue" count={obs.filter(x=>x.tool==="web_search").length}/><Node cls="n-read" overline="TOOL 02" title="Read webpage" icon={<Globe2 size={14}/>} tone="blue" count={obs.filter(x=>x.tool==="read_webpage").length}/><Node cls="n-calc" overline="TOOL 03" title="Calculator" icon={<Calculator size={14}/>} tone="blue" count={obs.filter(x=>x.tool==="calculator").length}/>
    <Node cls="n-observe" overline="OBSERVATION" title={result?`${obs.length} tool results`:"Awaiting output"} icon={<FileSearch size={14}/>} tone="mint" active={!!result}/><Node cls="n-evidence" overline="EVIDENCE" title={result?`${new Set(obs.flatMap(x=>urls(x.result.ok?x.result.data:null))).size} sources retained`:"No evidence yet"} icon={<ShieldCheck size={14}/>} tone="mint" active={!!result||claim!==null}/>
    {failed.length>0&&<button className="failure" onClick={()=>{const e=result?.state.trace.find(x=>x.type==="recovery");if(e)selectEvent(e.id)}}><AlertTriangle size={13}/><span>FAILED ROUTE</span><b>Inspect failure</b></button>}
    <div className="caption"><b>{claim!==null?`Tracing claim ${claim+1}`:"Investigation map"}</b><span>{claim!==null?"Related provenance illuminated":"Select an event to inspect it"}</span></div>
  </div>;
}

function Inspector({ result,event,claim,clearClaim,show }:{result:Result|null;event:TraceEvent|null;claim:number|null;clearClaim:()=>void;show:boolean}) {
  const observation=event?result?.state.observations.find(x=>x.step===event.step):undefined;
  return <aside className={`inspector mobile-panel ${show?"mobile-show":""}`}><Heading overline="Inspector rail" title={claim!==null?"Claim provenance":"Event inspector"} icon={<FileSearch size={15}/>}/>{claim!==null?<div className="inspect"><label className="mint"><ShieldCheck size={13}/>REVIEW SELECTED</label><h3>Claim {claim+1}</h3><p>This sentence is selected for review. Exact claim-to-source links are not recorded by this version; the observations below are run context, not verified support for this claim.</p><Provenance label="Claim" value={`Report sentence ${claim+1}`} tone="mint"/><Provenance label="Evidence" value={`${result?.state.observations.length??0} observations`} tone="mint"/><Provenance label="Claim mapping" value="Not recorded" tone="violet"/><button className="quiet" onClick={clearClaim}><X size={12}/>Clear trace</button></div>:event?<div className="inspect"><label className={tone(event.type)}>{icon(event.type)}{event.type.replace("_"," ")}</label><h3>{event.title}</h3><p>{event.detail}</p><dl><div><dt>Step</dt><dd>{event.step}</dd></div><div><dt>Recorded</dt><dd>{time(event.timestamp)}</dd></div>{observation&&<><div><dt>Tool</dt><dd>{observation.tool}</dd></div><div><dt>Latency</dt><dd>{observation.result.durationMs}ms</dd></div></>}</dl>{observation&&<pre>{JSON.stringify(observation.input,null,2)}</pre>}</div>:<div className="empty"><Radio size={24}/><h3>Nothing selected</h3><p>Launch a run, then select an event or report claim.</p></div>}</aside>;
}

function Recorder({result,eventId,select,show}:{result:Result|null;eventId:string|null;select:(id:string)=>void;show:boolean}) { const events=result?.state.trace??[];return <section className={`recorder mobile-panel ${show?"mobile-show":""}`}><header><span>FLIGHT RECORDER</span><b>{events.length?`${events.length} recorded events`:"Awaiting launch"}</b></header><div className="event-track">{events.length?events.map((e,i)=><button className={`${eventId===e.id?"selected":""} ${e.type==="recovery"?"failed":""}`} key={e.id} onClick={()=>select(e.id)}><div><span>{String(i+1).padStart(2,"0")}</span><time>{time(e.timestamp)}</time></div><i className={tone(e.type)}>{icon(e.type)}</i><b>{e.title}</b><small>Step {e.step} · {e.type.replace("_"," ")}</small></button>):<div className="empty-track"><History size={18}/>Every real decision and tool result will appear here.</div>}</div></section> }

function Report({result,claim,setClaim}:{result:Result|null;claim:number|null;setClaim:(x:number|null)=>void}) {const claims=result?splitClaims(result.answer).slice(0,12):[];return <article className="report"><header><div><span>EVIDENCE REPORT</span><h2>{result?"Investigation findings":"No report recorded"}</h2></div>{result&&<label><ShieldCheck size={14}/>Run recorded</label>}</header>{result?<><div className="trace-tip"><Sparkles size={14}/><div><b>Review a finding</b><span>Select a sentence to inspect run context. Claim-level source mapping is not yet available.</span></div></div><div className="claims">{claims.map((x,i)=><button className={claim===i?"selected":""} onClick={()=>setClaim(claim===i?null:i)} key={x+i}><span>{String(i+1).padStart(2,"0")}</span><p>{x}</p><ChevronRight size={14}/></button>)}</div><details><summary>Read complete generated report</summary><div className="prose"><ReactMarkdown>{result.answer}</ReactMarkdown></div></details></>:<div className="empty"><FileSearch size={28}/><h3>Launch an investigation first</h3><p>Findings, citations, conflicts, and gaps will live here.</p></div>}</article>}

function Arena({comparison,loading,run}:{comparison:Comparison|null;loading:boolean;run:()=>void}) {return <div className="arena"><span>COMPARISON ARENA · BONUS TRACK</span><h2>Our framework against LangChain.</h2><p>The same question, model, and three tools enter both lanes. ProofPilot uses our custom plan → act → observe loop; the other lane uses LangChain’s standard agent runtime.</p><button className="compare-run" onClick={run} disabled={loading}>{loading?<LoaderCircle className="spin" size={14}/>:<Zap size={14}/>} {loading?"Running both systems…":"Run the head-to-head"}</button><div className="disclosure"><b><Info size={13}/>Fair-comparison setup</b><div><Metric label="Question" value="Identical"/><Metric label="Model" value={comparison?.configuration.model??"Free Groq model"}/><Metric label="Tools" value="Same 3"/><Metric label="Frameworks" value="Custom vs LangChain"/></div></div><div className="lanes"><Lane title="ProofPilot" subtitle="Our custom loop" live={!!comparison} events={comparison?.proofpilot.events??0} calls={comparison?.proofpilot.toolCalls??0} duration={comparison?.proofpilot.durationMs}/><Lane title="LangChain" subtitle="Standard framework" live={!!comparison} events={comparison?.baseline.events.length??0} calls={comparison?.baseline.toolCalls??0} duration={comparison?.baseline.durationMs}/></div>{comparison?<div className="comparison-note"><ShieldCheck size={15}/><div><b>Paired run recorded</b><p>Compare event visibility, tool calls, latency, recovery detail, and both final answers. The point is to show what our framework exposes that a standard abstraction hides.</p></div></div>:<div className="pending"><FlaskConical size={16}/><div><b>Ready for the bonus demonstration</b><p>Run both systems on the question above. The free Groq provider is used when configured, avoiding Gemini’s cooldown.</p></div></div>}</div>}
function Lane({title,subtitle,live,events,calls,duration}:{title:string;subtitle:string;live?:boolean;events:number;calls:number;duration?:number}) {return <section className={`lane ${live?"live":""}`}><header>{title==="ProofPilot"?<BrainCircuit size={17}/>:<Layers3 size={17}/>}<div><b>{title}</b><span>{subtitle}</span></div><i>{live?"RECORDED":"READY"}</i></header><div className="metrics"><Metric label="Events" value={events}/><Metric label="Tool calls" value={calls}/><Metric label="Duration" value={duration?`${(duration/1000).toFixed(1)}s`:"—"}/></div><div className="bars"><span>{events ? `${events} events recorded in this lane` : "No paired trace recorded"}</span></div></section>}

function Heading({overline,title,icon:ic}:{overline:string;title:string;icon:React.ReactNode}){return <div className="heading"><i>{ic}</i><div><span>{overline}</span><h2>{title}</h2></div></div>}
function Metric({label,value,amber}:{label:string;value:string|number;amber?:boolean}){return <div className={`metric ${amber?"amber":""}`}><span>{label}</span><b>{value}</b></div>}
function Node({cls,overline,title,icon:ic,tone:t,count,active}:{cls:string;overline:string;title:string;icon:React.ReactNode;tone:string;count?:number;active?:boolean}){return <div className={`node ${cls} ${t} ${active?"active":""}`}><i>{ic}</i><div><span>{overline}</span><b>{title}</b></div>{count!==undefined&&<em>{count}</em>}</div>}
function Provenance({label,value,tone}:{label:string;value:string;tone:string}){return <div className={`provenance ${tone}`}><i/><div><span>{label}</span><b>{value}</b></div></div>}
function Logo(){return <div className="logo"><BrainCircuit size={18}/></div>}
function tone(t:TraceEvent["type"]){return t==="recovery"?"amber":t==="tool_started"?"blue":t==="observation"||t==="final"?"mint":"violet"}
function icon(t:TraceEvent["type"]){return t==="recovery"?<AlertTriangle size={13}/>:t==="tool_started"?<Wrench size={13}/>:t==="observation"?<FileSearch size={13}/>:t==="final"?<Check size={13}/>:<BrainCircuit size={13}/>}
function time(x:string){return new Date(x).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
function urls(v:unknown):string[]{if(!v||typeof v!=="object")return[];if(Array.isArray(v))return v.flatMap(urls);return Object.entries(v).flatMap(([k,x])=>k==="url"&&typeof x==="string"?[x]:urls(x))}
function splitClaims(x:string){return x.replace(/```[\s\S]*?```/g,"").replace(/[#*_>`\[\]]/g,"").split(/(?<=[.!?])\s+|\n+/).map(y=>y.replace(/^[-\d.)\s]+/,"").trim()).filter(y=>y.length>35)}
