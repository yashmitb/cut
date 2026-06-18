"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isCancel } from "@/lib/retry";
import { CheckIcon, SparkIcon, WarnIcon } from "./Icons";

type Status = {
  hasKey: boolean;
  source: "saved" | "env" | "none";
  masked: string;
  visionModel: string;
  textModel: string;
};

export default function ApiKeyCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyInput, setKeyInput] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; error?: string; model?: string } | null>(null);
  const [modelInput, setModelInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const s = await api.getSettings();
    setStatus(s);
    setModelInput(s.visionModel);
    return s;
  }

  useEffect(() => {
    refresh()
      .catch((e) => { if (!isCancel(e)) setError((e as Error).message); })
      .finally(() => setLoading(false));
  }, []);

  async function saveKey() {
    const k = keyInput.trim();
    if (!k) return;
    setSaving(true);
    setError(null);
    setTest(null);
    try {
      await api.saveSettings({ gemini_api_key: k });
      setKeyInput("");
      await refresh();
      await runTest(); // confirm it works right away
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    setSaving(true);
    setError(null);
    setTest(null);
    try {
      await api.saveSettings({ gemini_api_key: "" });
      await refresh();
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveModel() {
    setSaving(true);
    setError(null);
    try {
      await api.saveSettings({ gemini_model: modelInput.trim() });
      await refresh();
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const r = await api.testSettings();
      setTest(r);
    } catch (e) {
      if (!isCancel(e)) setTest({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <section className="glass card p-5 mb-4"><div className="skeleton h-24 w-full rounded-2xl" /></section>;
  }

  const linked = status?.hasKey;
  const dot = linked ? "var(--p-fiber)" : "var(--p-warn)";

  return (
    <section className="glass card p-5 mb-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--p-cal)" }}><SparkIcon width={18} height={18} /></span>
        <p className="label !text-[13px]">AI connection</p>
      </div>

      {/* status */}
      <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{linked ? "Key linked" : "No key linked"}</p>
            <p className="text-xs text-[var(--muted)] truncate">
              {linked
                ? `${status!.masked} · ${status!.source === "env" ? "from server env" : "saved in app"}`
                : "Add your Gemini key to enable photo & chat AI"}
            </p>
          </div>
        </div>
        {linked && (
          <button onClick={runTest} disabled={testing} className="btn btn-ghost !py-2 !px-3 !text-xs flex-shrink-0">
            {testing ? <span className="spin w-3.5 h-3.5 rounded-full" style={{ border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "var(--fg)" }} /> : "Test"}
          </button>
        )}
      </div>

      {/* test result */}
      {test && (
        <div className="flex gap-2 p-3 rounded-xl text-xs" style={{ background: test.ok ? "rgba(181,232,201,0.1)" : "rgba(247,159,159,0.1)", border: `1px solid ${test.ok ? "rgba(181,232,201,0.25)" : "rgba(247,159,159,0.25)"}` }}>
          <span style={{ color: test.ok ? "var(--p-fiber)" : "var(--p-warn)" }} className="flex-shrink-0">
            {test.ok ? <CheckIcon width={15} height={15} /> : <WarnIcon width={15} height={15} />}
          </span>
          <span>{test.ok ? `Connection works — ${test.model} is responding.` : `Failed: ${test.error}`}</span>
        </div>
      )}

      {/* edit key */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              className="field pr-14"
              type={reveal ? "text" : "password"}
              placeholder={linked ? "Replace key…" : "Paste Gemini API key (AIza…)"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
            />
            {keyInput && (
              <button type="button" onClick={() => setReveal((r) => !r)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] pressable">
                {reveal ? "Hide" : "Show"}
              </button>
            )}
          </div>
          <button onClick={saveKey} disabled={!keyInput.trim() || saving} className="btn btn-primary !px-4">
            {saving ? "…" : "Link"}
          </button>
        </div>
        <p className="text-[11px] text-[var(--faint)]">
          Stored in your database, used only to call Gemini. Get a free key at{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline">aistudio.google.com/apikey</a>.
        </p>
      </div>

      {/* model override */}
      <details className="text-sm">
        <summary className="text-xs text-[var(--muted)] cursor-pointer select-none">Advanced — model</summary>
        <div className="flex gap-2 mt-2">
          <input className="field !text-sm" value={modelInput} onChange={(e) => setModelInput(e.target.value)} placeholder="gemini-2.5-flash" />
          <button onClick={saveModel} disabled={saving || !modelInput.trim()} className="btn btn-ghost !px-3 !text-xs">Save</button>
        </div>
        <p className="text-[11px] text-[var(--faint)] mt-1.5">Vision model for photos. Swap to e.g. a newer Gemini when available.</p>
      </details>

      {status?.source === "saved" && (
        <button onClick={removeKey} disabled={saving} className="text-xs text-[var(--faint)] hover:text-[var(--p-warn)] self-start pressable">
          Remove saved key
        </button>
      )}

      {error && <p className="text-xs" style={{ color: "var(--p-warn)" }}>{error}</p>}
    </section>
  );
}
