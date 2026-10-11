"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { Estado } from "@/lib/painel/estado";
import { Aviso, Botao } from "./ui";

type Acao = (estado: Estado, form: FormData) => Promise<Estado>;

/**
 * Formulário ligado a uma Server Action: mostra erro/sucesso e repassa os erros por campo
 * para `children` quando ele é uma função.
 */
export function FormAcao({
  acao,
  children,
  rotuloEnviar = "Salvar",
  className = "flex flex-col gap-4",
  semBotao = false,
}: {
  acao: Acao;
  children: ReactNode | ((erros: Record<string, string>) => ReactNode);
  rotuloEnviar?: string;
  className?: string;
  semBotao?: boolean;
}) {
  const [estado, formAction] = useActionState(acao, {});
  const erros = estado.erros ?? {};
  return (
    <form action={formAction} className={className} noValidate>
      {typeof children === "function" ? children(erros) : children}
      {estado.mensagem && <Aviso tipo={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Aviso>}
      {!semBotao && <BotaoEnviar>{rotuloEnviar}</BotaoEnviar>}
    </form>
  );
}

export function BotaoEnviar({ children, variante }: { children: ReactNode; variante?: "primario" | "secundario" | "perigo" }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending} variante={variante} aria-busy={pending}>
      {pending ? "Salvando…" : children}
    </Botao>
  );
}
