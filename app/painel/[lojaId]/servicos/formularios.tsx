"use client";

import { FormAcao } from "@/components/form-acao";
import { AreaTexto, Caixa, Campo, Selecao } from "@/components/ui";
import { copiarCatalogo, criarCategoria, criarServico, salvarServico } from "./acoes";

type Categoria = { id: string; nome: string };
type Servico = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: "principal" | "adicional";
  categoria_id: string | null;
  ordem: number;
  ativo: boolean;
};

function CamposServico({ categorias, s, erros }: { categorias: Categoria[]; s?: Servico; erros: Record<string, string> }) {
  return (
    <>
      <Campo rotulo="Nome" nome="nome" defaultValue={s?.nome} erro={erros.nome} />
      <div className="grid grid-cols-2 gap-3">
        <Selecao rotulo="Tipo" nome="tipo" defaultValue={s?.tipo ?? "principal"} erro={erros.tipo}>
          <option value="principal">Principal (escolha única)</option>
          <option value="adicional">Adicional (extra)</option>
        </Selecao>
        <Selecao rotulo="Categoria" nome="categoria_id" defaultValue={s?.categoria_id ?? ""}>
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Selecao>
      </div>
      <AreaTexto rotulo="Descrição" nome="descricao" defaultValue={s?.descricao ?? ""} maxLength={300} />
      <Campo rotulo="Ordem de exibição" nome="ordem" type="number" inputMode="numeric" defaultValue={s?.ordem ?? 0} />
    </>
  );
}

export function NovoServico({ lojaId, categorias }: { lojaId: string; categorias: Categoria[] }) {
  return (
    <FormAcao acao={criarServico} rotuloEnviar="Adicionar serviço">
      {(erros) => (
        <>
          <input type="hidden" name="loja_id" value={lojaId} />
          <CamposServico categorias={categorias} erros={erros} />
        </>
      )}
    </FormAcao>
  );
}

export function EditarServico({ lojaId, categorias, s }: { lojaId: string; categorias: Categoria[]; s: Servico }) {
  return (
    <FormAcao acao={salvarServico}>
      {(erros) => (
        <>
          <input type="hidden" name="loja_id" value={lojaId} />
          <input type="hidden" name="id" value={s.id} />
          <CamposServico categorias={categorias} s={s} erros={erros} />
          <Caixa rotulo="Ativo (aparece para os clientes)" nome="ativo" defaultChecked={s.ativo} />
        </>
      )}
    </FormAcao>
  );
}

export function NovaCategoria({ lojaId }: { lojaId: string }) {
  return (
    <FormAcao acao={criarCategoria} rotuloEnviar="Adicionar categoria" className="flex flex-col gap-3">
      {(erros) => (
        <>
          <input type="hidden" name="loja_id" value={lojaId} />
          <Campo rotulo="Nova categoria" nome="nome" placeholder="Ex.: Banho, Tosa, Extras" erro={erros.nome} />
        </>
      )}
    </FormAcao>
  );
}

export function CopiarCatalogo({ lojaId, unidades }: { lojaId: string; unidades: { id: string; nome: string }[] }) {
  return (
    <FormAcao acao={copiarCatalogo} rotuloEnviar="Copiar catálogo">
      {(erros) => (
        <>
          <input type="hidden" name="loja_id" value={lojaId} />
          <Selecao rotulo="Copiar de" nome="origem" defaultValue={unidades[0]?.id} erro={erros.origem}>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Selecao>
          <Caixa rotulo="Substituir serviços com o mesmo nome (preços e tempos desta unidade serão sobrescritos)" nome="substituir" />
          <p className="text-xs text-neutral-500">
            Copia categorias, serviços, preços e tempos. Sem “substituir”, só cria o que falta e mantém o que esta unidade já
            ajustou. Profissionais e horários não são copiados.
          </p>
        </>
      )}
    </FormAcao>
  );
}
