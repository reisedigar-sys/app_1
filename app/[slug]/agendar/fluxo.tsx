"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Calendario } from "@/components/agenda/calendario";
import { Horarios, type OpcaoHorario } from "@/components/agenda/horarios";
import { Avatar, OpcaoProfissional } from "@/components/agenda/profissional";
import { Aviso, Botao, Caixa, classeInput } from "@/components/ui";
import type { Horario, ItemPedido, Profissional, ResumoPedido, Unidade } from "@/lib/disponibilidade";
import { formatarReais, telefoneLegivel } from "@/lib/painel/formatos";
import {
  buscarDias,
  buscarHorarios,
  buscarProfissionaisAptos,
  buscarProfissionaisDisponiveis,
  buscarUnidades,
  confirmarPedido,
  localizarCep,
} from "./acoes";
import { ListaEspera } from "./lista-espera";

export type ServicoCatalogo = {
  id: string;
  nome: string;
  tipo: "principal" | "adicional";
  descricao: string | null;
  precos: Record<string, { preco: number; duracao: number }>; // "porte.pelagem"
};
export type PetTutor = { id: string; nome: string; raca: string | null; porte: string; pelagem: string; foto_url: string | null };
export type LojaFluxo = { id: string; nome: string; slug: string; telefone: string | null; slotMinutos: number; hoje: string };

type Escolha = { principal?: string; adicionais: string[]; observacoes: string };
type Etapa = "pets" | "servicos" | "unidade" | "modo" | "data" | "profissional" | "resumo" | "pronto";
const PROGRESSO: Record<Etapa, number> = { pets: 1, servicos: 2, unidade: 3, modo: 4, data: 4, profissional: 4, resumo: 5, pronto: 5 };
const SEM_PREFERENCIA = "qualquer";

function dataLegivel(dia: string) {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

function horaLegivel(iso: string, fuso = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

type PropsFluxo = { loja: LojaFluxo; pets: PetTutor[]; catalogo: ServicoCatalogo[] };

/**
 * O roteador guarda a tela visitada (com o estado) para voltar instantaneamente. Depois de um agendamento
 * concluído, o fluxo recomeça do zero (com nova chave de idempotência) em vez de reabrir a confirmação anterior.
 */
export function FluxoAgendamento(props: PropsFluxo) {
  const [versao, setVersao] = useState(0);
  return <Fluxo key={versao} {...props} reiniciar={() => setVersao(versao + 1)} />;
}

function Fluxo({ loja, pets, catalogo, reiniciar }: PropsFluxo & { reiniciar: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>("pets");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [petAtual, setPetAtual] = useState(0); // índice na etapa de serviços
  const [unidades, setUnidades] = useState<Unidade[] | null>(null);
  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [modo, setModo] = useState<"data" | "profissional" | null>(null);
  const [mes, setMes] = useState(loja.hoje.slice(0, 7));
  const [dias, setDias] = useState<string[]>([]);
  const [dia, setDia] = useState<string | undefined>();
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [horario, setHorario] = useState<Horario | null>(null);
  const [profissionais, setProfissionais] = useState<(Profissional & { retiradaEstimada?: string })[]>([]);
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [consentimento, setConsentimento] = useState(false);
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
  const itens = unidade?.itens ?? itensOrigem;
  const lojaPedido = unidade?.id ?? loja.id;
  const profissionalReal = profissionalId && profissionalId !== SEM_PREFERENCIA ? profissionalId : undefined;

  const totalOrigem = selecionados.reduce((t, id) => {
    const pet = petPorId.get(id)!;
    const e = escolhas[id];
    return t + [e?.principal, ...(e?.adicionais ?? [])].reduce((s, sid) => s + (sid ? (precoDe(servicoPorId.get(sid)!, pet)?.preco ?? 0) : 0), 0);
  }, 0);
  const total = unidade?.totalCentavos ?? totalOrigem;

  function mostrarErro(r: { ok: false; erro: string }) {
    setErro(r.erro);
  }

  // ---- carregamentos -------------------------------------------------------
  function carregarUnidades(local?: { lat: number; lng: number }) {
    iniciar(async () => {
      setErro(null);
      const r = await buscarUnidades(loja.id, itensOrigem, local);
      if (!r.ok) return mostrarErro(r);
      setUnidades(r.dados);
    });
  }

  useEffect(() => {
    if (etapa !== "data" || !unidade) return;
    iniciar(async () => {
      const r = await buscarDias(lojaPedido, itens, `${mes}-01`, modo === "profissional" ? profissionalReal : undefined);
      if (!r.ok) return mostrarErro(r);
      setDias(r.dados);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega ao trocar de mês ou de etapa
  }, [etapa, mes, unidade]);

  function escolherDia(d: string) {
    setDia(d);
    setHorario(null);
    iniciar(async () => {
      const r = await buscarHorarios(lojaPedido, itens, d, modo === "profissional" ? profissionalReal : undefined);
      if (!r.ok) return mostrarErro(r);
      setHorarios(r.dados);
    });
  }

  function irParaProfissionais() {
    iniciar(async () => {
      setErro(null);
      if (modo === "data" && horario) {
        const r = await buscarProfissionaisDisponiveis(lojaPedido, itens, horario.inicio);
        if (!r.ok) return mostrarErro(r);
        setProfissionais(r.dados);
      } else {
        const r = await buscarProfissionaisAptos(lojaPedido, itens);
        if (!r.ok) return mostrarErro(r);
        setProfissionais(r.dados);
      }
      setEtapa("profissional");
    });
  }

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
        profissionalId: profissionalReal,
        chave,
        observacoes: observacoes || undefined,
        consentimentoContato: consentimento,
      });
      if (!r.ok) {
        mostrarErro(r);
        if (r.codigo === "horario_indisponivel") {
          setHorario(null);
          setEtapa("data");
          if (dia) escolherDia(dia);
        }
        return;
      }
      setResumo(r.dados);
      setEtapa("pronto");
    });
  }

  // ---- navegação -----------------------------------------------------------
  const escolhaAtual = escolhas[selecionados[petAtual]];
  const podeAvancar: Record<Etapa, boolean> = {
    pets: selecionados.length > 0,
    servicos: Boolean(escolhaAtual?.principal),
    unidade: Boolean(unidade),
    modo: Boolean(modo),
    data: Boolean(horario),
    profissional: Boolean(profissionalId),
    resumo: Boolean(horario),
    pronto: false,
  };

  function limparDaUnidadeEmDiante() {
    setUnidades(null);
    setUnidade(null);
    limparDaAgendaEmDiante();
  }
  function limparDaAgendaEmDiante() {
    setModo(null);
    setDia(undefined);
    setDias([]);
    setHorarios([]);
    setHorario(null);
    setProfissionalId(null);
  }

  function avancar() {
    setErro(null);
    switch (etapa) {
      case "pets":
        setEscolhas((s) => Object.fromEntries(selecionados.map((id) => [id, s[id] ?? { adicionais: [], observacoes: "" }])));
        setPetAtual(0);
        setEtapa("servicos");
        break;
      case "servicos":
        if (petAtual < selecionados.length - 1) setPetAtual(petAtual + 1);
        else {
          setEtapa("unidade");
          if (!unidades) carregarUnidades();
        }
        break;
      case "unidade":
        setEtapa("modo");
        break;
      case "modo":
        if (modo === "data") setEtapa("data");
        else irParaProfissionais();
        break;
      case "data":
        if (modo === "data") irParaProfissionais();
        else setEtapa("resumo");
        break;
      case "profissional":
        if (modo === "data") setEtapa("resumo");
        else setEtapa("data");
        break;
      case "resumo":
        confirmar();
        break;
    }
  }

  function voltar() {
    setErro(null);
    switch (etapa) {
      case "servicos":
        if (petAtual > 0) setPetAtual(petAtual - 1);
        else setEtapa("pets");
        break;
      case "unidade":
        setEtapa("servicos");
        break;
      case "modo":
        setEtapa("unidade");
        break;
      case "data":
        setEtapa(modo === "data" ? "modo" : "profissional");
        break;
      case "profissional":
        setEtapa(modo === "data" ? "data" : "modo");
        break;
      case "resumo":
        setEtapa(modo === "data" ? "profissional" : "data");
        break;
    }
  }

  // ---- telas ---------------------------------------------------------------
  const cabecalhoPets =
    etapa !== "pets" && etapa !== "pronto" && selecionados.length > 0 ? (
      <div className="mb-4 flex flex-col gap-2" aria-label="Seu pedido">
        {selecionados.map((id) => {
          const pet = petPorId.get(id)!;
          const principal = escolhas[id]?.principal ? servicoPorId.get(escolhas[id].principal!) : undefined;
          return (
            <div key={id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
              <Avatar foto={pet.foto_url} nome={pet.nome} tamanho="size-10" />
              <div className="flex flex-1 flex-col">
                <span className="font-medium">{pet.nome}</span>
                {principal && (
                  <span className="text-xs text-neutral-500">
                    {[principal.nome, ...(escolhas[id].adicionais.map((a) => servicoPorId.get(a)?.nome))].join(" + ")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {total > 0 && (
          <p className="self-end rounded-lg bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-200">
            {formatarReais(total)}
          </p>
        )}
      </div>
    ) : null;

  if (etapa === "pronto" && resumo && horario) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tipo="ok">
          <strong>Agendamento confirmado!</strong> {resumo.agendamentos.length > 1 ? `${resumo.agendamentos.length} pets` : "Seu pet"} em{" "}
          {dia && dataLegivel(dia)} às {horario.hora}, na {unidade?.nome}.
        </Aviso>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-950">
          <p>Retirada estimada: <strong>{horaLegivel(resumo.retirada_estimada)}</strong></p>
          <p>Total: <strong>{formatarReais(resumo.total_centavos)}</strong>, pago na loja.</p>
        </div>
        <Botao variante="secundario" onClick={reiniciar}>
          Fazer outro agendamento
        </Botao>
        <Link href="/conta/agendamentos" className="text-center font-medium text-teal-700 underline dark:text-teal-400">
          Ver meus agendamentos
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-28">
      <div className="mb-4 grid grid-cols-5 gap-2" role="progressbar" aria-label="Etapas do agendamento" aria-valuemin={1} aria-valuemax={5} aria-valuenow={PROGRESSO[etapa]}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`h-1 rounded-full ${n <= PROGRESSO[etapa] ? "bg-teal-700" : "bg-neutral-200 dark:bg-neutral-800"}`} />
        ))}
      </div>

      {cabecalhoPets}
      {erro && (
        <div className="mb-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {etapa === "pets" && (
        <section aria-labelledby="t-pets">
          <h2 id="t-pets" className="mb-3 text-lg font-semibold">Quais pets vão hoje?</h2>
          {pets.length === 0 && <p className="mb-3 text-sm text-neutral-500">Você ainda não cadastrou nenhum pet.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {pets.map((p) => {
              const marcado = selecionados.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border bg-white p-3 text-center dark:bg-neutral-950 ${marcado ? "border-teal-700 ring-1 ring-teal-700" : "border-neutral-200 dark:border-neutral-800"}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={marcado}
                    onChange={(e) => {
                      setSelecionados((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)));
                      limparDaUnidadeEmDiante();
                    }}
                  />
                  <Avatar foto={p.foto_url} nome={p.nome} tamanho="size-16" />
                  <span className="font-medium">{p.nome}</span>
                  <span className="text-xs text-neutral-500">{p.raca ?? " "}</span>
                </label>
              );
            })}
          </div>
          <Link
            href={`/conta/pets/novo?voltar=${encodeURIComponent(`/${loja.slug}/agendar`)}`}
            className="mt-3 flex min-h-11 items-center justify-center rounded-full border border-teal-700 text-sm font-medium text-teal-700 dark:text-teal-400"
          >
            + Cadastrar novo pet
          </Link>
        </section>
      )}

      {etapa === "servicos" && escolhaAtual !== undefined && (() => {
        const pet = petPorId.get(selecionados[petAtual])!;
        const atualizar = (e: Partial<Escolha>) => {
          setEscolhas((s) => ({ ...s, [pet.id]: { ...s[pet.id], ...e } }));
          limparDaUnidadeEmDiante();
        };
        const disponiveis = (lista: ServicoCatalogo[]) => lista.filter((s) => precoDe(s, pet));
        return (
          <section aria-labelledby="t-servico">
            <h2 id="t-servico" className="mb-1 text-lg font-semibold">Serviço para {pet.nome}</h2>
            {selecionados.length > 1 && <p className="mb-3 text-sm text-neutral-500">Pet {petAtual + 1} de {selecionados.length}</p>}
            <fieldset className="mb-4 flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Serviço principal</legend>
              {disponiveis(principais).length === 0 && <Aviso tipo="alerta">A loja não tem serviços para o porte e a pelagem de {pet.nome}.</Aviso>}
              {disponiveis(principais).map((s) => (
                <label key={s.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 dark:bg-neutral-950 ${escolhaAtual.principal === s.id ? "border-teal-700" : "border-neutral-200 dark:border-neutral-800"}`}>
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">{s.nome}</span>
                    {s.descricao && <span className="text-xs text-neutral-500">{s.descricao}</span>}
                  </span>
                  <span className="text-sm text-neutral-600 dark:text-neutral-300">{formatarReais(precoDe(s, pet)!.preco)}</span>
                  <input type="radio" name={`principal-${pet.id}`} checked={escolhaAtual.principal === s.id} onChange={() => atualizar({ principal: s.id })} className="size-5 accent-teal-700" />
                </label>
              ))}
            </fieldset>
            {disponiveis(adicionais).length > 0 && (
              <fieldset className="mb-4 flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Serviços adicionais (opcional)</legend>
                {disponiveis(adicionais).map((s) => {
                  const marcado = escolhaAtual.adicionais.includes(s.id);
                  return (
                    <label key={s.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 dark:bg-neutral-950 ${marcado ? "border-teal-700" : "border-neutral-200 dark:border-neutral-800"}`}>
                      <span className="flex-1 font-medium">{s.nome}</span>
                      <span className="text-sm text-neutral-600 dark:text-neutral-300">+ {formatarReais(precoDe(s, pet)!.preco)}</span>
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) =>
                          atualizar({ adicionais: e.target.checked ? [...escolhaAtual.adicionais, s.id] : escolhaAtual.adicionais.filter((x) => x !== s.id) })
                        }
                        className="size-5 accent-teal-700"
                      />
                    </label>
                  );
                })}
              </fieldset>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Observações</span>
              <textarea
                className={`${classeInput} py-2`}
                rows={3}
                maxLength={300}
                placeholder="Alguma informação importante sobre o serviço ou o pet."
                value={escolhaAtual.observacoes}
                onChange={(e) => setEscolhas((s) => ({ ...s, [pet.id]: { ...s[pet.id], observacoes: e.target.value } }))}
              />
            </label>
          </section>
        );
      })()}

      {etapa === "unidade" && (
        <EtapaUnidade
          unidades={unidades}
          unidade={unidade}
          carregando={carregando}
          onBuscar={carregarUnidades}
          onErro={setErro}
          onEscolher={(u) => {
            setUnidade(u);
            limparDaAgendaEmDiante();
          }}
        />
      )}

      {etapa === "modo" && (
        <section aria-labelledby="t-modo">
          <h2 id="t-modo" className="mb-3 text-lg font-semibold">Como prefere seguir?</h2>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["data", "Data e hora", "📅"],
                ["profissional", "Profissional", "👤"],
              ] as const
            ).map(([valor, rotulo, icone]) => (
              <label key={valor} className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border bg-white dark:bg-neutral-950 ${modo === valor ? "border-teal-700 ring-1 ring-teal-700" : "border-neutral-200 dark:border-neutral-800"}`}>
                <span aria-hidden className="text-2xl">{icone}</span>
                <span className="font-medium">{rotulo}</span>
                <input
                  type="radio"
                  name="modo"
                  checked={modo === valor}
                  onChange={() => {
                    limparDaAgendaEmDiante();
                    setModo(valor);
                  }}
                  className="size-5 accent-teal-700"
                />
              </label>
            ))}
          </div>
        </section>
      )}

      {etapa === "data" && (
        <section aria-labelledby="t-data" className="flex flex-col gap-4">
          <h2 id="t-data" className="text-lg font-semibold">Escolha a data</h2>
          <Calendario
            mes={mes}
            hoje={loja.hoje}
            diasComVaga={dias}
            selecionado={dia}
            carregando={carregando && !dia}
            onMes={(m) => {
              setMes(m);
              setDia(undefined);
              setHorarios([]);
              setHorario(null);
            }}
            onDia={escolherDia}
          />
          <Aviso>
            Não achou o dia ou horário que procura? Ligue para {telefoneLegivel(unidade?.telefone ?? loja.telefone) ?? "a loja"} e peça um encaixe.
          </Aviso>
          <ListaEspera key={dia ?? "sem-dia"} lojaId={lojaPedido} itens={itens} hoje={loja.hoje} diaSugerido={dia} />
          {dia && (
            <>
              <h3 className="font-semibold">Escolha o horário</h3>
              {carregando && horarios.length === 0 ? (
                <p className="text-sm text-neutral-500">Carregando horários…</p>
              ) : horarios.length === 0 ? (
                <p className="text-sm text-neutral-500">Sem horários neste dia.</p>
              ) : (
                <Horarios disponiveis={horarios as OpcaoHorario[]} passo={loja.slotMinutos} selecionado={horario?.inicio} onEscolher={(h) => setHorario(horarios.find((x) => x.inicio === h.inicio)!)} />
              )}
            </>
          )}
        </section>
      )}

      {etapa === "profissional" && (
        <section aria-labelledby="t-prof" className="flex flex-col gap-2">
          <h2 id="t-prof" className="mb-1 text-lg font-semibold">Escolha o profissional</h2>
          {modo === "data" && (
            <label className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 dark:bg-neutral-950 ${profissionalId === SEM_PREFERENCIA ? "border-teal-700" : "border-neutral-200 dark:border-neutral-800"}`}>
              <span className="flex size-12 items-center justify-center rounded-full bg-teal-50 text-xl dark:bg-teal-950" aria-hidden>✂️</span>
              <span className="flex-1 font-medium">Sem profissional de preferência</span>
              <input type="radio" name="profissional" checked={profissionalId === SEM_PREFERENCIA} onChange={() => setProfissionalId(SEM_PREFERENCIA)} className="size-5 accent-teal-700" />
            </label>
          )}
          {profissionais.length === 0 && <p className="text-sm text-neutral-500">Nenhum profissional disponível para esse pedido.</p>}
          {profissionais.map((p) => (
            <OpcaoProfissional
              key={p.id}
              p={p}
              selecionado={profissionalId === p.id}
              detalhe={p.retiradaEstimada ? `Retirada por volta das ${horaLegivel(p.retiradaEstimada)}` : undefined}
              onEscolher={() => {
                if (modo === "profissional" && profissionalId !== p.id) {
                  setDia(undefined);
                  setDias([]);
                  setHorarios([]);
                  setHorario(null);
                }
                setProfissionalId(p.id);
              }}
            />
          ))}
        </section>
      )}

      {etapa === "resumo" && horario && unidade && (
        <section aria-labelledby="t-resumo" className="flex flex-col gap-3">
          <h2 id="t-resumo" className="text-lg font-semibold">Resumo</h2>
          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <ItemResumo rotulo="Serviços" onEditar={() => { setPetAtual(0); setEtapa("servicos"); }}>
              {selecionados.map((id) => (
                <p key={id}>
                  <strong>{petPorId.get(id)!.nome}</strong>: {[escolhas[id].principal, ...escolhas[id].adicionais].map((s) => servicoPorId.get(s!)?.nome).join(" + ")}
                </p>
              ))}
            </ItemResumo>
            <ItemResumo rotulo="Unidade" onEditar={() => setEtapa("unidade")}>
              <p className="font-medium">{unidade.nome}</p>
              <p className="text-neutral-500">{unidade.endereco}</p>
            </ItemResumo>
            <ItemResumo rotulo="Data e hora" onEditar={() => setEtapa("data")}>
              <p className="font-medium">
                {dia && dataLegivel(dia)} às {horario.hora}
              </p>
              <p className="text-neutral-500">Retirada estimada por volta das {horaLegivel(profissionais.find((p) => p.id === profissionalId)?.retiradaEstimada ?? horario.retiradaEstimada)}</p>
            </ItemResumo>
            <ItemResumo rotulo="Profissional" onEditar={() => (modo === "data" ? irParaProfissionais() : setEtapa("profissional"))}>
              <p className="font-medium">{profissionalReal ? profissionais.find((p) => p.id === profissionalReal)?.nome : "Sem preferência (a loja escolhe)"}</p>
            </ItemResumo>
            <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-900">
              <span className="font-medium">Total</span>
              <span className="text-lg font-semibold">{formatarReais(unidade.totalCentavos)}</span>
            </div>
          </div>
          <Caixa
            rotulo="Aceito receber lembretes e a confirmação deste agendamento pelo WhatsApp."
            nome="consentimento"
            checked={consentimento}
            onChange={(e) => setConsentimento(e.target.checked)}
          />
          <p className="text-xs text-neutral-500">O pagamento é feito na loja.</p>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          {etapa === "pets" ? (
            <Link href={`/${loja.slug}`} className="min-h-11 px-2 py-3 text-sm font-medium text-teal-700 underline dark:text-teal-400">
              Voltar
            </Link>
          ) : (
            <button type="button" onClick={voltar} className="min-h-11 px-2 text-sm font-medium text-teal-700 underline dark:text-teal-400">
              Voltar
            </button>
          )}
          <Botao type="button" onClick={avancar} disabled={!podeAvancar[etapa] || carregando} aria-busy={carregando} className="min-w-40">
            {carregando ? "Aguarde…" : etapa === "resumo" ? "Confirmar agendamento" : "Avançar ›"}
          </Botao>
        </div>
      </div>
    </div>
  );
}

function ItemResumo({ rotulo, children, onEditar }: { rotulo: string; children: React.ReactNode; onEditar: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-neutral-100 py-3 text-sm last:border-0 dark:border-neutral-900">
      <div className="flex-1">
        <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{rotulo}</p>
        {children}
      </div>
      <button type="button" onClick={onEditar} className="flex size-10 items-center justify-center rounded-full text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950" aria-label={`Editar ${rotulo.toLowerCase()}`}>
        ✎
      </button>
    </div>
  );
}

function EtapaUnidade({
  unidades,
  unidade,
  carregando,
  onBuscar,
  onErro,
  onEscolher,
}: {
  unidades: Unidade[] | null;
  unidade: Unidade | null;
  carregando: boolean;
  onBuscar: (local?: { lat: number; lng: number }) => void;
  onErro: (e: string | null) => void;
  onEscolher: (u: Unidade) => void;
}) {
  const [forma, setForma] = useState<"loja" | "localizacao" | "cep">("loja");
  const [cep, setCep] = useState("");
  const [buscandoCep, iniciarCep] = useTransition();

  function usarLocalizacao() {
    setForma("localizacao");
    if (!("geolocation" in navigator)) return onErro("Seu aparelho não informa a localização. Use o CEP ou a lista.");
    navigator.geolocation.getCurrentPosition(
      (p) => onBuscar({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => onErro("Não conseguimos sua localização. Use o CEP ou a lista."),
      { timeout: 8000 },
    );
  }

  function buscarCep() {
    iniciarCep(async () => {
      const r = await localizarCep(cep);
      if (!r.ok) return onErro(r.erro);
      if (!r.dados) {
        onErro("Não achamos a localização desse CEP; mostramos todas as unidades.");
        return onBuscar();
      }
      onErro(null);
      onBuscar(r.dados);
    });
  }

  return (
    <section aria-labelledby="t-unidade" className="flex flex-col gap-3">
      <h2 id="t-unidade" className="text-lg font-semibold">Onde vai ser o atendimento?</h2>
      <div className="flex gap-2" role="group" aria-label="Buscar unidade por">
        {(
          [
            ["localizacao", "Localização", usarLocalizacao],
            ["cep", "CEP", () => setForma("cep")],
            ["loja", "Loja", () => { setForma("loja"); onBuscar(); }],
          ] as const
        ).map(([valor, rotulo, acao]) => (
          <button
            key={valor}
            type="button"
            onClick={acao}
            aria-pressed={forma === valor}
            className="min-h-10 rounded-full border border-neutral-300 px-4 text-sm aria-pressed:border-teal-700 aria-pressed:bg-teal-50 aria-pressed:text-teal-800 dark:border-neutral-700 dark:aria-pressed:bg-teal-950 dark:aria-pressed:text-teal-200"
          >
            {rotulo}
          </button>
        ))}
      </div>
      {forma === "cep" && (
        <div className="flex gap-2">
          <input
            aria-label="CEP"
            inputMode="numeric"
            placeholder="00000-000"
            value={cep}
            onChange={(e) => setCep(e.target.value)}
            className={classeInput}
          />
          <Botao type="button" variante="secundario" onClick={buscarCep} disabled={buscandoCep}>
            Buscar
          </Botao>
        </div>
      )}
      {carregando && !unidades && <p className="text-sm text-neutral-500">Buscando unidades…</p>}
      {unidades?.length === 0 && <Aviso tipo="alerta">Nenhuma unidade atende esses serviços para os seus pets.</Aviso>}
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Unidades">
        {unidades?.map((u) => (
          <label
            key={u.id}
            className={`flex cursor-pointer flex-col gap-2 rounded-xl border bg-white p-4 dark:bg-neutral-950 ${unidade?.id === u.id ? "border-teal-700 ring-1 ring-teal-700" : "border-neutral-200 dark:border-neutral-800"}`}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium">{u.nome}</span>
              {u.distanciaKm !== null && (
                <span className="rounded-full border border-neutral-300 px-2 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
                  {u.distanciaKm.toLocaleString("pt-BR")} km
                </span>
              )}
            </span>
            {u.endereco && <span className="text-sm text-neutral-500">{u.endereco}</span>}
            <span className="flex items-center justify-between">
              <span className="text-sm font-semibold">{formatarReais(u.totalCentavos)}</span>
              <input type="radio" name="unidade" checked={unidade?.id === u.id} onChange={() => onEscolher(u)} className="size-5 accent-teal-700" />
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
