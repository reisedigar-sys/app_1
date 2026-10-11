"use client";

import { useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { Campo, Selecao } from "@/components/ui";
import { slugify } from "@/lib/painel/formatos";
import { criarLoja } from "./acoes";

export function FormularioNovaLoja({ redes }: { redes: { id: string; nome: string }[] }) {
  const [redeId, setRedeId] = useState(redes[0]?.id ?? "");
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);

  return (
    <FormAcao acao={criarLoja} rotuloEnviar="Criar loja">
      {(erros) => (
        <>
          {redes.length > 0 && (
            <Selecao rotulo="Rede" nome="rede_id" value={redeId} onChange={(e) => setRedeId(e.target.value)}>
              {redes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome} (nova unidade)
                </option>
              ))}
              <option value="">Criar uma nova rede</option>
            </Selecao>
          )}
          {!redeId && (
            <Campo
              rotulo="Nome da rede ou marca"
              nome="rede_nome"
              erro={erros.rede_nome}
              ajuda="Se você tem uma loja só, repita o nome dela."
              placeholder="Ex.: Pet Feliz"
            />
          )}
          <Campo
            rotulo="Nome da loja"
            nome="loja_nome"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (!slugEditado) setSlug(slugify(e.target.value));
            }}
            erro={erros.loja_nome}
            placeholder="Ex.: Pet Feliz Centro"
          />
          <Campo
            rotulo="Endereço da página da loja"
            nome="slug"
            value={slug}
            onChange={(e) => {
              setSlugEditado(true);
              setSlug(e.target.value);
            }}
            erro={erros.slug}
            ajuda={`Seus clientes vão agendar em /${slug || "sua-loja"}`}
            autoCapitalize="none"
          />
        </>
      )}
    </FormAcao>
  );
}
