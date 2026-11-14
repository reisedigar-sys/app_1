"use client";

import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { Campo } from "@/components/ui";
import { DIAS_SEMANA } from "@/lib/painel/formatos";
import { adicionarFaixa, usarHorarioDaEquipe } from "./acoes";

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function NovaFaixa({ lojaId, diasLivres }: { lojaId: string; diasLivres: number[] }) {
  return (
    <FormAcao acao={adicionarFaixa} rotuloEnviar="Adicionar horário">
      {(erros, enviados) => {
        // Abre com os dias que ainda não têm horário; depois de um erro, com o que foi enviado.
        const marcados =
          enviados.dias !== undefined ? enviados.dias.split(",").filter(Boolean).map(Number) : diasLivres;
        return (
          <div key={JSON.stringify(enviados)} className="contents">
            <input type="hidden" name="loja_id" value={lojaId} />
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium">Dias</legend>
              <div className="flex flex-wrap gap-2">
                {ORDEM_DIAS.map((d) => (
                  <label
                    key={d}
                    className="flex min-h-11 cursor-pointer items-center rounded-full border border-neutral-300 px-3 text-sm has-checked:border-marca-700 has-checked:bg-marca-700 has-checked:text-white dark:border-neutral-700"
                  >
                    <input
                      type="checkbox"
                      name="dias"
                      aria-label={DIAS_SEMANA[d]}
                      value={d}
                      className="sr-only"
                      defaultChecked={marcados.includes(d)}
                    />
                    {DIAS_SEMANA[d].slice(0, 3)}
                  </label>
                ))}
              </div>
              {erros.dias && <p className="text-xs text-red-600">{erros.dias}</p>}
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Campo
                rotulo="Abre"
                nome="abre"
                type="time"
                step={300}
                defaultValue={enviados.abre || "08:00"}
                erro={erros.abre}
              />
              <Campo
                rotulo="Fecha"
                nome="fecha"
                type="time"
                step={300}
                defaultValue={enviados.fecha || "18:00"}
                erro={erros.fecha}
              />
            </div>
            <p className="text-xs text-neutral-500">
              Fecha para o almoço? Adicione duas faixas no mesmo dia (ex.: 08:00–12:00 e 13:00–18:00).
            </p>
          </div>
        );
      }}
    </FormAcao>
  );
}

export function UsarHorarioDaEquipe({ lojaId }: { lojaId: string }) {
  return (
    <FormAcao acao={usarHorarioDaEquipe} semBotao className="flex flex-col gap-3">
      <input type="hidden" name="loja_id" value={lojaId} />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Troca o horário acima pelos dias e horas em que alguém da equipe trabalha (em Horários).
      </p>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="confirmar" className="size-5 accent-marca-700" />
        Entendi: isso substitui o horário cadastrado acima.
      </label>
      <BotaoEnviar variante="secundario">Usar o horário da equipe</BotaoEnviar>
    </FormAcao>
  );
}
