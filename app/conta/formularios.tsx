"use client";

import { FormAcao } from "@/components/form-acao";
import { Campo } from "@/components/ui";
import { cadastrarTutor, entrarTutor, salvarPerfil } from "./acoes";

export function FormularioEntrarTutor({ voltar }: { voltar: string }) {
  return (
    <FormAcao acao={entrarTutor} rotuloEnviar="Entrar">
      {(erros) => (
        <>
          <input type="hidden" name="voltar" value={voltar} />
          <Campo rotulo="E-mail" nome="email" type="email" autoComplete="email" erro={erros.email} />
          <Campo rotulo="Senha" nome="senha" type="password" autoComplete="current-password" erro={erros.senha} />
        </>
      )}
    </FormAcao>
  );
}

export function FormularioCadastroTutor({ voltar }: { voltar: string }) {
  return (
    <FormAcao acao={cadastrarTutor} rotuloEnviar="Criar conta">
      {(erros) => (
        <>
          <input type="hidden" name="voltar" value={voltar} />
          <Campo rotulo="E-mail" nome="email" type="email" autoComplete="email" erro={erros.email} />
          <Campo rotulo="Senha" nome="senha" type="password" autoComplete="new-password" erro={erros.senha} ajuda="Pelo menos 8 caracteres." />
        </>
      )}
    </FormAcao>
  );
}

export function FormularioPerfil({ voltar, nome, telefone }: { voltar: string; nome?: string; telefone?: string }) {
  return (
    <FormAcao acao={salvarPerfil} rotuloEnviar="Salvar e continuar">
      {(erros) => (
        <>
          <input type="hidden" name="voltar" value={voltar} />
          <Campo rotulo="Seu nome" nome="nome" autoComplete="name" defaultValue={nome} erro={erros.nome} />
          <Campo
            rotulo="Celular (WhatsApp)"
            nome="telefone"
            type="tel"
            autoComplete="tel"
            placeholder="(11) 98888-7777"
            defaultValue={telefone}
            erro={erros.telefone}
            ajuda="A loja usa para confirmar o horário e avisar quando o pet estiver pronto."
          />
        </>
      )}
    </FormAcao>
  );
}
