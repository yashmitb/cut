// Central auto-retry with a visible countdown. Instead of surfacing a raw error,
// the app quietly logs it and retries on an escalating schedule: 3s, 5s, 10s,
// then every 60s — showing "Retrying in N…" the whole time.
//
// Designed to be concurrency-safe: multiple in-flight calls can be retrying at
// once (e.g. the day's food + water load together) without cancelling each other.

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}

class CancelError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelError";
  }
}

/** True if an error is just the user dismissing the retry — don't surface it. */
export function isCancel(e: unknown): boolean {
  return e instanceof CancelError || (e instanceof Error && e.name === "CancelError");
}

const SCHEDULE = [3, 5, 10, 60]; // seconds between attempts (last value repeats)

export interface RetryState {
  label: string;
  secondsLeft: number; // 0 means "retrying now"
}

const active = new Map<number, RetryState>();
let nextId = 1;
let cancelEpoch = 0; // bumped on cancel; in-flight calls captured before the bump abort
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeRetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Show the countdown that's closest to its next attempt. */
export function getRetryState(): RetryState | null {
  let best: RetryState | null = null;
  for (const s of active.values()) {
    if (!best || s.secondsLeft < best.secondsLeft) best = s;
  }
  return best;
}

/** Dismiss every active retry. */
export function cancelRetry() {
  cancelEpoch += 1;
  active.clear();
  emit();
}

/** Whether a thrown error is worth retrying (transient). */
export function isTransient(e: unknown): boolean {
  if (e instanceof ApiError) {
    // The server already exhausted every AI model (RATE_LIMIT) or needs a key
    // (NO_KEY) — retrying client-side won't help, so surface those cleanly.
    if (e.code === "RATE_LIMIT" || e.code === "NO_KEY") return false;
    // 429 (rate limit) and 5xx (server / upstream errors) are transient.
    // Other 4xx (bad request, auth, not found) are not — surface those.
    return e.status === 429 || e.status === 408 || e.status >= 500;
  }
  // network failures (fetch throws TypeError) — retry
  return true;
}

function countdown(id: number, myEpoch: number, label: string, secs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let left = secs;
    active.set(id, { label, secondsLeft: left });
    emit();
    const timer = setInterval(() => {
      if (cancelEpoch !== myEpoch) {
        clearInterval(timer);
        active.delete(id);
        emit();
        reject(new CancelError());
        return;
      }
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        active.set(id, { label, secondsLeft: 0 }); // "Retrying now…"
        emit();
        resolve();
      } else {
        active.set(id, { label, secondsLeft: left });
        emit();
      }
    }, 1000);
  });
}

/**
 * Run `fn`, and on a transient failure show a countdown and retry forever
 * (3s → 5s → 10s → 60s → 60s …). Non-transient errors are rethrown immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, label = "Reconnecting"): Promise<T> {
  const myEpoch = cancelEpoch;
  const id = nextId++;
  let attempt = 0;
  try {
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof CancelError) throw e;
        if (cancelEpoch !== myEpoch) throw new CancelError();
        if (!isTransient(e)) throw e;
        // quietly log — never shown to the user
        console.warn(`[retry] "${label}" attempt ${attempt + 1} failed; will retry.`, e);
        const wait = SCHEDULE[Math.min(attempt, SCHEDULE.length - 1)];
        attempt += 1;
        await countdown(id, myEpoch, label, wait); // rejects CancelError if dismissed
      }
    }
  } finally {
    active.delete(id);
    emit();
  }
}
