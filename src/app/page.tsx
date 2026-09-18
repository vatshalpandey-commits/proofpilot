"use client";

import { AlertTriangle, ArrowUpRight, BrainCircuit, Calculator, Check, ChevronRight, CircleStop, FileSearch, FlaskConical, GitBranch, GitCompareArrows, Globe2, History, Info, Layers3, LoaderCircle, Pause, Play, Radio, RotateCcw, Search, ShieldCheck, Sparkles, TerminalSquare, Wrench, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { replayVisibility } from "@/agent/replay";
import { readJsonResponse } from "@/lib/http";
import { OrbitalFilm } from "./orbital-film";

type ToolResult = { ok: true; data: unknown; durationMs: number } | { ok: false; error: string; code: string; retryable: boolean; durationMs: number };
type TraceEvent = { id: string; step: number; type: "decision" | "tool_started" | "observation" | "recovery" | "final"; title: string; detail: string; payload?:Record<string,unknown>; timestamp: string };
type Observation = { step: number; tool: string; input: Record<string, unknown>; result: ToolResult };
type EvidenceRecord = { id:string;title:string;url:string|null;supportingText:string;tool:string;step:number;eventId:string };
type ReportClaim = { id:string;text:string;evidenceIds:string[];contradictingEvidenceIds?:string[] };
type Assessment = { claimId:string;status:"supported"|"conflicting"|"insufficient_evidence";strength:"limited"|"moderate"|"strong";supportingEvidenceIds:string[];contradictingEvidenceIds:string[];explanation:{supportingRecords:number;independentSources:number;directRecords:number;conflictingRecords:number;reasons:string[];limitations:string[]} };
type ChallengeOutcome = {targetClaimId:string;verdict:"upheld"|"weakened"|"revised"|"unresolved";explanation:string;evidenceIds:string[]};
type Result = { answer: string; report:{answer:string;claims:ReportClaim[];assessments:Assessment[]}; challenge?:{outcomes:ChallengeOutcome[]}; status: "completed" | "max_steps"; state: { goal: string; plan: string[]; step: number; observations: Observation[]; evidence:EvidenceRecord[]; trace: TraceEvent[] } };
type View = "observe" | "trace" | "report" | "compare";
type ComparisonEvent = { sequence?:number; step?:number; type:string; title:string; detail:string };
type Comparison = { configuration:{model:string;tools:string[];stepCap:number;prompt:string}; proofpilot:{durationMs:number;toolCalls:number;events:number;recoveries:number;answer:string;trace:ComparisonEvent[]}; baseline:{answer:string;durationMs:number;modelCalls:number;toolCalls:number;events:ComparisonEvent[]};takeaways:Array<{label:string;finding:string;evidence:string}> };

const examples = ["Using current cost assumptions, estimate and compare the 10-year cost per MWh of solar and nuclear power for India. Show the calculation and verify the inputs.", "Is an electric car cheaper over 5 years than a petrol car in Dubai?", "Does a four-day work week improve productivity?"];

export default function Home() {
  const [question, setQuestion] = useState(examples[0]);
  const [chaos, setChaos] = useState(false);
  const [depth, setDepth] = useState<"quick"|"standard"|"deep">("standard");
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
  function playTransition() { setTransitionId(id => id + 1); }
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
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [challengeResult, setChallengeResult] = useState<Result | null>(null);
  const [challenging, setChallenging] = useState(false);
  const [replayCursor, setReplayCursor] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const observations = useMemo(() => result?.state.observations ?? [], [result]);
  const stats = useMemo(() => ({ calls: observations.length, failures: observations.filter(x => !x.result.ok).length, sources: new Set(observations.flatMap(x => urls(x.result.ok ? x.result.data : null))).size, time: observations.reduce((n, x) => n + x.result.durationMs, 0) }), [observations]);
  const replayResult = useMemo(() => projectReplay(result, replayCursor), [result, replayCursor]);
  const visibleResult = view === "trace" ? replayResult : result;
  const activeEvent = visibleResult?.state.trace.find(x => x.id === eventId) ?? visibleResult?.state.trace.at(-1) ?? null;

  useEffect(() => {
    if (!replayPlaying || !result) return;
    const timer = window.setInterval(() => setReplayCursor(cursor => {
      const next = (cursor ?? -1) + 1;
      if (next >= result.state.trace.length - 1) {
        setReplayPlaying(false);
        return result.state.trace.length - 1;
      }
      return next;
    }), 900);
    return () => window.clearInterval(timer);
  }, [replayPlaying, result]);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("revealed"); observer.unobserve(entry.target); } });
    }, { threshold: 0.08 });
    document.querySelectorAll("[data-reveal]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  async function launch() {
    if (question.trim().length < 10 || loading) return;
    setLoading(true); setError(""); setResult(null); setChallengeResult(null); setReplayCursor(null); setReplayPlaying(false); setEventId(null); setClaim(null); navigate("observe"); playTransition(); moveTo("workspace");
    try {
      const response = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question.trim(), chaosMode: chaos, depth }) });
      const body = await readJsonResponse<{message?:string}&Result>(response);
      if (!response.ok) throw new Error(body.message ?? "Research run failed");
      setResult(body);
      navigate("report");
      playTransition();
      moveTo("workspace");
    } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error"); }
    finally { setLoading(false); }
  }

  async function challengeAnswer() {
    if (!result?.report.claims.length || challenging) return;
    setChallenging(true); setError(""); setChallengeResult(null);
    try {
      const response = await fetch("/api/challenge", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ question:result.state.goal, claims:result.report.claims.map(({id,text})=>({id,text})), chaosMode:false }) });
      const body = await readJsonResponse<{message?:string}&Result>(response);
      if (!response.ok) throw new Error(body.message ?? "Challenge investigation failed");
      setChallengeResult(body);
    } catch(e) { setError(e instanceof Error ? e.message : "Challenge investigation failed"); }
    finally { setChallenging(false); }
  }

  function startReplay() {
    if (!result?.state.trace.length) return;
    navigate("trace"); setEventId(null); setReplayCursor(0); setReplayPlaying(true); moveTo("workspace");
  }

  async function compare() {
    if (question.trim().length < 10 || comparing) return;
    setComparing(true); setError(""); setComparison(null); navigate("compare"); playTransition(); moveTo("workspace");
    try {
      const response = await fetch("/api/compare", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({question:question.trim()}) });
      const body = await readJsonResponse<{message?:string}&Comparison>(response);
      if (!response.ok) throw new Error(body.message ?? "Comparison failed");
      setComparison(body);
      playTransition();
    } catch(e) { setError(e instanceof Error ? e.message : "Comparison failed"); }
    finally { setComparing(false); }
  }

  return <main className="shell">
    <a className="skip-link" href="#investigation">Skip to investigation</a>
    <header className="topbar">
      <div className="brand"><Logo /><div><b>ProofPilot</b><span>Evidence Intelligence · V3</span></div></div>
      <div className="run-id"><i className={loading ? "live" : ""} />{loading ? "RUNNING" : result ? result.status.toUpperCase() : "READY"}<em />{result ? `${result.state.trace.length} EVENTS` : "NO ACTIVE TRACE"}</div>
      <div className="top-actions"><button className="top-compare" onClick={openComparison}><GitCompareArrows size={14} />Compare <span>Bonus</span></button><a href="https://github.com/vatshalpandey-commits/proofpilot/blob/main/JUDGE_GUIDE.md" target="_blank" rel="noreferrer">How it works <ArrowUpRight size={13} /></a><a href="https://github.com/vatshalpandey-commits/proofpilot" target="_blank" rel="noreferrer">Source <ArrowUpRight size={13} /></a></div>
    </header>

    <section className="intro intro-compact">
      <p className="eyebrow">THE AGENT OBSERVATORY</p>
      <h1>A little more clarity.<br/><span>A lot more proof.</span></h1>
      <p className="intro-copy">Give your curiosity a direction. Follow the tools, explore the evidence, and see how an answer takes shape.</p>
      <a className="intro-link" href="#investigation">Start an investigation <ChevronRight size={18}/></a>
      <div className="intro-foot"><span>Built to investigate. Open to inspection.</span><span>01 — ASK</span></div>
    </section>
    <section className="investigation" id="investigation" aria-label="Research workspace">
    <div className="section-title" data-reveal><div><p className="eyebrow">YOUR NEXT QUESTION</p><h2>Look a little closer.</h2></div><p>One question. A trail you can follow.</p></div>
    <section className="mission-bar"><label><Search size={22} /><textarea rows={2} aria-label="Research mission" maxLength={3000} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); launch(); } }} /></label><div className="mission-actions"><div className="run-config"><button aria-pressed={chaos} title="Inject one labeled search-provider timeout so the real agent loop must recover" className={`chaos ${chaos ? "on" : ""}`} onClick={() => setChaos(!chaos)} disabled={loading}><FlaskConical size={17} />Fault injection <span>{chaos ? "ON" : "OFF"}</span></button><label className="depth-control"><span>Research depth</span><select aria-label="Research depth" value={depth} onChange={event=>setDepth(event.target.value as typeof depth)} disabled={loading}><option value="quick">Quick · 3 decisions</option><option value="standard">Standard · 5 decisions</option><option value="deep">Deep · 7 decisions</option></select></label></div><div className="run-actions"><button className="bonus-launch" onClick={openComparison} disabled={loading || comparing || question.trim().length<10}><GitCompareArrows size={17}/><span><b>LangChain comparison</b><small>Bonus experiment</small></span></button><button className="launch" onClick={launch} disabled={loading || comparing || question.trim().length<10}>{loading ? <LoaderCircle className="spin" size={18} /> : <ChevronRight size={18} />}{loading ? "Investigating…" : "Investigate"}</button></div></div><p className="fault-note">Fault injection is explicitly labeled: the adapter throws a real runtime error, then the custom loop must observe it and choose what to do next.</p></section>
    <div className="suggestions"><span>Or explore</span>{examples.map((example,index)=><button key={example} disabled={loading} onClick={()=>setQuestion(example)}>{["The energy transition","The real cost of an EV","The four-day week"][index]}<ArrowUpRight size={14}/></button>)}</div>
    {error && <div className="error"><CircleStop size={17} /><div><b>Research run stopped</b><p>{error}</p></div><button onClick={() => setError("")}><X size={14} /></button></div>}
    <nav className="mobile-tabs" style={{"--active": ["observe","trace","report","compare"].indexOf(view)} as React.CSSProperties} aria-label="Investigation views">{(["observe", "trace", "report", "compare"] as View[]).map(x => <button aria-current={view===x?"page":undefined} className={view === x ? "selected" : ""} onClick={() => { navigate(x); moveTo("workspace"); }} key={x}>{x}{x==="compare"&&<small>BONUS</small>}</button>)}</nav>

    <div className={`workspace mode-${view}`} id="workspace">
      {transitionId > 0 && <OrbitalFilm key={transitionId} transition />}
      <MissionRail result={result} stats={stats} show={view === "observe"} />
      <section key={view} className={`field view-${view}`}>{view === "report" ? <Report result={result} challenge={challengeResult} challenging={challenging} runChallenge={challengeAnswer} claim={claim} setClaim={setClaim} /> : view === "compare" ? <Arena comparison={comparison} loading={comparing} run={compare} /> : <><div className="field-heading"><span>{replayCursor!==null&&view==="trace"?"Research replay":"The observatory"}</span><span className="field-status"><i className={loading?"live":""}/>{loading?"Awaiting recorded results":replayCursor!==null&&view==="trace"?`EVENT ${replayCursor+1} / ${result?.state.trace.length??0}`:result?"Recorded investigation":"Ready when you are"}</span></div><Constellation result={visibleResult} loading={loading} claim={claim} activeEvent={activeEvent} selectEvent={setEventId} /></>}</section>
      <Inspector result={visibleResult} event={activeEvent} claim={claim} clearClaim={() => setClaim(null)} show={view === "trace"} />
      <Recorder result={result} eventId={eventId} select={setEventId} show={view === "trace"} replayCursor={replayCursor} playing={replayPlaying} start={startReplay} toggle={()=>setReplayPlaying(value=>!value)} scrub={setReplayCursor} stop={()=>{setReplayPlaying(false);setReplayCursor(null)}} />
    </div>
    </section>
    <section className="principles" data-reveal><div><p className="eyebrow">NOT JUST AN ANSWER</p><h2>The work behind it.</h2></div><div className="principle-grid"><article><span>01</span><h3>Decisions, in context.</h3><p>Inspect the agent’s recorded choices. See which tool it selected and what it asked.</p></article><article><span>02</span><h3>Evidence, kept close.</h3><p>Read source-backed findings alongside the observations gathered during the investigation.</p></article><article><span>03</span><h3>Failures, left visible.</h3><p>Unsuccessful attempts stay in the record. An incomplete run is never passed off as a finished answer.</p></article></div></section>
    <footer><span><ShieldCheck size={12} />Custom plan → act → observe loop</span><span><TerminalSquare size={12} />Configurable 3 / 5 / 7-decision budget</span><span><Radio size={12} />Runtime events recorded · injected faults labeled</span><span>Gemini + Groq fallback + Tavily</span></footer>
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
  const selectedClaim=claim!==null?result?.report.claims[claim]:undefined;
  const evidence=selectedClaim?result?.state.evidence.filter(item=>selectedClaim.evidenceIds.includes(item.id))??[]:[];
  const opposing=selectedClaim?result?.state.evidence.filter(item=>(selectedClaim.contradictingEvidenceIds??[]).includes(item.id))??[]:[];
  const assessment=selectedClaim?result?.report.assessments.find(item=>item.claimId===selectedClaim.id):undefined;
  return <aside className={`inspector mobile-panel ${show?"mobile-show":""}`}>
    <Heading overline="Inspector rail · structured payload" title={claim!==null?"Evidence chain":"Event inspector"} icon={<FileSearch size={15}/>}/>
    {selectedClaim?<div className="inspect">
      <label className={assessment?.status==="conflicting"?"amber":"mint"}>{assessment?.status==="conflicting"?<AlertTriangle size={13}/>:<ShieldCheck size={13}/>} {assessment?.status.replace("_"," ")??"VERIFIED MAPPING"}</label>
      <h3>{selectedClaim.text}</h3><p>{evidence.length} supporting and {opposing.length} challenging stored evidence records.</p>
      <div className="evidence-chain">{[...evidence,...opposing].map(item=>{const origin=result?.state.trace.find(trace=>trace.id===item.eventId);const challenges=opposing.some(record=>record.id===item.id);return <article className={challenges?"opposing":""} key={item.id}><header><span>{item.id}</span><b>{challenges?"Challenges · ":"Supports · "}{item.title}</b></header><blockquote>{item.supportingText}</blockquote><dl><div><dt>Origin</dt><dd>{item.tool} · step {item.step}</dd></div><div><dt>Recorded event</dt><dd>{origin?.title??item.eventId}</dd></div></dl>{item.url&&<a href={item.url} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={12}/></a>}</article>})}</div>
      <button className="quiet" onClick={clearClaim}><X size={12}/>Clear trace</button>
    </div>:claim!==null?<div className="empty"><AlertTriangle size={24}/><h3>No verified mapping</h3><p>This finding is not displayed because its evidence IDs did not resolve.</p></div>:event?<div className="inspect">
      <label className={tone(event.type)}>{icon(event.type)}{event.type.replace("_"," ")}</label><h3>{event.title}</h3><p>{event.detail}</p>
      <dl><div><dt>Step</dt><dd>{event.step}</dd></div><div><dt>Recorded</dt><dd>{time(event.timestamp)}</dd></div>{observation&&<><div><dt>Tool</dt><dd>{observation.tool}</dd></div><div><dt>Latency</dt><dd>{observation.result.durationMs}ms</dd></div></>}</dl>
      {event.payload&&<><h4 className="payload-title">Recorded decision payload</h4><pre>{JSON.stringify(event.payload,null,2)}</pre></>}
      {!event.payload&&observation&&<pre>{JSON.stringify(observation.input,null,2)}</pre>}
    </div>:<div className="empty"><Radio size={24}/><h3>Nothing selected</h3><p>Launch a run, then select an event or report claim.</p></div>}
  </aside>;
}

function Recorder({result,eventId,select,show,replayCursor,playing,start,toggle,scrub,stop}:{result:Result|null;eventId:string|null;select:(id:string)=>void;show:boolean;replayCursor:number|null;playing:boolean;start:()=>void;toggle:()=>void;scrub:(cursor:number)=>void;stop:()=>void}) { const events=result?.state.trace??[];return <section className={`recorder mobile-panel ${show?"mobile-show":""}`}><header><div><span>FLIGHT RECORDER</span><b>{events.length?`${events.length} recorded events`:"Awaiting launch"}</b></div>{events.length>0&&<div className="replay-controls"><button onClick={replayCursor===null?start:toggle}>{replayCursor===null||!playing?<Play size={13}/>:<Pause size={13}/>}<span>{replayCursor===null?"Replay":playing?"Pause":"Resume"}</span></button>{replayCursor!==null&&<button onClick={stop}><RotateCcw size={13}/><span>Live record</span></button>}</div>}</header>{replayCursor!==null&&<div className="replay-scrubber"><input aria-label="Research replay position" type="range" min="0" max={Math.max(0,events.length-1)} value={replayCursor} onChange={event=>{scrub(Number(event.target.value));select(events[Number(event.target.value)].id)}}/><span>{replayCursor+1} / {events.length}</span></div>}<div className="event-track">{events.length?events.map((e,i)=><button className={`${eventId===e.id||replayCursor===i?"selected":""} ${e.type==="recovery"?"failed":""} ${replayCursor!==null&&i>replayCursor?"future":""}`} key={e.id} onClick={()=>{select(e.id);scrub(i)}}><div><span>{String(i+1).padStart(2,"0")}</span><time>{time(e.timestamp)}</time></div><i className={tone(e.type)}>{icon(e.type)}</i><b>{e.title}</b><small>Step {e.step} · {e.type.replace("_"," ")}</small></button>):<div className="empty-track"><History size={18}/>Every real decision and tool result will appear here.</div>}</div></section> }

function Report({result,challenge,challenging,runChallenge,claim,setClaim}:{result:Result|null;challenge:Result|null;challenging:boolean;runChallenge:()=>void;claim:number|null;setClaim:(x:number|null)=>void}) {const claims=result?.report.claims??[];return <article className="report"><header><div><span>EVIDENCE INTELLIGENCE REPORT</span><h2>{result?"Investigation findings":"No report recorded"}</h2></div>{result&&<label><ShieldCheck size={14}/>{claims.length} mapped finding{claims.length===1?"":"s"}</label>}</header>{result?<><div className="trace-tip"><Sparkles size={14}/><div><b>Trace a claim to its source</b><span>Select a mapped finding to reveal support, conflicts, source material, and its recorded origin.</span></div></div>{claims.length?<><div className="claims">{claims.map((item,i)=>{const assessment=result.report.assessments.find(x=>x.claimId===item.id);return <button className={claim===i?"selected":""} onClick={()=>setClaim(claim===i?null:i)} key={item.id}><span>{item.id}</span><p>{item.text}</p><em className={`strength ${assessment?.strength??"limited"}`}>{assessment?.strength??"limited"}</em><ChevronRight size={14}/></button>})}</div><section className="radar"><header><div><span>CONTRADICTION RADAR</span><h3>What the evidence can actually carry.</h3></div><button onClick={runChallenge} disabled={challenging}>{challenging?<LoaderCircle className="spin" size={14}/>:<Zap size={14}/>} {challenging?"Challenging…":"Challenge my answer"}</button></header><div className="radar-grid">{result.report.assessments.map(assessment=><article className={assessment.status} key={assessment.claimId}><div><b>{assessment.claimId}</b><span className={`strength ${assessment.strength}`}>{assessment.strength}</span></div><h4>{assessment.status.replace("_"," ")}</h4><p>{assessment.explanation.reasons.join(" ")}</p>{assessment.explanation.limitations.length>0&&<ul>{assessment.explanation.limitations.map(item=><li key={item}>{item}</li>)}</ul>}</article>)}</div>{challenge&&<div className="challenge-results"><header><span>COUNTER-INVESTIGATION RECORDED</span><b>{challenge.state.trace.length} new events · {challenge.state.evidence.length} new evidence records</b></header>{challenge.challenge?.outcomes.length?<div>{challenge.challenge.outcomes.map(outcome=><article key={outcome.targetClaimId}><span className={`verdict ${outcome.verdict}`}>{outcome.verdict}</span><div><b>{outcome.targetClaimId}</b><p>{outcome.explanation}</p><small>{outcome.evidenceIds.length} counter-investigation evidence record{outcome.evidenceIds.length===1?"":"s"}</small></div></article>)}</div>:<p className="challenge-gap">The challenge run completed, but no outcome passed target-and-evidence validation.</p>}</div>}</section></>:<div className="mapping-gap"><AlertTriangle size={16}/><div><b>No claims passed provenance validation</b><p>The complete report remains available, but ProofPilot will not manufacture source links.</p></div></div>}<details><summary>Read complete generated report</summary><div className="prose"><ReactMarkdown>{result.report.answer}</ReactMarkdown></div></details></>:<div className="empty"><FileSearch size={28}/><h3>Launch an investigation first</h3><p>Findings, citations, conflicts, and gaps will live here.</p></div>}</article>}

function Arena({comparison,loading,run}:{comparison:Comparison|null;loading:boolean;run:()=>void}) {
  return <div className={`arena ${loading?"comparing":""}`}><span>COMPARISON ARENA · BONUS TRACK</span><h2>Our framework against LangChain.</h2><p>The same question, model, tools, and bounded task enter both lanes. This paired run is descriptive evidence—not a claim that either framework always wins.</p>
    <button className="compare-run" onClick={run} disabled={loading}>{loading?<LoaderCircle className="spin" size={14}/>:<Zap size={14}/>} {loading?"Running both systems…":"Run the head-to-head"}</button>
    {loading&&<div className="comparison-live" role="status"><div className="duel-orbit"><i/><i/><BrainCircuit size={23}/></div><div><b>Two real runs are in motion</b><p>Results appear only after both executions finish.</p></div></div>}
    <div className="disclosure"><b><Info size={13}/>Fair-comparison setup</b><div><Metric label="Question" value="Identical"/><Metric label="Model" value={comparison?.configuration.model??"Free Groq model"}/><Metric label="Tools" value="Same 3"/><Metric label="Budget" value={comparison?`${comparison.configuration.stepCap} decisions`:`Same bound`}/></div></div>
    <div className="lanes"><Lane title="ProofPilot" subtitle="Our custom loop" live={!!comparison} events={comparison?.proofpilot.events??0} calls={comparison?.proofpilot.toolCalls??0} duration={comparison?.proofpilot.durationMs}/><Lane title="LangChain" subtitle="Standard framework" live={!!comparison} events={comparison?.baseline.events.length??0} calls={comparison?.baseline.toolCalls??0} duration={comparison?.baseline.durationMs}/></div>
    {comparison?<><div className="comparison-note"><ShieldCheck size={15}/><div><b>What this paired run shows</b><p>Every statement below is calculated from these two recorded executions.</p></div></div><div className="takeaways">{comparison.takeaways.map(item=><article key={item.label}><span>{item.label}</span><b>{item.finding}</b><p>{item.evidence}</p></article>)}</div><div className="answer-compare"><ComparisonAnswer title="ProofPilot final answer" subtitle="Custom framework" answer={comparison.proofpilot.answer} tone="proof"/><ComparisonAnswer title="LangChain final answer" subtitle="Standard framework" answer={comparison.baseline.answer} tone="chain"/></div><div className="trace-compare"><ComparisonTrace title="ProofPilot trace" events={comparison.proofpilot.trace}/><ComparisonTrace title="LangChain trace" events={comparison.baseline.events}/></div></>:!loading&&<div className="pending"><FlaskConical size={16}/><div><b>Ready for the bonus demonstration</b><p>Run both systems on the same mission, then inspect the measured differences.</p></div></div>}
  </div>;
}
function Lane({title,subtitle,live,events,calls,duration}:{title:string;subtitle:string;live?:boolean;events:number;calls:number;duration?:number}) {return <section className={`lane ${live?"live":""}`}><header>{title==="ProofPilot"?<BrainCircuit size={17}/>:<Layers3 size={17}/>}<div><b>{title}</b><span>{subtitle}</span></div><i>{live?"RECORDED":"READY"}</i></header><div className="metrics"><Metric label="Events" value={events}/><Metric label="Tool calls" value={calls}/><Metric label="Duration" value={duration?`${(duration/1000).toFixed(1)}s`:"—"}/></div><div className="bars"><span>{events ? `${events} events recorded in this lane` : "No paired trace recorded"}</span></div></section>}
function ComparisonAnswer({title,subtitle,answer,tone}:{title:string;subtitle:string;answer:string;tone:string}){return <article className={`comparison-answer ${tone}`}><header><div><span>{subtitle}</span><h3>{title}</h3></div><Check size={16}/></header><div className="prose"><ReactMarkdown>{answer}</ReactMarkdown></div></article>}
function ComparisonTrace({title,events}:{title:string;events:ComparisonEvent[]}){return <details className="comparison-trace"><summary>{title}<span>{events.length} events</span></summary><div>{events.map((event,index)=><article key={`${event.title}-${index}`}><i>{String(index+1).padStart(2,"0")}</i><div><b>{event.title}</b><p>{event.detail}</p></div></article>)}</div></details>}

function Heading({overline,title,icon:ic}:{overline:string;title:string;icon:React.ReactNode}){return <div className="heading"><i>{ic}</i><div><span>{overline}</span><h2>{title}</h2></div></div>}
function Metric({label,value,amber}:{label:string;value:string|number;amber?:boolean}){return <div className={`metric ${amber?"amber":""}`}><span>{label}</span><b>{value}</b></div>}
function Node({cls,overline,title,icon:ic,tone:t,count,active}:{cls:string;overline:string;title:string;icon:React.ReactNode;tone:string;count?:number;active?:boolean}){return <div className={`node ${cls} ${t} ${active?"active":""}`}><i>{ic}</i><div><span>{overline}</span><b>{title}</b></div>{count!==undefined&&<em>{count}</em>}</div>}
function Logo(){return <div className="logo"><BrainCircuit size={18}/></div>}
function tone(t:TraceEvent["type"]){return t==="recovery"?"amber":t==="tool_started"?"blue":t==="observation"||t==="final"?"mint":"violet"}
function icon(t:TraceEvent["type"]){return t==="recovery"?<AlertTriangle size={13}/>:t==="tool_started"?<Wrench size={13}/>:t==="observation"?<FileSearch size={13}/>:t==="final"?<Check size={13}/>:<BrainCircuit size={13}/>}
function time(x:string){return new Date(x).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
function urls(v:unknown):string[]{if(!v||typeof v!=="object")return[];if(Array.isArray(v))return v.flatMap(urls);return Object.entries(v).flatMap(([k,x])=>k==="url"&&typeof x==="string"?[x]:urls(x))}

function projectReplay(result:Result|null,cursor:number|null):Result|null {
  if (!result || cursor===null) return result;
  const {visibleTrace:trace,visibleEventIds,observedSteps,finalVisible}=replayVisibility(result.state.trace,cursor);
  return {
    ...result,
    report:finalVisible?result.report:{answer:"",claims:[],assessments:[]},
    state:{
      ...result.state,
      step:trace.at(-1)?.step??0,
      trace,
      observations:result.state.observations.filter(observation=>observedSteps.has(observation.step)),
      evidence:result.state.evidence.filter(record=>visibleEventIds.has(record.eventId)),
    },
  };
}
