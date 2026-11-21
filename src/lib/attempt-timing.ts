// Pure timing rules for an attempt: which section is open and when time runs out.
// Shared by the server (authoritative) and tests; no database access here.
import type { ExamPattern, PaperSection } from "./exam-patterns";

export interface AttemptTimingInput {
  mode: string;
  startedAt: Date;
  endsAt: Date | null;
  sectionOrder: string | null;
  currentSection: number;
  sectionStartedAt: Date | null;
  sectionExtraSeconds: number;
}

export interface TimingState {
  /** Mock attempt of a sectional pattern: one section open at a time. */
  sectional: boolean;
  /** Section names in the order this candidate takes them. */
  order: string[];
  /** Index into `order` of the open section (sectional only). */
  currentSection: number;
  sectionStartedAt: Date | null;
  sectionExtraSeconds: number;
  sectionDeadline: Date | null;
  overallDeadline: Date | null;
  /** All time is used up; the attempt must be submitted. */
  finished: boolean;
}

/** The candidate's section order: the stored order, restricted to real sections, plus any missing ones. */
export function attemptOrder(stored: string | null, sections: PaperSection[]): string[] {
  const names = sections.map((s) => s.name);
  let parsed: unknown = null;
  try {
    parsed = stored ? JSON.parse(stored) : null;
  } catch {
    parsed = null;
  }
  const chosen = Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string" && names.includes(n)) : [];
  const unique = [...new Set(chosen)];
  return [...unique, ...names.filter((n) => !unique.includes(n))];
}

/**
 * Works out the open section and deadlines at `now`. For sectional attempts it moves past every section
 * whose time has run out (the clock keeps running while the candidate is away), and reports whether the
 * stored state needs updating.
 */
export function computeTiming(
  attempt: AttemptTimingInput,
  sections: PaperSection[],
  pattern: ExamPattern,
  now: Date
): { state: TimingState; changed: boolean } {
  const order = attemptOrder(attempt.sectionOrder, sections);
  const isMock = attempt.mode === "MOCK";

  if (!isMock || pattern.timing !== "sectional" || sections.length === 0) {
    const overallDeadline = isMock ? attempt.endsAt : null;
    return {
      state: {
        sectional: false,
        order,
        currentSection: 0,
        sectionStartedAt: null,
        sectionExtraSeconds: 0,
        sectionDeadline: null,
        overallDeadline,
        finished: !!overallDeadline && now.getTime() >= overallDeadline.getTime(),
      },
      changed: false,
    };
  }

  const duration = (name: string) => (sections.find((s) => s.name === name)?.durationSeconds ?? 0) * 1000;
  let idx = Math.max(0, attempt.currentSection);
  let start = attempt.sectionStartedAt ?? attempt.startedAt;
  let extra = attempt.sectionExtraSeconds;
  let changed = false;

  while (idx < order.length) {
    const deadline = start.getTime() + duration(order[idx]) + extra * 1000;
    if (now.getTime() < deadline) break;
    start = new Date(deadline);
    idx++;
    extra = 0;
    changed = true;
  }

  const finished = idx >= order.length;
  const sectionDeadline = finished ? null : new Date(start.getTime() + duration(order[idx]) + extra * 1000);
  let overallMs = sectionDeadline ? sectionDeadline.getTime() : start.getTime();
  for (let i = idx + 1; i < order.length; i++) overallMs += duration(order[i]);

  return {
    state: {
      sectional: true,
      order,
      currentSection: Math.min(idx, order.length - 1),
      sectionStartedAt: start,
      sectionExtraSeconds: extra,
      sectionDeadline,
      overallDeadline: new Date(overallMs),
      finished,
    },
    changed,
  };
}

/** Seconds of grace for a save that was sent just before a deadline. */
export const SAVE_GRACE_SECONDS = 10;
