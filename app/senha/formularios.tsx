"use client";

import { FormAcao } from "@/components/form-acao";
import { Campo } from "@/components/ui";
import { pedirNovaSenha, salvarNovaSenha } from "./acoes";

export function FormularioEsqueci({ para }: { para: string }) {
  return (
    <FormAcao acao={pedirNovaSenha} rotuloEnviar="Enviar link">
      {(erros) => (
        <>
          <input type="hidden" name="para" value={para} />
          <Campo rotulo="E-mail" nome="email" type="email" autoComplete="email" erro={erros.email} />
        </>
      )}
    </FormAcao>
  );
}

export function FormularioNovaSenha({ para }: { para: string }) {
  return (
    <FormAcao acao={salvarNovaSenha} rotuloEnviar="Salvar nova senha">
      {(erros) => (
        <>
          <input type="hidden" name="para" value={para} />
          <Campo rotulo="Nova senha" nome="senha" type="password" autoComplete="new-password" erro={erros.senha} ajuda="Pelo menos 8 caracteres." />
          <Campo rotulo="Repita a nova senha" nome="confirmacao" type="password" autoComplete="new-password" erro={erros.confirmacao} />
        </>
      )}
    </FormAcao>
  );
}
