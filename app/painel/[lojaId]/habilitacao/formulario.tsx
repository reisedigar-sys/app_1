"use client";

import { FormAcao } from "@/components/form-acao";
import { salvarHabilitacao } from "./acoes";

type Servico = { id: string; nome: string; tipo: string };
const FATORES = [
  [0.8, "20% mais rápido"],
  [1, "tempo padrão"],
  [1.2, "20% mais lento"],
  [1.5, "50% mais lento"],
] as const;

export function FormularioHabilitacao({
  lojaId,
  profissional,
  servicos,
  habilitados,
  editavel,
}: {
  lojaId: string;
  profissional: { id: string; nome: string };
  servicos: Servico[];
  habilitados: Record<string, number>;
  editavel: boolean;
}) {
  return (
    <FormAcao acao={salvarHabilitacao} semBotao={!editavel} rotuloEnviar={`Salvar ${profissional.nome}`}>
      <fieldset disabled={!editavel} className="flex flex-col">
        <legend className="sr-only">Serviços de {profissional.nome}</legend>
        <input type="hidden" name="loja_id" value={lojaId} />
        <input type="hidden" name="profissional_id" value={profissional.id} />
        {servicos.map((s) => {
          const id = `${profissional.id}-${s.id}`;
          return (
            <div key={s.id} className="flex min-h-12 items-center gap-3 border-b border-neutral-100 py-1 last:border-0 dark:border-neutral-900">
              <input type="hidden" name="exibido" value={s.id} />
              <input
                id={id}
                type="checkbox"
                name="servico"
                value={s.id}
                defaultChecked={s.id in habilitados}
                className="size-5 accent-teal-700"
              />
              <label htmlFor={id} className="flex-1 text-sm">
                {s.nome}
                {s.tipo === "adicional" && <span className="text-neutral-500"> · adicional</span>}
              </label>
              <select
                name={`fator:${s.id}`}
                aria-label={`Tempo de ${profissional.nome} em ${s.nome}`}
                defaultValue={String(habilitados[s.id] ?? 1)}
                className="min-h-10 rounded-lg border border-neutral-300 bg-white px-2 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              >
                {FATORES.map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </fieldset>
    </FormAcao>
  );
}
