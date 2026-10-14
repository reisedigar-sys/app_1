"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { buscarDias, buscarHorarios } from "@/app/[slug]/agendar/acoes";
import { Calendario } from "@/components/agenda/calendario";
import { Horarios } from "@/components/agenda/horarios";
import { Aviso, Botao, Selecao } from "@/components/ui";
import type { Horario, ItemPedido } from "@/lib/disponibilidade";
import { remarcarNoPainel } from "../../acoes";

/** Remarcar pelo motor de disponibilidade (a equipe não tem antecedência mínima nem janela máxima). */
export function RemarcarPainel({
  lojaId,
  agendamentoId,
  itens,
  atual,
  profissionais,
  hoje,
  slotMinutos,
}: {
  lojaId: string;
  agendamentoId: string;
  itens: ItemPedido[];
  atual: { id: string; nome: string };
  profissionais: { id: string; nome: string }[];
  hoje: string;
  slotMinutos: number;
}) {
  const router = useRouter();
  // "" = qualquer profissional (mantém o atual se ele estiver livre no horário).
  const [prof, setProf] = useState(atual.id);
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [dias, setDias] = useState<string[]>([]);
  const [dia, setDia] = useState<string>();
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [horario, setHorario] = useState<Horario | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciar] = useTransition();

  useEffect(() => {
    iniciar(async () => {
      const r = await buscarDias(lojaId, itens, `${mes}-01`, prof || undefined);
      if (r.ok) setDias(r.dados);
      else setErro(r.erro);
    });
  }, [lojaId, itens, mes, prof]);

  function escolherDia(d: string) {
    setDia(d);
    setHorario(null);
    iniciar(async () => {
      const r = await buscarHorarios(lojaId, itens, d, prof || undefined);
      if (r.ok) setHorarios(r.dados);
      else setErro(r.erro);
    });
  }

  function confirmar() {
    if (!horario || !dia) return;
    iniciar(async () => {
      const r = await remarcarNoPainel({ lojaId, id: agendamentoId, inicio: horario.inicio, profissionalId: prof || undefined });
      if (!r.ok) {
        setErro(r.erro);
        escolherDia(dia);
        return;
      }
      router.push(`/painel/${lojaId}/agenda?data=${dia}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Selecao
        rotulo="Profissional"
        nome="profissional"
        value={prof}
        onChange={(e) => {
          setProf(e.target.value);
          setDia(undefined);
          setHorarios([]);
          setHorario(null);
        }}
      >
        <option value="">Qualquer profissional</option>
        {profissionais.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
            {p.id === atual.id ? " (atual)" : ""}
          </option>
        ))}
      </Selecao>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Calendario mes={mes} hoje={hoje} diasComVaga={dias} selecionado={dia} carregando={carregando && !dia} onMes={setMes} onDia={escolherDia} />
      {dia && horarios.length === 0 && !carregando && <p className="text-sm text-neutral-500">Sem horários neste dia.</p>}
      {dia && horarios.length > 0 && (
        <Horarios disponiveis={horarios} passo={slotMinutos} selecionado={horario?.inicio} onEscolher={(h) => setHorario(horarios.find((x) => x.inicio === h.inicio)!)} />
      )}
      <Botao type="button" onClick={confirmar} disabled={!horario || carregando}>
        {carregando && horario ? "Remarcando…" : horario ? `Remarcar para ${dia?.split("-").reverse().join("/")} às ${horario.hora}` : "Escolha o novo horário"}
      </Botao>
    </div>
  );
}
