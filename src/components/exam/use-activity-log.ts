"use client";

// Records what the candidate does during a mock (questions opened, options clicked, saves, leaving the tab,
// idle stretches) for the AI advisor's review after the test. Events go to their own endpoint in batches, so
// they never queue behind answer saves; a failed batch is kept and retried. Nothing here blocks the exam.

import { useCallback, useEffect, useRef } from "react";

export type ActivityKind =
  | "start" // page opened (also after a reload)
  | "view" // question shown
  | "pick" // option clicked (v = option)
  | "key" // typed-answer keypad press
  | "save" // Save & Next / Mark / Clear (v = answer, m = marked for review)
  | "hide" // tab hidden / window minimised
  | "show"
  | "blur" // another window focused
  | "focus"
  | "act" // the candidate is active (mouse, touch, keys), at most every 20 s
  | "calc" // calculator opened or closed
  | "submit" // submitted (v = "section" | "test" | "timeup")
  | "palette"; // question palette opened (phones)

export interface ActivityEvent {
  t: number;
  k: ActivityKind;
  q?: string;
  v?: string;
  m?: boolean;
}

const FLUSH_MS = 15_000;
const MAX_BUFFER = 3000;

export function useActivityLog(attemptId: string) {
  const buffer = useRef<ActivityEvent[]>([]);
  const sending = useRef(false);
  const lastAct = useRef(0);
  const url = `/api/attempts/${attemptId}/activity`;

  const log = useCallback((k: ActivityKind, q?: string, v?: string | null, m?: boolean) => {
    const e: ActivityEvent = { t: Date.now(), k };
    if (q) e.q = q;
    if (v != null && v !== "") e.v = String(v).slice(0, 40);
    if (m) e.m = true;
    buffer.current.push(e);
    if (buffer.current.length > MAX_BUFFER) buffer.current.splice(0, buffer.current.length - MAX_BUFFER);
  }, []);

  /** Sends what is buffered. `beacon` is for the page closing: the browser delivers it after the page is gone. */
  const flush = useCallback(
    async (beacon = false) => {
      if (!buffer.current.length || (sending.current && !beacon)) return;
      const batch = buffer.current.splice(0, 500);
      const body = JSON.stringify({ events: batch });
      if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        if (navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return;
      }
      sending.current = true;
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
        if (!res.ok && res.status >= 500) throw new Error(String(res.status));
      } catch {
        buffer.current.unshift(...batch); // try again with the next batch
      } finally {
        sending.current = false;
      }
    },
    [url]
  );

  useEffect(() => {
    log("start");
    const timer = setInterval(() => void flush(), FLUSH_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        log("hide");
        void flush(true);
      } else log("show");
    };
    const onBlur = () => log("blur");
    const onFocus = () => log("focus");
    const onPageHide = () => void flush(true);
    const onActive = () => {
      const now = Date.now();
      if (now - lastAct.current < 20_000) return;
      lastAct.current = now;
      log("act");
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pointerdown", onActive, { passive: true });
    window.addEventListener("keydown", onActive);
    window.addEventListener("wheel", onActive, { passive: true });
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pointerdown", onActive);
      window.removeEventListener("keydown", onActive);
      window.removeEventListener("wheel", onActive);
      void flush(true);
    };
  }, [flush, log]);

  return { log, flush };
}
