"use client";

// Background save queue for the mock-test screen. The candidate moves to the next question at once; answers
// are sent to the server here, one at a time and in the order given (one-way papers rely on that order).
// A network failure keeps the job and retries with backoff; nothing is dropped while the page is open.
// Before a section or the test is submitted, the page waits for the queue to drain (flush).

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveOutcome = { ok: true } | { ok: false; error: string; finished?: boolean };

export type SaveJob =
  | { kind: "save"; key: string; label: string; questionId: string; answer: string | null; markedForReview: boolean; visitNext: string | null }
  | { kind: "visit"; key: string; label: string; questionId: string }
  | { kind: "ping"; key: string; label: string };

interface Options {
  send: (job: SaveJob) => Promise<SaveOutcome>;
  /** The test has ended on the server (time up, or submitted elsewhere): stop and show the result. */
  onFinished: () => void;
  /** The server refused this job (e.g. section closed); it is dropped. */
  onRefused: (job: SaveJob, error: string) => void;
  /**
   * Browser storage key for unsent answers. They survive a reload, a closed tab or a crash while offline, and are
   * re-sent when the page opens again (onRestore lets the page show them first).
   */
  storageKey: string;
  onRestore: (jobs: SaveJob[]) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_RESTORE_AGE_MS = 6 * 60 * 60 * 1000;

function readStored(key: string): SaveJob[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const data = JSON.parse(raw) as { at: number; jobs: SaveJob[] };
    if (!data || !Array.isArray(data.jobs) || Date.now() - data.at > MAX_RESTORE_AGE_MS) return [];
    return data.jobs.filter((j) => j && j.kind === "save" && typeof j.questionId === "string");
  } catch {
    return [];
  }
}

function writeStored(key: string, jobs: SaveJob[]) {
  try {
    const saves = jobs.filter((j) => j.kind === "save");
    if (saves.length) window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), jobs: saves }));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage blocked or full: the in-memory queue still works for this page.
  }
}

export function useSaveQueue({ send, onFinished, onRefused, storageKey, onRestore }: Options) {
  const queue = useRef<SaveJob[]>([]);
  const running = useRef(false);
  const stopped = useRef(false);
  const idleWaiters = useRef<Array<() => void>>([]);
  const lastActivity = useRef(0);
  const [pending, setPending] = useState(0);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    lastActivity.current = Date.now(); // the page load itself was a request
  }, []);
  // Latest callbacks without restarting the pump.
  const cb = useRef({ send, onFinished, onRefused, onRestore });
  useEffect(() => {
    cb.current = { send, onFinished, onRefused, onRestore };
  });

  const keyRef = useRef(storageKey);
  useEffect(() => {
    keyRef.current = storageKey;
  });
  const sync = useCallback(() => {
    setPending(queue.current.length);
    writeStored(keyRef.current, stopped.current ? [] : queue.current);
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let backoff = 1000;
    while (queue.current.length && !stopped.current) {
      const job = queue.current[0];
      let res: SaveOutcome;
      try {
        res = await cb.current.send(job);
      } catch {
        // Network or server hiccup: keep the job, retry. The page shows that saving is delayed.
        setRetrying(true);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 8000);
        continue;
      }
      backoff = 1000;
      setRetrying(false);
      lastActivity.current = Date.now();
      queue.current.shift();
      sync();
      if (!res.ok) {
        if (res.finished) {
          stopped.current = true;
          queue.current = [];
          sync();
          cb.current.onFinished();
          break;
        }
        cb.current.onRefused(job, res.error);
      }
    }
    running.current = false;
    if (!queue.current.length) {
      const waiters = idleWaiters.current;
      idleWaiters.current = [];
      waiters.forEach((w) => w());
    }
  }, [sync]);

  /** Adds a job. A queued (not yet sent) save of the same question is replaced in place, keeping its turn. */
  const enqueue = useCallback(
    (job: SaveJob) => {
      if (stopped.current) return;
      const from = running.current ? 1 : 0; // never touch the job being sent
      const i = queue.current.findIndex((j, idx) => idx >= from && j.key === job.key);
      if (i >= 0) {
        const old = queue.current[i];
        queue.current[i] =
          job.kind === "save" && old.kind === "save" ? { ...job, visitNext: job.visitNext ?? old.visitNext } : job;
      } else {
        queue.current.push(job);
      }
      sync();
      void pump();
    },
    [pump, sync]
  );

  /** Resolves true once everything queued has been sent, or false after `timeoutMs`. */
  const flush = useCallback((timeoutMs: number) => {
    if (!queue.current.length && !running.current) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(false);
      }, timeoutMs);
      idleWaiters.current.push(() => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(true);
      });
    });
  }, []);

  // Answers left unsent by an earlier visit to this page (reload, closed tab, crash): show them and send them.
  useEffect(() => {
    const stored = readStored(storageKey);
    if (!stored.length) return;
    cb.current.onRestore(stored);
    stored.forEach((job) => enqueue(job));
  }, [enqueue, storageKey]);

  // Leaving the page while answers are still being sent: ask the browser to confirm.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (queue.current.length && !stopped.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return { enqueue, flush, pending, retrying, lastActivity };
}
