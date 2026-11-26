"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/*
 * Website chat with the Nucleus AI assistant. It answers questions and books site
 * visits; the conversation itself is stored in Nucleus. The browser keeps only the
 * conversation id, its token and the visible messages, so the chat survives page changes.
 */

type Line = { role: "customer" | "assistant" | "booking" | "error"; text: string };
type Saved = { conversationId?: string; token?: string; lines: Line[] };

export function ChatWidget({ endpoint, businessName, phone, logo }: { endpoint: string; businessName: string; phone: string | null; logo?: string | null }) {
  const storageKey = `nucleus_chat:${endpoint}`;
  const greeting: Line = {
    role: "assistant",
    text: `Hi! I'm the ${businessName} assistant. Ask me anything about our services, or I can book a free site visit for you.`,
  };
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [saved, setSaved] = useState<Saved>({ lines: [] });
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setSaved(JSON.parse(raw));
      if (sessionStorage.getItem(storageKey + ":open") === "1") setOpen(true);
    } catch {}
  }, [storageKey]);

  // A friendly greeting pops up once per visit, a few seconds after arriving (not if they've chatted or closed it).
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(storageKey + ":teased") === "1" || Boolean(localStorage.getItem(storageKey)); } catch {}
    if (seen) return;
    const t = setTimeout(() => setTeaser(true), 6000);
    return () => clearTimeout(t);
  }, [storageKey]);
  const hideTeaser = () => {
    setTeaser(false);
    try { sessionStorage.setItem(storageKey + ":teased", "1"); } catch {}
  };

  const persist = (next: Saved) => {
    setSaved(next);
    try { localStorage.setItem(storageKey, JSON.stringify({ ...next, lines: next.lines.slice(-60) })); } catch {}
  };

  useEffect(() => {
    try { sessionStorage.setItem(storageKey + ":open", open ? "1" : "0"); } catch {}
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, storageKey]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [saved.lines.length, pending, open]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    const withUser: Saved = { ...saved, lines: [...saved.lines, { role: "customer", text }] };
    persist(withUser);
    setPending(true);
    let attribution: Record<string, string> = {};
    try { attribution = JSON.parse(sessionStorage.getItem("site_attr") || "{}"); } catch {}
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: saved.conversationId, token: saved.token, attribution: saved.conversationId ? undefined : { ...attribution, page_url: attribution.page_url || location.href } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        persist({ ...withUser, lines: [...withUser.lines, { role: "error", text: data.error || "Something went wrong." }] });
      } else {
        const lines: Line[] = [...withUser.lines, { role: "assistant", text: data.reply }];
        if (data.booking) lines.push({ role: "booking", text: `${data.booking.kind === "call" ? "Phone call" : "Site visit"} booked: ${data.booking.label}` });
        persist({ conversationId: data.conversationId, token: data.token, lines });
      }
    } catch {
      persist({ ...withUser, lines: [...withUser.lines, { role: "error", text: "Couldn't connect. Check your connection and try again." }] });
    } finally {
      setPending(false);
    }
  }

  const restart = () => persist({ lines: [] });
  const lines = [greeting, ...saved.lines];

  return (
    <>
      {!open && teaser && (
        <div role="status" className="fixed bottom-[8.5rem] right-4 z-50 w-64 rounded-2xl rounded-br-md border border-line bg-white p-3 pr-8 text-sm text-ink shadow-xl shadow-slate-900/15 sm:bottom-24 sm:right-6">
          <button onClick={hideTeaser} aria-label="Dismiss" className="absolute right-2 top-2 rounded p-0.5 text-muted hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <button onClick={() => { hideTeaser(); setOpen(true); }} className="text-left">
            <span className="font-semibold">Hi there 👋</span>
            <span className="mt-0.5 block text-muted">Questions about a project? Ask here and get an answer in seconds, or book a free visit.</span>
          </button>
        </div>
      )}
      {!open && (
        <button onClick={() => { hideTeaser(); setOpen(true); }} aria-label="Chat with us"
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full bg-brand py-2 pl-2 pr-4 font-semibold text-white shadow-xl shadow-slate-900/20 transition hover:bg-brand-dark sm:bottom-6 sm:right-6">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-9 w-9 rounded-full bg-white object-cover ring-2 ring-white/80" />
          ) : (
          <span className="flex h-9 w-9 items-center justify-center">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
          </span>
          )}
          <span className="hidden sm:inline">Questions? Chat with us</span>
          <span className="sm:hidden">Chat</span>
        </button>
      )}

      {open && (
        <section role="dialog" aria-label={`Chat with ${businessName}`}
          className="fixed inset-x-2 bottom-2 top-16 z-50 flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl shadow-slate-900/25 sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[600px] sm:max-h-[calc(100vh-3rem)] sm:w-[380px]">
          <header className="flex items-center gap-3 bg-brand px-4 py-3 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo && <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{businessName}</div>
              <div className="text-xs text-white/80">AI assistant · usually replies in seconds</div>
            </div>
            {saved.lines.length > 0 && <button onClick={restart} className="rounded px-2 py-1 text-xs text-white/85 hover:bg-white/10">New chat</button>}
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded p-1 hover:bg-white/10">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto bg-surface p-4 text-sm" aria-live="polite">
            {lines.map((l, i) =>
              l.role === "booking" ? (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft px-3 py-2.5 font-semibold text-brand-dark">
                  <Icon name="calendar" className="h-5 w-5 shrink-0" />{l.text}
                </div>
              ) : l.role === "error" ? (
                <p key={i} className="text-center text-xs text-red-700">{l.text}</p>
              ) : (
                <div key={i} className={`flex ${l.role === "customer" ? "justify-end" : ""}`}>
                  <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 leading-relaxed ${l.role === "customer" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-line bg-white text-ink"}`}>{l.text}</p>
                </div>
              ),
            )}
            {pending && (
              <div className="flex"><span className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-white px-3.5 py-3" aria-label="Assistant is typing">
                {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d * 150}ms` }} />)}
              </span></div>
            )}
            {saved.lines.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {["Book a free site visit", "What areas do you serve?", "Are you licensed and insured?"].map((q) => (
                  <button key={q} onClick={() => { setDraft(q); setTimeout(() => inputRef.current?.form?.requestSubmit(), 0); }}
                    className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand">{q}</button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={send} className="border-t border-line bg-white p-3">
            <div className="flex items-end gap-2">
              <textarea ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={1000}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Type your question…" aria-label="Message"
                className="input max-h-28 min-h-[42px] flex-1 resize-none py-2.5" />
              <button className="btn-primary h-[42px] px-3.5" disabled={pending || !draft.trim()} aria-label="Send">
                <Icon name="arrow" className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">
              AI assistant, so it can make mistakes.{phone ? <> Prefer a person? Call <a className="font-semibold text-brand" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a>.</> : null}
            </p>
          </form>
        </section>
      )}
    </>
  );
}
