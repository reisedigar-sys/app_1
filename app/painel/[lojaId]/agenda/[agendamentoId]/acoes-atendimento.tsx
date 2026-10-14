"use client";

import { useActionState, useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { AreaTexto, Aviso, Botao } from "@/components/ui";
import type { Status } from "@/lib/painel/agenda";
import { cancelarNoPainel, mudarStatus, salvarObservacoesAtendimento } from "../acoes";

/** Um botão por próximo status; o botão clicado vai no formulário (name="status"). */
export function AcoesStatus({ lojaId, id, acoes }: { lojaId: string; id: string; acoes: { status: Status; rotulo: string }[] }) {
  const [estado, acao, pendente] = useActionState(mudarStatus, {});
  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="loja_id" value={lojaId} />
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-2">
        {acoes.map((a, i) => (
          <Botao key={a.status} type="submit" name="status" value={a.status} disabled={pendente} variante={a.status === "faltou" ? "perigo" : i === 0 ? "primario" : "secundario"}>
            {a.rotulo}
          </Botao>
        ))}
      </div>
      {estado.mensagem && <Aviso tipo={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Aviso>}
    </form>
  );
}

export function Cancelar({ lojaId, id }: { lojaId: string; id: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, acao, pendente] = useActionState(cancelarNoPainel, {});
  if (estado.ok) return <Aviso tipo="ok">{estado.mensagem}</Aviso>;
  if (!confirmando)
    return (
      <Botao type="button" variante="perigo" onClick={() => setConfirmando(true)}>
        Cancelar atendimento
      </Botao>
    );
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="loja_id" value={lojaId} />
      <input type="hidden" name="id" value={id} />
      <span className="text-sm">Cancelar este atendimento?</span>
      <Botao type="submit" variante="perigo" disabled={pendente}>
        Sim, cancelar
      </Botao>
      <Botao type="button" variante="secundario" onClick={() => setConfirmando(false)}>
        Não
      </Botao>
      {estado.mensagem && <Aviso tipo="erro">{estado.mensagem}</Aviso>}
    </form>
  );
}

export function Observacoes({ lojaId, id, valor }: { lojaId: string; id: string; valor: string }) {
  return (
    <FormAcao acao={salvarObservacoesAtendimento} rotuloEnviar="Salvar observações">
      <input type="hidden" name="loja_id" value={lojaId} />
      <input type="hidden" name="id" value={id} />
      <AreaTexto rotulo="Observações" nome="observacoes" defaultValue={valor} maxLength={1000} />
    </FormAcao>
  );
}
