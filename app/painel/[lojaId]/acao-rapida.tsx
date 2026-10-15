"use client";

import { useActionState } from "react";
import { Botao } from "@/components/ui";
import { type Status, desfazer } from "@/lib/painel/agenda";
import type { Estado } from "@/lib/painel/estado";
import { mudarStatus } from "./agenda/acoes";

type Resultado = Estado & { de?: Status; para?: Status };

/** Próximo passo do atendimento a um toque, com "desfazer" logo depois (o banco confere a transição). */
export function AcaoRapida({
  lojaId,
  id,
  status,
  acao,
  operacao,
}: {
  lojaId: string;
  id: string;
  status: Status;
  acao: { status: Status; rotulo: string } | null;
  operacao: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(async (_: Resultado, form: FormData): Promise<Resultado> => {
    const r = await mudarStatus({}, form);
    return { ...r, de: form.get("de") as Status, para: form.get("status") as Status };
  }, {});
  // Só oferece desfazer enquanto o atendimento continua no status que este botão gravou.
  const volta = estado.ok && estado.de && estado.para === status ? desfazer(estado.de, estado.para, { operacao }) : null;
  if (!acao && !volta) return estado.ok === false ? <p className="text-xs text-red-700 dark:text-red-400">{estado.mensagem}</p> : null;

  return (
    <form action={enviar} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="loja_id" value={lojaId} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="de" value={status} />
      {acao && (
        <Botao type="submit" name="status" value={acao.status} disabled={pendente} className="min-h-10 px-3">
          {acao.rotulo}
        </Botao>
      )}
      {volta && (
        <Botao type="submit" name="status" value={volta} variante="secundario" disabled={pendente} className="min-h-10 px-3">
          Desfazer
        </Botao>
      )}
      {estado.ok === false && <p className="w-full text-xs text-red-700 dark:text-red-400">{estado.mensagem}</p>}
    </form>
  );
}
