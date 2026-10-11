"use client";

import { FormAcao } from "@/components/form-acao";
import { Campo, Selecao } from "@/components/ui";
import { DIAS_SEMANA } from "@/lib/painel/formatos";
import { adicionarHorario } from "./acoes";

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function NovoHorario({
  lojaId,
  profissionalId,
  servicos,
}: {
  lojaId: string;
  profissionalId: string;
  servicos: { id: string; nome: string }[];
}) {
  return (
    <FormAcao acao={adicionarHorario} rotuloEnviar="Adicionar horário">
      {(erros) => (
        <>
          <input type="hidden" name="loja_id" value={lojaId} />
          <input type="hidden" name="profissional_id" value={profissionalId} />
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Dias</legend>
            <div className="flex flex-wrap gap-2">
              {ORDEM_DIAS.map((d) => (
                <label
                  key={d}
                  className="flex min-h-10 cursor-pointer items-center rounded-full border border-neutral-300 px-3 text-sm has-checked:border-teal-700 has-checked:bg-teal-700 has-checked:text-white dark:border-neutral-700"
                >
                  <input type="checkbox" name="dias" value={d} className="sr-only" defaultChecked={d >= 2 && d <= 6} />
                  {DIAS_SEMANA[d].slice(0, 3)}
                  <span className="sr-only">{DIAS_SEMANA[d].slice(3)}</span>
                </label>
              ))}
            </div>
            {erros.dias && <p className="text-xs text-red-600">{erros.dias}</p>}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Início" nome="inicio" type="time" step={300} defaultValue="09:00" erro={erros.inicio} />
            <Campo rotulo="Fim" nome="fim" type="time" step={300} defaultValue="18:00" erro={erros.fim} />
          </div>
          <Selecao rotulo="Vale para" nome="servico_id" defaultValue="">
            <option value="">Todos os serviços (horário geral)</option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                Só {s.nome}
              </option>
            ))}
          </Selecao>
          <p className="text-xs text-neutral-500">
            Se um serviço tiver horários “só para ele”, o profissional faz esse serviço apenas nesses horários. Ex.: tosa só
            terça e quinta de manhã.
          </p>
        </>
      )}
    </FormAcao>
  );
}
