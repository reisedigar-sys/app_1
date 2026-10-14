"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/form-acao";
import { Aviso } from "@/components/ui";
import type { Estado } from "@/lib/painel/estado";
import { cancelar } from "./acoes";

/** `acaoCancelar`: outra Server Action com a mesma assinatura (ex.: pelo link de confirmação, sem login). */
export function CancelarAgendamento({
  id,
  politica,
  acaoCancelar = cancelar,
}: {
  id: string;
  politica: string;
  acaoCancelar?: (estado: Estado, form: FormData) => Promise<Estado>;
}) {
  const [estado, acao] = useActionState(acaoCancelar, {});
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
