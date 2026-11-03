import type { ReactNode } from "react";

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-[1.6rem] font-extrabold leading-tight">{children}</h1>
      {sub && <p className="muted mt-1">{sub}</p>}
    </div>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="error-text">
      ⚠️ {children}
    </p>
  );
}

export function FormErrorBox({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="mb-4 rounded-2xl border-2 border-red-700 bg-red-50 p-4 font-bold text-red-800">
      ⚠️ {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-2xl border-2 border-red-700 bg-red-50 p-4 font-bold text-red-800">
      ⚠️ {message}
    </div>
  );
}

export function ProgressBar({ percent, tone = "blue", label }: { percent: number; tone?: "blue" | "orange" | "red" | "green"; label: string }) {
  const color = { blue: "#1e40af", orange: "#b45309", red: "#c2410c", green: "#166534" }[tone];
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div role="progressbar" aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-8 w-full overflow-hidden rounded-full border-2 border-ink bg-white">
        <div style={{ width: `${width}%`, background: color }} className="h-full" />
      </div>
    </div>
  );
}

export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "income" | "expense" | "balance" | "alert" | "ink"; sub?: string }) {
  const color = { income: "text-income", expense: "text-expense", balance: "text-balance", alert: "text-alert", ink: "text-ink" }[tone ?? "ink"];
  return (
    <div className="card">
      <p className="font-bold">{label}</p>
      <p className={`num ${color}`}>{value}</p>
      {sub && <p className="muted">{sub}</p>}
    </div>
  );
}
