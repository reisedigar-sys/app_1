import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
const variantes = {
  primario: "bg-marca-700 text-white hover:bg-marca-800",
  secundario: "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100",
  perigo: "border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-neutral-900 dark:text-red-400",
};

export function Botao({ variante = "primario", className = "", ...props }: ComponentProps<"button"> & { variante?: keyof typeof variantes }) {
  return <button className={`${base} ${variantes[variante]} ${className}`} {...props} />;
}

export function BotaoLink({ variante = "primario", className = "", ...props }: ComponentProps<typeof Link> & { variante?: keyof typeof variantes }) {
  return <Link className={`${base} ${variantes[variante]} ${className}`} {...props} />;
}

export const classeInput =
  "min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-600/20 aria-invalid:border-red-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

// O rótulo envolve o campo: a associação não depende de id, que se repetiria entre páginas
// mantidas no DOM pelo roteador (o Next preserva telas visitadas para voltar instantaneamente).
export function Campo({
  rotulo,
  nome,
  erro,
  ajuda,
  className = "",
  ...props
}: ComponentProps<"input"> & { rotulo: string; nome: string; erro?: string; ajuda?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{rotulo}</span>
        <input name={nome} aria-invalid={erro ? true : undefined} className={classeInput} {...props} />
      </label>
      {ajuda && !erro && <p className="text-xs text-neutral-500">{ajuda}</p>}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}

export function Selecao({
  rotulo,
  nome,
  erro,
  children,
  className = "",
  ...props
}: ComponentProps<"select"> & { rotulo: string; nome: string; erro?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{rotulo}</span>
        <select name={nome} aria-label={rotulo} aria-invalid={erro ? true : undefined} className={classeInput} {...props}>
          {children}
        </select>
      </label>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}

export function AreaTexto({ rotulo, nome, ...props }: ComponentProps<"textarea"> & { rotulo: string; nome: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{rotulo}</span>
      <textarea name={nome} rows={3} className={`${classeInput} py-2`} {...props} />
    </label>
  );
}

export function Caixa({ rotulo, nome, ...props }: ComponentProps<"input"> & { rotulo: string; nome: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input type="checkbox" name={nome} className="size-5 accent-marca-700" {...props} />
      {rotulo}
    </label>
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 ${className}`}>
      {children}
    </section>
  );
}

export function Titulo({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{children}</h1>
      {acao}
    </div>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "erro" | "ok" | "alerta"; children: ReactNode }) {
  const cores = {
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
    erro: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    alerta: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  };
  return (
    <div role={tipo === "erro" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${cores[tipo]}`}>
      {children}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">{children}</p>;
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <span className="sr-only">{texto}</span>
      <div className="h-6 w-40 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-24 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900" />
      <div className="h-24 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900" />
    </div>
  );
}
