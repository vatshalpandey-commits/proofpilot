import type { TraceEvent } from "./types";

export function replayVisibility(trace: TraceEvent[], cursor: number | null) {
  const boundedCursor = cursor === null
    ? trace.length - 1
    : Math.max(-1, Math.min(cursor, trace.length - 1));
  const visibleTrace = trace.slice(0, boundedCursor + 1);
  return {
    visibleTrace,
    visibleEventIds: new Set(visibleTrace.map((event) => event.id)),
    observedSteps: new Set(
      visibleTrace
        .filter((event) => event.type === "observation" || event.type === "recovery")
        .map((event) => event.step),
    ),
    finalVisible: visibleTrace.some((event) => event.type === "final"),
  };
}
