"use client";

import { FormAcao } from "@/components/form-acao";
import { AreaTexto, Caixa, Campo } from "@/components/ui";
import { criarProfissional, salvarProfissional } from "./acoes";
import { CampoFoto } from "./foto";

type Profissional = { id: string; nome: string; bio: string | null; foto_url: string | null; ordem: number; ativo: boolean };

export function NovoProfissional({ lojaId }: { lojaId: string }) {
  return (
    <FormAcao acao={criarProfissional} rotuloEnviar="Adicionar profissional">
      {(erros) => (
        <>
          <input type="hidden" name="loja_id" value={lojaId} />
          <CampoFoto lojaId={lojaId} />
          <Campo rotulo="Nome" nome="nome" erro={erros.nome} />
          <AreaTexto rotulo="Apresentação (aparece em “Saber mais”)" nome="bio" maxLength={500} />
        </>
      )}
    </FormAcao>
  );
}

export function EditarProfissional({ lojaId, p }: { lojaId: string; p: Profissional }) {
  return (
    <FormAcao acao={salvarProfissional}>
      {(erros) => (
        <>
          <input type="hidden" name="loja_id" value={lojaId} />
          <input type="hidden" name="id" value={p.id} />
          <CampoFoto lojaId={lojaId} inicial={p.foto_url} />
          <Campo rotulo="Nome" nome="nome" defaultValue={p.nome} erro={erros.nome} />
          <AreaTexto rotulo="Apresentação" nome="bio" defaultValue={p.bio ?? ""} maxLength={500} />
          <Campo rotulo="Ordem de exibição" nome="ordem" type="number" inputMode="numeric" defaultValue={p.ordem} />
          <Caixa rotulo="Ativo (aparece na agenda)" nome="ativo" defaultChecked={p.ativo} />
        </>
      )}
    </FormAcao>
  );
}
