"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/form-acao";
import { Aviso } from "@/components/ui";
import { cancelar } from "./acoes";

export function CancelarAgendamento({ id, politica }: { id: string; politica: string }) {
  const [estado, acao] = useActionState(cancelar, {});
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-red-700 dark:text-red-400">Cancelar</summary>
      <form action={acao} className="mt-2 flex flex-col gap-2 rounded-lg bg-red-50 p-3 dark:bg-red-950/40">
        <input type="hidden" name="id" value={id} />
        <p>{politica}</p>
        {estado.mensagem && <Aviso tipo="erro">{estado.mensagem}</Aviso>}
        <BotaoEnviar variante="perigo">Confirmar cancelamento</BotaoEnviar>
      </form>
    </details>
  );
}
