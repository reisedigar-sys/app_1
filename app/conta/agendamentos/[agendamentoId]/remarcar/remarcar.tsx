"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { buscarDias, buscarHorarios } from "@/app/[slug]/agendar/acoes";
import { Calendario } from "@/components/agenda/calendario";
import { Horarios } from "@/components/agenda/horarios";
import { Aviso, Botao, Caixa } from "@/components/ui";
import type { Horario, ItemPedido } from "@/lib/disponibilidade";
import { remarcar } from "../../acoes";

export function Remarcar({
  agendamentoId,
  lojaId,
  itens,
  profissional,
  hoje,
  slotMinutos,
  acaoRemarcar = remarcar,
  destino = "/conta/agendamentos?aviso=remarcado",
}: {
  agendamentoId: string;
  lojaId: string;
  itens: ItemPedido[];
  profissional: { id: string; nome: string };
  hoje: string;
  slotMinutos: number;
  /** Outra Server Action com a mesma assinatura (ex.: pelo link de confirmação, sem login). */
  acaoRemarcar?: (p: { id: string; inicio: string; profissionalId?: string }) => Promise<{ ok: true } | { ok: false; erro: string }>;
  destino?: string;
}) {
  const router = useRouter();
  const [manter, setManter] = useState(true);
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [dias, setDias] = useState<string[]>([]);
  const [dia, setDia] = useState<string>();
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [horario, setHorario] = useState<Horario | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciar] = useTransition();
  const prof = manter ? profissional.id : undefined;

  useEffect(() => {
    iniciar(async () => {
      const r = await buscarDias(lojaId, itens, `${mes}-01`, prof);
      if (r.ok) setDias(r.dados);
      else setErro(r.erro);
    });
  }, [lojaId, itens, mes, prof]);

  function escolherDia(d: string) {
    setDia(d);
    setHorario(null);
    iniciar(async () => {
      const r = await buscarHorarios(lojaId, itens, d, prof);
      if (r.ok) setHorarios(r.dados);
      else setErro(r.erro);
    });
  }

  function confirmar() {
    if (!horario) return;
    iniciar(async () => {
      const r = await acaoRemarcar({ id: agendamentoId, inicio: horario.inicio, profissionalId: prof });
      if (!r.ok) {
        setErro(r.erro);
        if (dia) escolherDia(dia);
        return;
      }
      router.push(destino);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Caixa
        rotulo={`Manter com ${profissional.nome}`}
        nome="manter"
        checked={manter}
        onChange={(e) => {
          setManter(e.target.checked);
          setDia(undefined);
          setHorarios([]);
          setHorario(null);
        }}
      />
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
