"use client";

import { useState, useTransition } from "react";
import { Aviso, Botao, Caixa, Campo, Selecao } from "@/components/ui";
import type { ItemPedido } from "@/lib/disponibilidade";
import { entrarListaEspera } from "./acoes";

/** "Avise-me se abrir vaga": o tutor entra na fila de um dia; se alguém cancelar, recebe o aviso com o link. */
export function ListaEspera({ lojaId, itens, hoje, diaSugerido }: { lojaId: string; itens: ItemPedido[]; hoje: string; diaSugerido?: string }) {
  const [data, setData] = useState(diaSugerido ?? "");
  const [periodo, setPeriodo] = useState("qualquer");
  const [consentimento, setConsentimento] = useState(true);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, iniciar] = useTransition();

  function entrar() {
    if (!data) return;
    iniciar(async () => {
      const r = await entrarListaEspera({ lojaId, itens, data, periodo, consentimentoContato: consentimento });
      setResultado(
        r.ok
          ? { ok: true, texto: "Pronto! Se abrir um horário nesse dia, avisamos você por WhatsApp com o link para agendar." }
          : { ok: false, texto: r.erro },
      );
    });
  }

  return (
    <details className="rounded-xl border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">
      <summary className="cursor-pointer font-medium text-teal-700 dark:text-teal-400">Dia lotado? Entre na lista de espera</summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Dia" nome="data_espera" type="date" min={hoje} value={data} onChange={(e) => setData(e.target.value)} />
          <Selecao rotulo="Período" nome="periodo_espera" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="qualquer">Qualquer horário</option>
            <option value="manha">Manhã</option>
            <option value="tarde">Tarde</option>
          </Selecao>
        </div>
        <Caixa rotulo="Quero receber o aviso por WhatsApp" nome="consentimento_espera" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} />
        {resultado && <Aviso tipo={resultado.ok ? "ok" : "erro"}>{resultado.texto}</Aviso>}
        <Botao type="button" variante="secundario" onClick={entrar} disabled={!data || enviando}>
          {enviando ? "Salvando…" : "Avise-me se abrir vaga"}
        </Botao>
      </div>
    </details>
  );
}
