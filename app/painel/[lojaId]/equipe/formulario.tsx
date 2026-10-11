"use client";

import { useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { Campo, Selecao } from "@/components/ui";
import { adicionarMembro } from "./acoes";

export function NovoMembro({ lojaId, profissionais }: { lojaId: string; profissionais: { id: string; nome: string }[] }) {
  const [papel, setPapel] = useState("atendente");
  return (
    <FormAcao acao={adicionarMembro} rotuloEnviar="Adicionar à equipe">
      {(erros) => (
        <>
          <input type="hidden" name="loja_id" value={lojaId} />
          <Campo
            rotulo="E-mail da pessoa"
            nome="email"
            type="email"
            erro={erros.email}
            ajuda="A pessoa precisa ter criado a conta em /entrar."
          />
          <Selecao rotulo="Papel" nome="papel" value={papel} onChange={(e) => setPapel(e.target.value)}>
            <option value="gerente">Gerente: configura a loja</option>
            <option value="atendente">Atendente: opera a agenda</option>
            <option value="profissional">Profissional: vê a própria agenda</option>
            <option value="dono">Dono: tudo, inclusive a equipe</option>
          </Selecao>
          {papel === "profissional" && (
            <Selecao rotulo="Qual profissional" nome="profissional_id" defaultValue="" erro={erros.profissional_id}>
              <option value="">Escolha…</option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          )}
        </>
      )}
    </FormAcao>
  );
}
