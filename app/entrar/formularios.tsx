"use client";

import { FormAcao } from "@/components/form-acao";
import { Campo } from "@/components/ui";
import { cadastrar, entrar } from "./acoes";

export function FormularioEntrar() {
  return (
    <FormAcao acao={entrar} rotuloEnviar="Entrar">
      {(erros) => (
        <>
          <Campo rotulo="E-mail" nome="email" type="email" autoComplete="email" erro={erros.email} required />
          <Campo rotulo="Senha" nome="senha" type="password" autoComplete="current-password" erro={erros.senha} required />
        </>
      )}
    </FormAcao>
  );
}

export function FormularioCadastro() {
  return (
    <FormAcao acao={cadastrar} rotuloEnviar="Criar conta">
      {(erros) => (
        <>
          <Campo rotulo="Seu nome" nome="nome" autoComplete="name" erro={erros.nome} required />
          <Campo rotulo="E-mail" nome="email" type="email" autoComplete="email" erro={erros.email} required />
          <Campo
            rotulo="Senha"
            nome="senha"
            type="password"
            autoComplete="new-password"
            erro={erros.senha}
            ajuda="Pelo menos 8 caracteres."
            required
          />
        </>
      )}
    </FormAcao>
  );
}
