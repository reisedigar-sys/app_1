"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Calendario, somarMes } from "@/components/agenda/calendario";
import { HorariosLivres } from "@/components/agenda/horarios";
import { PassosAtendimento } from "@/components/agenda/passos-atendimento";
import { Avatar } from "@/components/agenda/profissional";
import { Aviso, Botao, Caixa, classeInput } from "@/components/ui";
import type { Horario, ItemPedido, Profissional, ResumoPedido, Unidade } from "@/lib/disponibilidade";
import { formatarReais, telefoneLegivel } from "@/lib/painel/formatos";
import { buscarDias, buscarHorarios, buscarProfissionaisAptos, buscarUnidades, confirmarPedido } from "./acoes";
import { ListaEspera } from "./lista-espera";

export type ServicoCatalogo = {
  id: string;
  nome: string;
  tipo: "principal" | "adicional";
  descricao: string | null;
  precos: Record<string, { preco: number; duracao: number }>; // "porte.pelagem"
};
export type PetTutor = { id: string; nome: string; raca: string | null; porte: string; pelagem: string; foto_url: string | null };
export type LojaFluxo = {
  id: string;
  nome: string;
  slug: string;
  telefone: string | null;
  hoje: string;
  fuso: string;
  cancelamentoGratuitoHoras: number;
};
/** Pedido anterior para "repetir": pets na ordem de atendimento e os serviços de cada um. */
export type PedidoInicial = { pets: string[]; escolhas: Record<string, { principal: string; adicionais: string[] }> };

type Escolha = { principal?: string; adicionais: string[]; observacoes: string };
type Etapa = "pedido" | "quando" | "pronto";

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const SEMANA_LONGA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function partesDia(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  return { a, m, d, semana: new Date(Date.UTC(a, m - 1, d)).getUTCDay() };
}

function somarDias(dia: string, n: number) {
  const { a, m, d } = partesDia(dia);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "hoje", "amanhã" ou "sex 16/10". */
function diaCurto(dia: string, hoje: string) {
  if (dia === hoje) return "Hoje";
  if (dia === somarDias(hoje, 1)) return "Amanhã";
  const { m, d, semana } = partesDia(dia);
  return `${SEMANA[semana]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** "hoje, quarta 14/10" ou "sexta 16/10". */
function diaLongo(dia: string, hoje: string) {
  const { m, d, semana } = partesDia(dia);
  const data = `${SEMANA_LONGA[semana]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  if (dia === hoje) return `Hoje, ${data}`;
  if (dia === somarDias(hoje, 1)) return `Amanhã, ${data}`;
  return data.charAt(0).toUpperCase() + data.slice(1);
}

function horaLegivel(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

function dataHoraLegivel(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(iso))
    .replace(",", " às");
}

/** Arquivo de calendário (.ics) com o atendimento, para o tutor guardar no celular. */
function baixarConvite(e: { id: string; titulo: string; local: string; inicio: string; fim: string }) {
  const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const texto = (t: string) => t.replace(/[\\;,]/g, (c) => `\\${c}`);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hora do Pet//PT-BR",
    "BEGIN:VEVENT",
    `UID:${e.id}@horadopet`,
    `DTSTAMP:${utc(new Date().toISOString())}`,
    `DTSTART:${utc(e.inicio)}`,
    `DTEND:${utc(e.fim)}`,
    `SUMMARY:${texto(e.titulo)}`,
    `LOCATION:${texto(e.local)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "hora-do-pet.ics";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "até 14/10 às 12:00", ou o aviso de que o prazo gratuito já passou (cancelar continua possível; a loja é avisada). */
function prazoCancelamento(inicio: string, horas: number, fuso: string) {
  const limite = new Date(new Date(inicio).getTime() - horas * 3600_000);
  return limite.getTime() > Date.now() ? `até ${dataHoraLegivel(limite.toISOString(), fuso)}` : "prazo já passou";
}

function duracaoLegivel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

type PropsFluxo = { loja: LojaFluxo; pets: PetTutor[]; catalogo: ServicoCatalogo[]; consentimentoAnterior: boolean; inicial?: PedidoInicial };

/**
 * O roteador guarda a tela visitada (com o estado) para voltar instantaneamente. Depois de um agendamento
 * concluído, o fluxo recomeça do zero (com nova chave de idempotência) em vez de reabrir a confirmação anterior.
 */
export function FluxoAgendamento(props: PropsFluxo) {
  const [versao, setVersao] = useState(0);
  // Um "repetir" só vale na primeira montagem; o próximo agendamento começa em branco.
  return <Fluxo key={versao} {...props} inicial={versao === 0 ? props.inicial : undefined} reiniciar={() => setVersao(versao + 1)} />;
}

/**
 * Agendamento em duas telas: "pedido" (pets, serviços e unidade) e "quando" (dia, profissional e horário), com a
 * revisão numa folha por cima. Toda regra de disponibilidade continua no banco; esta tela só chama as funções.
 */
function Fluxo({ loja, pets, catalogo, consentimentoAnterior, inicial, reiniciar }: PropsFluxo & { reiniciar: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>("pedido");
  const [selecionados, setSelecionados] = useState<string[]>(() => inicial?.pets ?? (pets.length === 1 ? [pets[0].id] : []));
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>(() =>
    Object.fromEntries(
      (inicial?.pets ?? (pets.length === 1 ? [pets[0].id] : [])).map((id) => [
        id,
        { principal: inicial?.escolhas[id]?.principal, adicionais: inicial?.escolhas[id]?.adicionais ?? [], observacoes: "" },
      ]),
    ),
  );
  const [unidades, setUnidades] = useState<Unidade[] | null>(null);
  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [profissionalId, setProfissionalId] = useState<string | null>(null); // null = qualquer profissional
  const [dias, setDias] = useState<string[] | null>(null);
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [mes, setMes] = useState(loja.hoje.slice(0, 7));
  const [diasDoMes, setDiasDoMes] = useState<string[]>([]);
  const [dia, setDia] = useState<string | undefined>();
  const [horarios, setHorarios] = useState<Horario[] | null>(null);
  const [horario, setHorario] = useState<Horario | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [consentimento, setConsentimento] = useState(consentimentoAnterior);
  const [resumo, setResumo] = useState<ResumoPedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciar] = useTransition();
  const [chave] = useState(() => crypto.randomUUID());

  // Ao sair da tela de confirmação (inclusive quando o roteador só a esconde), o próximo acesso começa do zero.
  useEffect(() => {
    if (etapa === "pronto") return reiniciar;
  }, [etapa, reiniciar]);

  const petPorId = useMemo(() => new Map(pets.map((p) => [p.id, p])), [pets]);
  const servicoPorId = useMemo(() => new Map(catalogo.map((s) => [s.id, s])), [catalogo]);
  const principais = catalogo.filter((s) => s.tipo === "principal");
  const adicionais = catalogo.filter((s) => s.tipo === "adicional");
  const precoDe = (s: ServicoCatalogo, pet: PetTutor) => s.precos[`${pet.porte}.${pet.pelagem}`];

  // Pedido montado com os serviços da loja de origem; depois de escolher a unidade, usa a tradução dela.
  const itensOrigem: ItemPedido[] = selecionados.map((id) => ({
    pet_id: id,
    servicos: [escolhas[id]?.principal, ...(escolhas[id]?.adicionais ?? [])].filter(Boolean) as string[],
  }));
  const chaveItens = JSON.stringify(itensOrigem);
  const pedidoCompleto = selecionados.length > 0 && selecionados.every((id) => escolhas[id]?.principal);
  const itens = unidade?.itens ?? itensOrigem;
  const lojaPedido = unidade?.id ?? loja.id;

  const somaOrigem = (campo: "preco" | "duracao") =>
    selecionados.reduce((t, id) => {
      const pet = petPorId.get(id)!;
      const e = escolhas[id];
      return t + [e?.principal, ...(e?.adicionais ?? [])].reduce((s, sid) => s + (sid ? (precoDe(servicoPorId.get(sid)!, pet)?.[campo] ?? 0) : 0), 0);
    }, 0);
  const total = unidade?.totalCentavos ?? somaOrigem("preco");
  const duracao = somaOrigem("duracao");
  const profissional = profissionais.find((p) => p.id === profissionalId);

  function mostrarErro(r: { ok: false; erro: string }) {
    setErro(r.erro);
  }

  /** Pets ou serviços mudaram: unidade e agenda são buscadas de novo. */
  function mudouPedido() {
    setUnidades(null);
    setUnidade(null);
    setErro(null);
    limparAgenda();
  }

  function limparAgenda() {
    setProfissionais([]);
    setProfissionalId(null);
    setDias(null);
    setCalendarioAberto(false);
    setDia(undefined);
    setHorarios(null);
    setHorario(null);
  }

  // ---- carregamentos -------------------------------------------------------
  // Assim que todo pet tem serviço, busca as unidades da rede que atendem o pedido. Com uma unidade só (loja sem
  // rede), ela já vem escolhida e a lista nem aparece.
  useEffect(() => {
    if (!pedidoCompleto) return;
    let vigente = true;
    iniciar(async () => {
      const r = await buscarUnidades(loja.id, JSON.parse(chaveItens) as ItemPedido[]);
      if (!vigente) return;
      if (!r.ok) return mostrarErro(r);
      setUnidades(r.dados);
      if (r.dados.length === 1) {
        setUnidade(r.dados[0]);
        // "Repetir o último": com tudo escolhido e uma unidade só, vai direto para os horários.
        if (inicial) setEtapa("quando");
      }
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega quando o pedido muda
  }, [chaveItens, pedidoCompleto]);

  // Só a última consulta de horários vale: trocar de dia antes de a anterior voltar não mostra horários do dia errado.
  const ultimaConsulta = useRef(0);
  async function carregarHorarios(d: string, prof: string | null) {
    const consulta = ++ultimaConsulta.current;
    setDia(d);
    setHorario(null);
    setHorarios(null);
    const r = await buscarHorarios(lojaPedido, itens, d, prof ?? undefined);
    if (consulta !== ultimaConsulta.current) return;
    if (!r.ok) return mostrarErro(r);
    setHorarios(r.dados);
  }

  /** Dias com vaga neste mês e no próximo (a faixa de dias); escolhe o primeiro, ou mantém o dia já escolhido. */
  async function carregarDias(prof: string | null, manter?: string) {
    const consulta = ++ultimaConsulta.current;
    setDias(null);
    const [a, b] = await Promise.all([
      buscarDias(lojaPedido, itens, `${loja.hoje.slice(0, 7)}-01`, prof ?? undefined),
      buscarDias(lojaPedido, itens, `${somarMes(loja.hoje.slice(0, 7), 1)}-01`, prof ?? undefined),
    ]);
    if (consulta !== ultimaConsulta.current) return;
    if (!a.ok) return mostrarErro(a);
    if (!b.ok) return mostrarErro(b);
    const livres = [...new Set([...a.dados, ...b.dados])].filter((d) => d >= loja.hoje).sort();
    setDias(livres);
    const alvo = manter && livres.includes(manter) ? manter : livres[0];
    if (alvo) await carregarHorarios(alvo, prof);
    else {
      setDia(undefined);
      setHorarios([]);
    }
  }

  function abrirQuando() {
    setErro(null);
    setEtapa("quando");
    if (dias) return;
    iniciar(async () => {
      const r = await buscarProfissionaisAptos(lojaPedido, itens);
      if (r.ok) setProfissionais(r.dados);
      await carregarDias(null);
    });
  }

  function escolherProfissional(id: string | null) {
    if (id === profissionalId) return;
    setProfissionalId(id);
    setErro(null);
    iniciar(() => carregarDias(id, dia));
  }

  function escolherDia(d: string) {
    setErro(null);
    setCalendarioAberto(false);
    iniciar(() => carregarHorarios(d, profissionalId));
  }

  useEffect(() => {
    if (!calendarioAberto) return;
    iniciar(async () => {
      const r = await buscarDias(lojaPedido, itens, `${mes}-01`, profissionalId ?? undefined);
      if (!r.ok) return mostrarErro(r);
      setDiasDoMes(r.dados);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega ao abrir o calendário ou trocar de mês
  }, [calendarioAberto, mes]);

  function confirmar() {
    if (!horario) return;
    iniciar(async () => {
      setErro(null);
      const observacoes = selecionados
        .map((id) => (escolhas[id]?.observacoes.trim() ? `${petPorId.get(id)!.nome}: ${escolhas[id].observacoes.trim()}` : ""))
        .filter(Boolean)
        .join(" | ");
      const r = await confirmarPedido({
        lojaId: lojaPedido,
        itens,
        inicio: horario.inicio,
        profissionalId: profissionalId ?? undefined,
        chave,
        observacoes: observacoes || undefined,
        consentimentoContato: consentimento,
      });
      if (!r.ok) {
        mostrarErro(r);
        setRevisando(false);
        if (r.codigo === "horario_indisponivel" && dia) await carregarHorarios(dia, profissionalId);
        return;
      }
      setResumo(r.dados);
      setRevisando(false);
      setEtapa("pronto");
    });
  }

  // ---- telas ---------------------------------------------------------------
  if (etapa === "pronto" && resumo && horario && dia && unidade) {
    const nomes = selecionados.map((id) => petPorId.get(id)!.nome);
    const quem = nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : nomes[0];
    const pronto = horaLegivel(resumo.retirada_estimada, loja.fuso);
    const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([unidade.nome, unidade.endereco].filter(Boolean).join(", "))}`;
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 pt-2 text-center" role="status">
          <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-emerald-50 text-3xl font-extrabold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            ✓
          </span>
          <h2 className="text-2xl font-bold">Horário {nomes.length > 1 ? "dos pets" : `de ${quem}`} garantido</h2>
          <p className="text-sm text-neutral-500">
            {diaLongo(dia, loja.hoje)} às {horario.hora} · {unidade.nome}
          </p>
        </div>
        <section aria-labelledby="t-como-vai-ser" className="rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-900">
          <h3 id="t-como-vai-ser" className="mb-3 font-titulo font-bold">Como vai ser</h3>
          <PassosAtendimento status="agendado" inicio={horario.hora} pronto={pronto} />
          <p className="mt-3 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
            Total: <strong>{formatarReais(resumo.total_centavos)}</strong>, pago na loja.
          </p>
        </section>
        <div className="grid grid-cols-2 gap-2">
          <Botao
            type="button"
            variante="secundario"
            onClick={() =>
              baixarConvite({
                id: resumo.pedido_id,
                titulo: `Banho e tosa: ${quem} (${unidade.nome})`,
                local: [unidade.nome, unidade.endereco].filter(Boolean).join(", "),
                inicio: resumo.agendamentos[0]?.inicio ?? horario.inicio,
                fim: resumo.retirada_estimada,
              })
            }
          >
            Pôr na agenda
          </Botao>
          <a href={mapa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-900">
            Como chegar
          </a>
          <Botao variante="secundario" onClick={reiniciar}>
            Agendar outro pet
          </Botao>
          <Link href="/conta/agendamentos" className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-marca-700 underline dark:text-marca-400">
            Ver meus agendamentos
          </Link>
        </div>
      </div>
    );
  }

  const blocoErro = erro && (
    <div className="mb-4">
      <Aviso tipo="erro">{erro}</Aviso>
    </div>
  );

  return (
    <div className="flex flex-col pb-32">
      {etapa === "pedido" && (
        <>
          {blocoErro}
          <section aria-labelledby="t-pets" className="flex flex-col gap-3">
            <h2 id="t-pets" className="text-2xl font-bold">Quem vai tomar banho?</h2>
            {pets.length === 0 && <p className="text-sm text-neutral-500">Você ainda não cadastrou nenhum pet.</p>}
            <div className="flex flex-wrap gap-4">
              {pets.map((p) => {
                const marcado = selecionados.includes(p.id);
                return (
                  <label key={p.id} className="flex w-20 cursor-pointer flex-col items-center gap-1 text-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={marcado}
                      onChange={(e) => {
                        mudouPedido();
                        setSelecionados((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)));
                        setEscolhas((s) => (s[p.id] ? s : { ...s, [p.id]: { adicionais: [], observacoes: "" } }));
                      }}
                    />
                    <span
                      className={`relative rounded-full p-0.5 transition peer-focus-visible:outline-2 peer-focus-visible:outline-marca-700 ${marcado ? "ring-2 ring-marca-600" : "ring-1 ring-neutral-200 dark:ring-neutral-800"}`}
                    >
                      <Avatar foto={p.foto_url} nome={p.nome} tamanho="size-16" />
                      {marcado && (
                        <span aria-hidden className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border-2 border-white bg-marca-600 text-xs font-bold text-white dark:border-neutral-950">
                          ✓
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-semibold">{p.nome}</span>
                    <span className="text-xs text-neutral-500">{p.raca ?? " "}</span>
                  </label>
                );
              })}
              <Link
                href={`/conta/pets/novo?voltar=${encodeURIComponent(`/${loja.slug}/agendar`)}`}
                className="flex w-20 flex-col items-center gap-1 text-center text-sm font-semibold text-neutral-600 dark:text-neutral-300"
              >
                <span aria-hidden className="flex size-[68px] items-center justify-center rounded-full border-2 border-dashed border-neutral-300 text-2xl dark:border-neutral-700">
                  +
                </span>
                Novo pet
              </Link>
            </div>
          </section>

          {selecionados.map((petId) => {
            const pet = petPorId.get(petId)!;
            const escolha = escolhas[petId] ?? { adicionais: [], observacoes: "" };
            const atualizar = (e: Partial<Escolha>) => {
              if (!("observacoes" in e)) mudouPedido();
              setEscolhas((s) => ({ ...s, [petId]: { ...escolha, ...e } }));
            };
            const disponiveis = (lista: ServicoCatalogo[]) => lista.filter((s) => precoDe(s, pet));
            return (
              <section key={petId} aria-labelledby={`t-servico-${petId}`} className="mt-6 flex flex-col gap-3 rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-900">
                <h3 id={`t-servico-${petId}`} className="font-titulo text-lg font-bold">
                  Para {pet.nome}
                </h3>
                <fieldset className="flex flex-col gap-2">
                  <legend className="sr-only">Serviço principal para {pet.nome}</legend>
                  {disponiveis(principais).length === 0 && <Aviso tipo="alerta">A loja não tem serviços para o porte e a pelagem de {pet.nome}.</Aviso>}
                  {disponiveis(principais).map((s) => {
                    const p = precoDe(s, pet)!;
                    const ativo = escolha.principal === s.id;
                    return (
                      <label
                        key={s.id}
                        className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3 has-focus-visible:outline-2 has-focus-visible:outline-marca-700 dark:bg-neutral-950 ${ativo ? "border-marca-600 bg-marca-50 dark:bg-marca-950" : "border-transparent"}`}
                      >
                        <input type="radio" name={`principal-${petId}`} checked={ativo} onChange={() => atualizar({ principal: s.id })} className="sr-only" />
                        <span className="flex flex-1 flex-col">
                          <span className="font-semibold">{s.nome}</span>
                          <span className="text-xs text-neutral-500">
                            {duracaoLegivel(p.duracao)}
                            {s.descricao ? ` · ${s.descricao}` : ""}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums">{formatarReais(p.preco)}</span>
                      </label>
                    );
                  })}
                </fieldset>
                {disponiveis(adicionais).length > 0 && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-sm font-semibold">Adicionar</legend>
                    <div className="flex flex-wrap gap-2">
                      {disponiveis(adicionais).map((s) => {
                        const marcado = escolha.adicionais.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={`flex min-h-10 cursor-pointer items-center rounded-full border-2 px-3 text-sm font-semibold has-focus-visible:outline-2 has-focus-visible:outline-marca-700 ${marcado ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900" : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"}`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={marcado}
                              onChange={(e) => atualizar({ adicionais: e.target.checked ? [...escolha.adicionais, s.id] : escolha.adicionais.filter((x) => x !== s.id) })}
                            />
                            {marcado ? "✓ " : "+ "}
                            {s.nome} {formatarReais(precoDe(s, pet)!.preco)}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-neutral-600 dark:text-neutral-300">Algo que a loja deve saber sobre {pet.nome}? (opcional)</span>
                  <textarea
                    className={`${classeInput} py-2`}
                    rows={2}
                    maxLength={300}
                    placeholder="Ex.: tem medo de secador"
                    value={escolha.observacoes}
                    onChange={(e) => atualizar({ observacoes: e.target.value })}
                  />
                </label>
              </section>
            );
          })}

          {unidades && unidades.length !== 1 && (
            <EtapaUnidade unidades={unidades} unidade={unidade} onEscolher={(u) => { setUnidade(u); limparAgenda(); }} />
          )}
        </>
      )}

      {etapa === "quando" && (
        <section aria-labelledby="t-quando" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {selecionados.map((id) => (
              <div key={id} className="flex items-center gap-3 rounded-2xl bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
                <span aria-hidden className="flex size-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">✓</span>
                <span className="flex-1 text-sm">
                  <strong>{petPorId.get(id)!.nome}</strong> · {[escolhas[id].principal, ...escolhas[id].adicionais].map((s) => servicoPorId.get(s!)?.nome).join(" + ")}
                </span>
                <button type="button" onClick={() => { setErro(null); setEtapa("pedido"); }} className="min-h-10 px-2 text-sm font-semibold text-marca-700 dark:text-marca-400">
                  Mudar
                </button>
              </div>
            ))}
            {unidades && unidades.length > 1 && unidade && <p className="px-1 text-sm text-neutral-500">Na unidade <strong className="text-neutral-800 dark:text-neutral-200">{unidade.nome}</strong></p>}
          </div>

          <h2 id="t-quando" className="text-2xl font-bold">Quando fica bom?</h2>
          {blocoErro}

          {profissionais.length > 1 && (
            <div role="radiogroup" aria-label="Profissional" className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
              {[{ id: null, nome: "Qualquer", fotoUrl: null }, ...profissionais].map((p) => {
                const ativo = profissionalId === p.id;
                return (
                  <button
                    key={p.id ?? "qualquer"}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => escolherProfissional(p.id)}
                    className="flex w-16 shrink-0 flex-col items-center gap-1 text-xs font-semibold"
                  >
                    <span className={`rounded-full p-0.5 ${ativo ? "ring-2 ring-neutral-900 dark:ring-neutral-100" : ""}`}>
                      {p.id ? (
                        <Avatar foto={p.fotoUrl} nome={p.nome} tamanho="size-11" />
                      ) : (
                        <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">✦</span>
                      )}
                    </span>
                    {p.nome}
                  </button>
                );
              })}
            </div>
          )}

          {dias === null ? (
            <p className="text-sm text-neutral-500">Buscando dias com vaga…</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div role="radiogroup" aria-label="Dias com vaga" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {[...new Set([...dias, ...(dia ? [dia] : [])])].sort().map((d) => {
                  const ativo = d === dia;
                  const { m, d: n, semana } = partesDia(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      aria-label={diaLongo(d, loja.hoje)}
                      onClick={() => escolherDia(d)}
                      className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border-2 py-2 text-xs ${ativo ? "border-neutral-900 bg-neutral-900 text-neutral-300 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-600" : "border-neutral-200 bg-white text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950"}`}
                    >
                      <span>{d === loja.hoje ? "hoje" : SEMANA[semana]}</span>
                      <span className={`font-titulo text-lg font-bold ${ativo ? "text-white dark:text-neutral-900" : "text-neutral-900 dark:text-neutral-100"}`}>{n}</span>
                      <span>{MESES_CURTOS[m - 1]}</span>
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => setCalendarioAberto((v) => !v)} className="self-start text-sm font-semibold text-marca-700 dark:text-marca-400">
                {calendarioAberto ? "Fechar calendário" : "Ver outros dias no calendário"}
              </button>
              {calendarioAberto && (
                <Calendario mes={mes} hoje={loja.hoje} diasComVaga={diasDoMes} selecionado={dia} carregando={carregando} onMes={setMes} onDia={escolherDia} />
              )}
              {dias.length === 0 && !calendarioAberto && <p className="text-sm text-neutral-500">Sem vagas nas próximas semanas. Veja outros dias no calendário.</p>}
            </div>
          )}

          {dia && (
            <div className="flex flex-col gap-3">
              {horarios === null ? (
                <p className="text-sm text-neutral-500">Carregando horários…</p>
              ) : horarios.length === 0 ? (
                <p className="text-sm text-neutral-500">Sem horários neste dia.</p>
              ) : (
                <>
                  {dia === dias?.[0] && horario?.inicio !== horarios[0].inicio && (
                    <button
                      type="button"
                      onClick={() => setHorario(horarios[0])}
                      className="flex items-center gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm dark:border-amber-700 dark:bg-amber-950"
                    >
                      <span aria-hidden>⚡</span>
                      <span>
                        Primeiro horário livre: <strong>{diaCurto(dia, loja.hoje).toLowerCase()} às {horarios[0].hora}</strong>
                      </span>
                    </button>
                  )}
                  <HorariosLivres disponiveis={horarios} selecionado={horario?.inicio} onEscolher={(h) => setHorario(horarios.find((x) => x.inicio === h.inicio)!)} />
                  {horario && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-300" aria-live="polite">
                      {selecionados.length > 1 ? "Os pets ficam prontos" : `${petPorId.get(selecionados[0])!.nome} fica pronto`} por volta das{" "}
                      <strong>{horaLegivel(horario.retiradaEstimada, loja.fuso)}</strong>.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-col gap-3">
            <ListaEspera key={dia ?? "sem-dia"} lojaId={lojaPedido} itens={itens} hoje={loja.hoje} diaSugerido={dia} />
            <p className="text-xs text-neutral-500">
              Não achou o horário? Ligue para {telefoneLegivel(unidade?.telefone ?? loja.telefone) ?? "a loja"} e peça um encaixe.
            </p>
          </div>
        </section>
      )}

      {/* Rodapé com o total sempre à vista e um único botão para seguir. */}
      <div className="fixed inset-x-0 bottom-0 z-10 rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgba(28,35,64,0.5)] dark:bg-neutral-950">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs text-neutral-500">
              {etapa === "quando" && horario && dia
                ? `${diaCurto(dia, loja.hoje)}, ${horario.hora} · ${profissional?.nome ?? "Qualquer profissional"}`
                : selecionados.length === 0
                  ? "Escolha os pets"
                  : `${selecionados.length} ${selecionados.length > 1 ? "pets" : "pet"}${duracao > 0 ? ` · cerca de ${duracaoLegivel(duracao)}` : ""}`}
            </span>
            <span className="font-titulo text-xl font-bold tabular-nums" aria-label="Total">{formatarReais(total)}</span>
          </div>
          {etapa === "pedido" ? (
            <Botao type="button" onClick={abrirQuando} disabled={!pedidoCompleto || !unidade || carregando} aria-busy={carregando} className="min-w-36">
              {carregando && pedidoCompleto ? "Aguarde…" : "Ver horários"}
            </Botao>
          ) : (
            <Botao type="button" onClick={() => setRevisando(true)} disabled={!horario || carregando} className="min-w-36">
              Revisar
            </Botao>
          )}
        </div>
      </div>

      {revisando && horario && dia && unidade && (
        <FolhaRevisao
          titulo={diaLongo(dia, loja.hoje)}
          hora={horario.hora}
          pronto={horaLegivel(horario.retiradaEstimada, loja.fuso)}
          pets={selecionados.map((id) => ({
            nome: petPorId.get(id)!.nome,
            servicos: [escolhas[id].principal, ...escolhas[id].adicionais].map((s) => servicoPorId.get(s!)?.nome).join(" + "),
          }))}
          profissional={profissional?.nome ?? "Quem estiver livre"}
          unidade={unidade.nome}
          cancelarAte={prazoCancelamento(horario.inicio, loja.cancelamentoGratuitoHoras, loja.fuso)}
          total={formatarReais(unidade.totalCentavos)}
          consentimento={consentimento}
          onConsentimento={setConsentimento}
          carregando={carregando}
          onConfirmar={confirmar}
          onFechar={() => setRevisando(false)}
        />
      )}
    </div>
  );
}

function FolhaRevisao(p: {
  titulo: string;
  hora: string;
  pronto: string;
  pets: { nome: string; servicos: string }[];
  profissional: string;
  unidade: string;
  cancelarAte: string;
  total: string;
  consentimento: boolean;
  onConsentimento: (v: boolean) => void;
  carregando: boolean;
  onConfirmar: () => void;
  onFechar: () => void;
}) {
  useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && p.onFechar();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [p]);

  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-neutral-500">{rotulo}</span>
      <span className="text-right font-semibold">{valor}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end">
      <button type="button" aria-label="Fechar revisão" className="absolute inset-0 bg-neutral-900/40" onClick={p.onFechar} />
      <div role="dialog" aria-modal="true" aria-labelledby="t-revisao" className="relative mx-auto w-full max-w-2xl rounded-t-3xl bg-white px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-neutral-950">
        <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-neutral-200 dark:bg-neutral-800" />
        <h2 id="t-revisao" className="mb-2 text-xl font-bold">Tudo certo?</h2>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
          {linha(
            "Quando",
            <>
              {p.titulo} às {p.hora}
              <br />
              <span className="font-normal text-neutral-500">pronto por volta das {p.pronto}</span>
            </>,
          )}
          {p.pets.map((pet) => (
            <div key={pet.nome}>{linha(pet.nome, pet.servicos)}</div>
          ))}
          {linha("Com", p.profissional)}
          {linha("Onde", p.unidade)}
          {linha("Cancelar grátis", p.cancelarAte)}
        </div>
        <div className="my-3">
          <Caixa
            rotulo="Aceito receber lembretes e a confirmação deste agendamento pelo WhatsApp."
            nome="consentimento"
            checked={p.consentimento}
            onChange={(e) => p.onConsentimento(e.target.checked)}
          />
        </div>
        <Botao type="button" onClick={p.onConfirmar} disabled={p.carregando} aria-busy={p.carregando} className="w-full text-base">
          {p.carregando ? "Confirmando…" : `Confirmar · ${p.total}`}
        </Botao>
        <p className="mt-2 text-center text-xs text-neutral-500">O pagamento é feito na loja.</p>
      </div>
    </div>
  );
}

/** Lista das unidades da rede que atendem o pedido (busca por localização e CEP fica para o marketplace). */
function EtapaUnidade({ unidades, unidade, onEscolher }: { unidades: Unidade[]; unidade: Unidade | null; onEscolher: (u: Unidade) => void }) {
  return (
    <section aria-labelledby="t-unidade" className="mt-6 flex flex-col gap-3">
      <h2 id="t-unidade" className="text-xl font-bold">Em qual unidade?</h2>
      {unidades.length === 0 && <Aviso tipo="alerta">Nenhuma unidade atende esses serviços para os seus pets.</Aviso>}
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Unidades">
        {unidades.map((u) => (
          <label
            key={u.id}
            className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 bg-white p-4 has-focus-visible:outline-2 has-focus-visible:outline-marca-700 dark:bg-neutral-950 ${unidade?.id === u.id ? "border-marca-600 bg-marca-50 dark:bg-marca-950" : "border-neutral-200 dark:border-neutral-800"}`}
          >
            <input type="radio" name="unidade" checked={unidade?.id === u.id} onChange={() => onEscolher(u)} className="sr-only" />
            <span className="flex flex-1 flex-col">
              <span className="font-semibold">{u.nome}</span>
              {u.endereco && <span className="text-sm text-neutral-500">{u.endereco}</span>}
            </span>
            <span className="font-semibold tabular-nums">{formatarReais(u.totalCentavos)}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
