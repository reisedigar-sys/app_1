"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FormAcao } from "@/components/form-acao";
import { Aviso, Botao, Campo, Selecao } from "@/components/ui";
import { type TutorBalcao, buscarTutor } from "../agenda/acoes";
import { incluirNaFila } from "./acoes";

/** Inclui um cliente da loja na fila: busca pelo telefone, escolhe o pet, o serviço, o dia e o período. */
export function IncluirNaFila({ lojaId, servicos, hoje }: { lojaId: string; servicos: { id: string; nome: string }[]; hoje: string }) {
  const [telefone, setTelefone] = useState("");
  const [tutores, setTutores] = useState<TutorBalcao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, iniciar] = useTransition();
  const pets = (tutores ?? []).flatMap((t) => t.pets.map((p) => ({ ...p, tutor: t.nome })));

  function buscar() {
    setErro(null);
    iniciar(async () => {
      const r = await buscarTutor(lojaId, telefone);
      if (!r.ok) return setErro(r.erro);
      setTutores(r.dados.tutores);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <Campo className="flex-1" rotulo="Telefone do cliente" nome="telefone_fila" type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 98888-7777" />
        <Botao type="button" variante="secundario" onClick={buscar} disabled={buscando || !telefone}>
          {buscando ? "Buscando…" : "Buscar"}
        </Botao>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {tutores?.length === 0 && (
        <Aviso tipo="alerta">
          Nenhum cliente da loja com esse telefone. A lista de espera é para quem já é cliente:{" "}
          <Link className="font-medium underline" href={`/painel/${lojaId}/agenda/novo`}>
            cadastre o cliente e o pet no novo atendimento
          </Link>
          .
        </Aviso>
      )}
      {pets.length > 0 && (
        <FormAcao acao={incluirNaFila} rotuloEnviar="Incluir na lista de espera">
          <input type="hidden" name="loja_id" value={lojaId} />
          <Selecao rotulo="Pet" nome="pet">
            {pets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} ({p.tutor})
              </option>
            ))}
          </Selecao>
          <Selecao rotulo="Serviço" nome="servico">
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Selecao>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Dia" nome="data" type="date" min={hoje} />
            <Selecao rotulo="Período" nome="periodo" defaultValue="qualquer">
              <option value="qualquer">Qualquer horário</option>
              <option value="manha">Manhã</option>
              <option value="tarde">Tarde</option>
            </Selecao>
          </div>
        </FormAcao>
      )}
    </div>
  );
}
