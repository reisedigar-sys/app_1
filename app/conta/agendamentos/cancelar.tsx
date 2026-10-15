"use client";

import { useActionState, useEffect, useState } from "react";
import { BotaoEnviar } from "@/components/form-acao";
import { Aviso, Botao } from "@/components/ui";
import type { Estado } from "@/lib/painel/estado";
import { cancelar } from "./acoes";

/**
 * Botão "Cancelar" com o mesmo peso de "Remarcar"; a confirmação abre numa folha com o prazo de cancelamento grátis.
 * `acaoCancelar`: outra Server Action com a mesma assinatura (ex.: pelo link de confirmação, sem login).
 */
export function CancelarAgendamento({
  id,
  politica,
  titulo = "Cancelar este horário?",
  acaoCancelar = cancelar,
}: {
  id: string;
  politica: string;
  titulo?: string;
  acaoCancelar?: (estado: Estado, form: FormData) => Promise<Estado>;
}) {
  const [estado, acao] = useActionState(acaoCancelar, {});
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto]);

  return (
    <>
      <Botao type="button" variante="perigo" onClick={() => setAberto(true)}>
        Cancelar
      </Botao>
      {aberto && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end">
          <button type="button" aria-label="Fechar" className="absolute inset-0 bg-neutral-900/40" onClick={() => setAberto(false)} />
          <form
            action={acao}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`t-cancelar-${id}`}
            className="relative mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-t-3xl bg-white px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-neutral-950"
          >
            <span aria-hidden className="mx-auto mb-1 block h-1 w-10 rounded-full bg-neutral-200 dark:bg-neutral-800" />
            <h2 id={`t-cancelar-${id}`} className="text-xl font-bold">
              {titulo}
            </h2>
            <input type="hidden" name="id" value={id} />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{politica}</p>
            {estado.mensagem && <Aviso tipo="erro">{estado.mensagem}</Aviso>}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Botao type="button" variante="secundario" autoFocus onClick={() => setAberto(false)}>
                Manter horário
              </Botao>
              <BotaoEnviar variante="perigo">Confirmar cancelamento</BotaoEnviar>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
