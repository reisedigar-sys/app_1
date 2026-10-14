"use client";

import { useState, useSyncExternalStore } from "react";
import { Botao } from "@/components/ui";

const semAssinatura = () => () => {};

/** Link completo da página de agendamento, com copiar e compartilhar (é o que a loja manda para os clientes). */
export function LinkDaLoja({ slug, nome }: { slug: string; nome: string }) {
  // No servidor não há origem nem navigator: o link aparece completo só no navegador.
  const origem = useSyncExternalStore(semAssinatura, () => window.location.origin, () => "");
  const podeCompartilhar = useSyncExternalStore(semAssinatura, () => typeof navigator.share === "function", () => false);
  const [copiado, setCopiado] = useState(false);

  const url = `${origem}/${slug}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <a href={`/${slug}`} target="_blank" rel="noreferrer" className="break-all font-medium text-teal-700 underline dark:text-teal-400" data-link-da-loja>
        {origem ? url : `/${slug}`}
      </a>
      <div className="flex flex-wrap gap-2">
        <Botao variante="secundario" onClick={copiar} disabled={!origem}>
          {copiado ? "Link copiado" : "Copiar link"}
        </Botao>
        {podeCompartilhar && (
          <Botao
            variante="secundario"
            onClick={() => navigator.share({ title: nome, text: `Agende o banho e tosa na ${nome}:`, url }).catch(() => {})}
          >
            Compartilhar
          </Botao>
        )}
      </div>
    </div>
  );
}
