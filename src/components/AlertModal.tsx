"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { AlertModalData } from "@/lib/alerts";

const KEY = "anxin-dismissed-alerts";

// 只記「看過這則提醒」的雜湊值，不把金額等財務內容存進瀏覽器
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}
const EVENT = "anxin-alerts-changed";
const PENDING = "__pending__";

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function dismiss(signature: string) {
  try {
    const list: string[] = JSON.parse(read());
    if (!list.includes(fingerprint(signature))) list.push(fingerprint(signature));
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* 無法記住時，下次再提醒一次也沒關係 */
  }
  window.dispatchEvent(new Event(EVENT));
}

const toneStyle = {
  danger: "border-alert bg-orange-50",
  warn: "border-expense bg-amber-50",
  ok: "border-ok bg-green-50",
} as const;
/** 超支、超過收入、逾期（danger）用紅色粗字，一眼就看得出來 */
const toneText = { danger: "text-red-700", warn: "", ok: "" } as const;
const toneIcon = { danger: "⚠️", warn: "🔔", ok: "🎉" } as const;

/**
 * 站內提醒視窗：不會自動消失，必須按「我知道了」。
 * 一次只會有一個視窗，所有提醒都列在同一個視窗裡。
 * 「看過了」只記在這台電腦的瀏覽器，不會改動任何記帳資料；提醒內容有變時會再次提醒。
 */
export function AlertModal({ data }: { data: AlertModalData | null }) {
  const stored = useSyncExternalStore(subscribe, read, () => PENDING);
  const buttonRef = useRef<HTMLButtonElement>(null);

  let open = false;
  if (data && stored !== PENDING) {
    try {
      open = !(JSON.parse(stored) as string[]).includes(fingerprint(data.signature));
    } catch {
      open = true;
    }
  }

  useEffect(() => {
    if (!open) return;
    buttonRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!data || !open) return null;
  const worst = data.items.some((i) => i.tone === "danger") ? "danger" : data.items.some((i) => i.tone === "warn") ? "warn" : "ok";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 sm:items-center sm:p-3" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[40rem] flex-col rounded-3xl border-4 border-alert bg-paper p-4 shadow-2xl sm:p-5"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
        <p aria-hidden="true" className="text-center text-[2rem] leading-none">
          {toneIcon[worst]}
        </p>
        <h2 id="alert-title" className="mb-2 mt-1 text-center text-[1.5rem] font-extrabold">
          {worst === "ok" ? "好消息" : "請注意！"}
        </h2>
        <div className="flex flex-col gap-3">
          {data.items.map((item) => (
            <section key={item.key} className={`rounded-2xl border-2 p-3 ${toneStyle[item.tone]}`}>
              <h3 className={`text-[1.3rem] font-extrabold ${toneText[item.tone]}`}>{item.title}</h3>
              {item.lines.map((line) => (
                <p key={line} className={`text-[1.1rem] font-bold ${toneText[item.tone]}`}>
                  {line}
                </p>
              ))}
              {item.href && (
                <Link href={item.href} onClick={() => dismiss(data.signature)} className="btn btn-secondary mt-3 w-full">
                  前往處理
                </Link>
              )}
            </section>
          ))}
        </div>
        </div>
        {/* 按鈕固定在視窗底部，內容再長也一定看得到、按得到 */}
        <button ref={buttonRef} type="button" className="btn btn-primary mt-3 w-full shrink-0 text-[1.3rem]" onClick={() => dismiss(data.signature)}>
          我知道了
        </button>
      </div>
    </div>
  );
}
