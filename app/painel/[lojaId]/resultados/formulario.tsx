"use client";

import { FormAcao } from "@/components/form-acao";
import { Campo } from "@/components/ui";
import { salvarFaltasAntes } from "./acoes";

export function FaltasAntes({ lojaId, valor }: { lojaId: string; valor: number | null }) {
  return (
    <FormAcao acao={salvarFaltasAntes} rotuloEnviar="Salvar referência">
      {(erros) => (
        <>
          <input type="hidden" name="loja_id" value={lojaId} />
          <Campo
            rotulo="Antes do Hora do Pet, quantos clientes faltavam a cada 100 agendamentos?"
            nome="faltas_antes_pct"
            inputMode="decimal"
            defaultValue={valor ?? ""}
            placeholder="Ex.: 15"
            ajuda="Use a média das 4 semanas antes de começar. Serve só para estimar as faltas evitadas."
            erro={erros.faltas_antes_pct}
          />
        </>
      )}
    </FormAcao>
  );
}
