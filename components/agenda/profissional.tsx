"use client";

import type { Profissional } from "@/lib/disponibilidade";

export function Estrelas({ nota, total }: { nota: number; total: number }) {
  const cheias = Math.round(nota);
  return (
    <span className="flex items-center gap-1 text-sm" aria-label={`Nota ${nota.toFixed(1).replace(".", ",")} de 5, ${total} avaliação(ões)`}>
      <span className="text-amber-500" aria-hidden>
        {"★".repeat(cheias)}
        <span className="text-neutral-300 dark:text-neutral-700">{"★".repeat(5 - cheias)}</span>
      </span>
      <span className="text-xs text-neutral-500">({total})</span>
    </span>
  );
}

export function Avatar({ foto, nome, tamanho = "size-12" }: { foto: string | null; nome: string; tamanho?: string }) {
  return (
    <span className={`flex ${tamanho} shrink-0 items-center justify-center overflow-hidden rounded-full bg-marca-50 font-medium text-marca-800 dark:bg-marca-950 dark:text-marca-200`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto do Storage */}
      {foto ? <img src={foto} alt="" className="size-full object-cover" /> : nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Opção de profissional com estrelas (só se houver avaliações) e "Saber mais" com a apresentação. */
export function OpcaoProfissional({
  p,
  selecionado,
  onEscolher,
  detalhe,
}: {
  p: Profissional;
  selecionado: boolean;
  onEscolher: () => void;
  detalhe?: string;
}) {
  return (
    <div className={`rounded-xl border bg-white p-3 dark:bg-neutral-950 ${selecionado ? "border-marca-700" : "border-neutral-200 dark:border-neutral-800"}`}>
      <label className="flex cursor-pointer items-center gap-3">
        <Avatar foto={p.fotoUrl} nome={p.nome} />
        <span className="flex flex-1 flex-col">
          <span className="font-medium">{p.nome}</span>
          {p.avaliacoes > 0 && p.notaMedia !== null && <Estrelas nota={p.notaMedia} total={p.avaliacoes} />}
          {detalhe && <span className="text-xs text-neutral-500">{detalhe}</span>}
        </span>
        <input type="radio" name="profissional" checked={selecionado} onChange={onEscolher} className="size-5 accent-marca-700" />
      </label>
      {p.bio && (
        <details className="mt-1 pl-15 text-sm">
          <summary className="cursor-pointer text-marca-700 dark:text-marca-400">Saber mais</summary>
          <p className="mt-1 text-neutral-600 dark:text-neutral-300">{p.bio}</p>
        </details>
      )}
    </div>
  );
}
