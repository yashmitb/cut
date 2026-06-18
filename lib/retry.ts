// Central auto-retry with a visible countdown. Instead of surfacing a raw error,
// the app quietly logs it and retries on an escalating schedule: 3s, 5s, 10s,
// then every 60s — showing "Retrying in N…" the whole time.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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

let state: RetryState | null = null;
let canceled = false;
let tickId = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeRetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRetryState(): RetryState | null {
  return state;
}

/** Dismiss the active retry loop. */
export function cancelRetry() {
  canceled = true;
  state = null;
  emit();
}

function countdown(label: string, secs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const myTick = ++tickId;
    let left = secs;
    state = { label, secondsLeft: left };
    emit();
    const timer = setInterval(() => {
      if (canceled || myTick !== tickId) {
        clearInterval(timer);
        reject(new CancelError());
        return;
      }
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        state = { label, secondsLeft: 0 }; // "Retrying now…"
        emit();
        resolve();
      } else {
        state = { label, secondsLeft: left };
        emit();
      }
    }, 1000);
  });
}

/** Whether a thrown error is worth retrying (transient). */
export function isTransient(e: unknown): boolean {
  if (e instanceof ApiError) {
    // 429 (rate limit) and 5xx (server / upstream AI errors) are transient.
    // 4xx (bad request, auth, not found) are not — surface those.
    return e.status === 429 || e.status === 408 || e.status >= 500;
  }
  // network failures (fetch throws TypeError) — retry
  return true;
}

/**
 * Run `fn`, and on a transient failure show a countdown and retry forever
 * (3s → 5s → 10s → 60s → 60s …). Non-transient errors are rethrown immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, label = "Reconnecting"): Promise<T> {
  canceled = false;
  let attempt = 0;
  for (;;) {
    try {
      const result = await fn();
      if (state) {
        state = null;
        emit();
      }
      return result;
    } catch (e) {
      if (e instanceof CancelError) throw e;
      if (!isTransient(e)) {
        if (state) {
          state = null;
          emit();
        }
        throw e;
      }
      // quietly log — never shown to the user
      console.warn(`[retry] "${label}" attempt ${attempt + 1} failed; will retry.`, e);
      const wait = SCHEDULE[Math.min(attempt, SCHEDULE.length - 1)];
      attempt += 1;
      try {
        await countdown(label, wait);
      } catch {
        // cancelled mid-countdown
        throw new CancelError();
      }
    }
  }
}
