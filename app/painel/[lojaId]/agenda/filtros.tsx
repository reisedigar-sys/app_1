"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FILTROS_STATUS, NOME_STATUS, type FiltroStatus } from "@/lib/painel/agenda";

const NOME_FILTRO: Record<FiltroStatus, string> = {
  ativos: "Todos menos cancelados",
  todos: "Todos",
  ...NOME_STATUS,
};

/** Filtros por profissional e status; ficam na URL para o link da agenda poder ser compartilhado. */
export function Filtros({ profissionais, mostrarProfissional }: { profissionais: { id: string; nome: string }[]; mostrarProfissional: boolean }) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();

  function mudar(chave: string, valor: string) {
    const novo = new URLSearchParams(params);
    if (valor) novo.set(chave, valor);
    else novo.delete(chave);
    router.push(`${caminho}?${novo}`);
  }

  const classe =
    "min-h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
  return (
    <div className="flex flex-wrap gap-2">
      {mostrarProfissional && (
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Profissional</span>
          <select aria-label="Profissional" className={classe} value={params.get("prof") ?? ""} onChange={(e) => mudar("prof", e.target.value)}>
            <option value="">Todos os profissionais</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">Status</span>
        <select aria-label="Status" className={classe} value={params.get("status") ?? "ativos"} onChange={(e) => mudar("status", e.target.value === "ativos" ? "" : e.target.value)}>
          {FILTROS_STATUS.map((s) => (
            <option key={s} value={s}>
              {NOME_FILTRO[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
