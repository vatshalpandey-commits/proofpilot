# ProofPilot Judge Guide

## What ProofPilot proves

ProofPilot is a transparent research agent built around our own bounded
`plan → act → observe → repeat` controller. LangChain is not used by the
ProofPilot agent. It appears only in the isolated bonus comparison endpoint.

## The core loop

`src/agent/loop.ts` owns execution. On every iteration it:

1. Builds a compact working state while preserving raw evidence separately.
2. Gives the model every registered tool definition.
3. Validates the model's structured decision.
4. Executes the selected tool through `ToolRegistry`.
5. Records the observation, provenance, decision payload, and recovery events.
6. Repeats until final synthesis or the configured safety limit.

There is no hardcoded query-to-tool routing. The Flight Recorder stores the
selected action, selected tool, arguments, available alternatives, plan, and a
short user-safe rationale. Private chain-of-thought is never requested or shown.

## Autonomous tools

- `web_search` discovers current sources and evidence snippets.
- `read_webpage` inspects a selected public source more closely.
- `calculator` evaluates mathematical expressions safely.

Use the calculation-focused preset with Standard or Deep research depth to
demonstrate the model selecting research and calculation tools as needed.

## Failure and recovery

“Fault injection” deliberately makes the first search adapter call throw a
labeled provider-timeout error. The failure is injected, but the thrown error,
tool result, observation, subsequent model decision, and recovery branch all
travel through the production registry and agent loop. The UI never presents
the injected failure as a spontaneous provider outage.

## Evidence intelligence

Final claims link only to evidence IDs captured from successful tool outputs.
Unknown IDs are discarded. Supporting and contradicting records remain
separate. Evidence strength is an explainable ordinal rubric based on stored
records, independent origins, directly read pages, and unresolved conflicts—not
a fabricated probability.

“Challenge My Answer” launches a second bounded investigation through the same
custom loop and returns validated outcomes: upheld, weakened, revised, or
unresolved. “Research Replay” derives visible state from the recorded event log.

## Fair LangChain comparison

`/api/compare` gives both lanes the same question, model family, three tools,
and bounded instructions. The interface reports measured event counts, tool
calls, and duration for that paired run. It does not claim one framework is
universally better based on a single execution.

## Recommended five-minute demo

1. Select Standard depth and launch the calculation-focused energy preset.
2. Open Trace and inspect a decision payload plus tool arguments.
3. Enable Fault injection and show the failed route followed by recovery.
4. Trace one final claim to its stored URL and originating event.
5. Run Challenge My Answer, then replay the Flight Recorder.
6. Open Compare and explain the measured paired-run takeaways.
