// Turns a mock's activity log (src/components/exam/use-activity-log.ts) into facts per question and per test:
// time spent, visits, options clicked in order, answers changed, quick answers, time away from the test, idle
// stretches and section pacing. These, with the official solutions, are what the AI advisor works from.
import type { ActivityEvent } from "@/components/exam/use-activity-log";

/** A gap longer than this between two events (page still visible) is counted as idle. */
const IDLE_GAP_MS = 120_000;
/** Time is never attributed in one stretch longer than this (sleep, lost connection, a left-open laptop). */
const MAX_STRETCH_MS = 15 * 60_000;

export interface QuestionFacts {
  questionId: string;
  /** Seconds the question was on screen with the test in view. */
  timeSec: number;
  visits: number;
  /** Options clicked and answers saved, in order, without repeats in a row (e.g. ["B", "C", "B"]). */
  path: string[];
  /** Seconds from first opening the question to the first option clicked. */
  firstPickSec: number | null;
  markedForReview: boolean;
  /** Time (ms since epoch) of the last save, if any. */
  lastSaveAt: number | null;
}

export interface TestFacts {
  hasActivity: boolean;
  /** Seconds between the first and last event. */
  spanSec: number;
  /** Seconds with the test hidden or another window in front. */
  awaySec: number;
  awayCount: number;
  idleStretches: Array<{ atMin: number; minutes: number }>;
  calculatorUses: number;
  reloads: number;
  questions: Map<string, QuestionFacts>;
  firstEventAt: number | null;
  lastEventAt: number | null;
}

export function parseActivity(batches: Array<{ events: string }>): ActivityEvent[] {
  const all: ActivityEvent[] = [];
  for (const b of batches) {
    try {
      const arr = JSON.parse(b.events) as ActivityEvent[];
      if (Array.isArray(arr)) all.push(...arr);
    } catch {
      // a damaged batch is skipped
    }
  }
  // Batches can arrive out of order (retries): sort by time; keep a stable order for equal times.
  return all.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map((x) => x.e);
}

export function analyseActivity(events: ActivityEvent[]): TestFacts {
  const facts: TestFacts = {
    hasActivity: events.length > 0,
    spanSec: 0,
    awaySec: 0,
    awayCount: 0,
    idleStretches: [],
    calculatorUses: 0,
    reloads: 0,
    questions: new Map(),
    firstEventAt: events[0]?.t ?? null,
    lastEventAt: events[events.length - 1]?.t ?? null,
  };
  if (!events.length) return facts;

  const q = (id: string) => {
    let f = facts.questions.get(id);
    if (!f) {
      f = { questionId: id, timeSec: 0, visits: 0, path: [], firstPickSec: null, markedForReview: false, lastSaveAt: null };
      facts.questions.set(id, f);
    }
    return f;
  };
  const firstView = new Map<string, number>();
  const pushPath = (f: QuestionFacts, v: string | undefined) => {
    if (!v) return;
    if (f.path[f.path.length - 1] !== v) f.path.push(v);
  };

  let current: string | null = null;
  let lastStart = -Infinity;
  let hidden = false;
  let blurred = false;
  let awayStart: number | null = null;
  let prev = events[0].t;
  const start = events[0].t;

  for (const e of events) {
    const gap = Math.min(e.t - prev, MAX_STRETCH_MS);
    const inView = !hidden && !blurred;
    if (gap > 0 && inView && current) q(current).timeSec += gap / 1000;
    if (inView && e.t - prev > IDLE_GAP_MS) {
      facts.idleStretches.push({ atMin: Math.round((prev - start) / 60000), minutes: Math.round(((e.t - prev) / 60000) * 10) / 10 });
    }
    prev = e.t;

    switch (e.k) {
      case "start":
        // Two starts within a few seconds are one page load (React mounts twice in development).
        if (e.t - lastStart > 3000 && e.t !== start) facts.reloads++;
        lastStart = e.t;
        hidden = false;
        blurred = false;
        break;
      case "view":
        // Showing the question that is already on screen (a re-render, or right after a reload) is not a new visit.
        if (e.q && e.q !== current) {
          current = e.q;
          const f = q(e.q);
          f.visits++;
          if (!firstView.has(e.q)) firstView.set(e.q, e.t);
        }
        break;
      case "pick":
        if (e.q) {
          const f = q(e.q);
          pushPath(f, e.v);
          if (f.firstPickSec === null && firstView.has(e.q)) f.firstPickSec = Math.round((e.t - firstView.get(e.q)!) / 1000);
        }
        break;
      case "save":
        if (e.q) {
          const f = q(e.q);
          pushPath(f, e.v);
          f.markedForReview = !!e.m;
          f.lastSaveAt = e.t;
        }
        break;
      case "hide":
      case "blur":
        if (!hidden && !blurred) {
          awayStart = e.t;
          facts.awayCount++;
        }
        if (e.k === "hide") hidden = true;
        else blurred = true;
        break;
      case "show":
      case "focus":
        if (e.k === "show") hidden = false;
        else blurred = false;
        if (!hidden && !blurred && awayStart !== null) {
          facts.awaySec += Math.min(e.t - awayStart, MAX_STRETCH_MS) / 1000;
          awayStart = null;
        }
        break;
      case "calc":
        facts.calculatorUses++;
        break;
    }
  }
  facts.spanSec = (events[events.length - 1].t - start) / 1000;
  facts.awaySec = Math.round(facts.awaySec);
  for (const f of facts.questions.values()) f.timeSec = Math.round(f.timeSec);
  return facts;
}
