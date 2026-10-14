"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { buscarHorarios } from "@/app/[slug]/agendar/acoes";
import { Horarios } from "@/components/agenda/horarios";
import { AreaTexto, Aviso, Botao, Caixa, Campo, Cartao, Selecao } from "@/components/ui";
import type { Horario, ItemPedido } from "@/lib/disponibilidade";
import { NOME_PELAGEM, NOME_PORTE, PELAGENS, PORTES, formatarReais, telefoneLegivel } from "@/lib/painel/formatos";
import { type PetBalcao, type TutorBalcao, agendarNoPainel, buscarTutor, cadastrarPet, cadastrarTutor } from "../acoes";

type Servico = {
  id: string;
  nome: string;
  tipo: "principal" | "adicional";
  precos: { porte: string; pelagem: string; preco_centavos: number; duracao_minutos: number }[];
};
type Escolha = { principal: string; adicionais: string[] };

const precoDe = (s: Servico, pet: PetBalcao) => s.precos.find((p) => p.porte === pet.porte && p.pelagem === pet.pelagem);

/**
 * Atendimento criado pela equipe (balcão, telefone ou WhatsApp): tutor pelo telefone (com cadastro mínimo se não
 * existir), pets, serviços por pet e horário pelo motor; ou encaixe fora da grade com um profissional escolhido.
 */
export function NovoAtendimento({
  lojaId,
  catalogo,
  profissionais,
  dataInicial,
  slotMinutos,
}: {
  lojaId: string;
  catalogo: Servico[];
  profissionais: { id: string; nome: string }[];
  dataInicial: string;
  slotMinutos: number;
}) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Mesma chave em novas tentativas: um clique repetido nunca cria dois pedidos.
  const [chave] = useState(() => crypto.randomUUID());

  const [canal, setCanal] = useState<"balcao" | "whatsapp">("balcao");
  const [telefone, setTelefone] = useState("");
  const [busca, setBusca] = useState<{ telefone: string; tutores: TutorBalcao[] } | null>(null);
  const [tutor, setTutor] = useState<TutorBalcao | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [consentimento, setConsentimento] = useState(false);

  const [pets, setPets] = useState<string[]>([]);
  const [novoPet, setNovoPet] = useState<{ nome: string; porte: string; pelagem: string; especie: string; raca: string } | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});

  const [encaixe, setEncaixe] = useState(false);
  const [profissional, setProfissional] = useState("");
  const [data, setData] = useState(dataInicial);
  const [hora, setHora] = useState("");
  const [horarios, setHorarios] = useState<Horario[] | null>(null);
  const [horario, setHorario] = useState<Horario | null>(null);
  const [observacoes, setObservacoes] = useState("");

  const petPorId = useMemo(() => new Map((tutor?.pets ?? []).map((p) => [p.id, p])), [tutor]);
  const itens: ItemPedido[] | null = useMemo(() => {
    if (pets.length === 0 || pets.some((id) => !escolhas[id]?.principal)) return null;
    return pets.map((id) => ({ pet_id: id, servicos: [escolhas[id].principal, ...escolhas[id].adicionais] }));
  }, [pets, escolhas]);
  const total = itens
    ? itens.reduce((t, i) => t + i.servicos.reduce((s, sid) => s + (precoDe(catalogo.find((c) => c.id === sid)!, petPorId.get((i as { pet_id: string }).pet_id)!)?.preco_centavos ?? 0), 0), 0)
    : 0;
  const chaveItens = JSON.stringify(itens);

  // Horários do motor (só fora do modo encaixe), recarregados quando muda o pedido, o dia ou o profissional.
  useEffect(() => {
    if (encaixe || !itens) return;
    let ativo = true;
    iniciar(async () => {
      const r = await buscarHorarios(lojaId, itens, data, profissional || undefined);
      if (!ativo) return;
      setHorario(null);
      if (r.ok) setHorarios(r.dados);
      else setErro(r.erro);
    });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chaveItens representa itens
  }, [lojaId, chaveItens, data, profissional, encaixe]);

  function procurar() {
    setErro(null);
    iniciar(async () => {
      const r = await buscarTutor(lojaId, telefone);
      if (!r.ok) return setErro(r.erro);
      setBusca(r.dados);
      setTutor(r.dados.tutores.length === 1 ? r.dados.tutores[0] : null);
      setPets([]);
      setEscolhas({});
    });
  }

  function criarTutor() {
    if (!busca) return;
    setErro(null);
    iniciar(async () => {
      const r = await cadastrarTutor({ lojaId, nome: novoNome, telefone: busca.telefone, consentimento });
      if (!r.ok) return setErro(r.erro);
      setBusca({ ...busca, tutores: [r.dados] });
      setTutor(r.dados);
      if (r.dados.pets.length === 0) setNovoPet({ nome: "", porte: "medio", pelagem: "curta", especie: "cao", raca: "" });
    });
  }

  function criarPet() {
    if (!tutor || !novoPet) return;
    setErro(null);
    iniciar(async () => {
      const r = await cadastrarPet({ lojaId, tutorId: tutor.id, pet: novoPet as Parameters<typeof cadastrarPet>[0]["pet"] });
      if (!r.ok) return setErro(r.erro);
      setTutor({ ...tutor, pets: [...tutor.pets, r.dados] });
      setPets((p) => [...p, r.dados.id]);
      setNovoPet(null);
    });
  }

  function alternarPet(id: string, marcado: boolean) {
    setPets((p) => (marcado ? [...p, id] : p.filter((x) => x !== id)));
  }

  function agendar() {
    if (!tutor || !itens) return;
    setErro(null);
    iniciar(async () => {
      const r = await agendarNoPainel({
        lojaId,
        tutorId: tutor.id,
        itens,
        canal,
        chave,
        observacoes: observacoes || undefined,
        profissionalId: profissional || undefined,
        inicio: encaixe ? undefined : horario?.inicio,
        encaixe: encaixe ? { data, hora } : undefined,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.push(`/painel/${lojaId}/agenda?data=${r.dados.data}`);
    });
  }

  const pronto = Boolean(tutor && itens && (encaixe ? profissional && hora : horario));

  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <h2 className="mb-3 font-medium">1. Cliente</h2>
        <fieldset className="mb-3 flex flex-wrap gap-4">
          <legend className="mb-1 text-sm font-medium">Canal</legend>
          {(
            [
              ["balcao", "Balcão ou telefone"],
              ["whatsapp", "WhatsApp"],
            ] as const
          ).map(([v, rotulo]) => (
            <label key={v} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name="canal" className="size-5 accent-marca-700" checked={canal === v} onChange={() => setCanal(v)} />
              {rotulo}
            </label>
          ))}
        </fieldset>
        <div className="flex items-end gap-2">
          <Campo
            rotulo="Telefone do tutor"
            nome="telefone"
            type="tel"
            inputMode="tel"
            placeholder="(11) 98888-7777"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                procurar();
              }
            }}
            className="flex-1"
          />
          <Botao type="button" variante="secundario" onClick={procurar} disabled={ocupado || telefone.trim().length < 8}>
            Buscar
          </Botao>
        </div>

        {busca && busca.tutores.length > 1 && (
          <fieldset className="mt-3 flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Clientes com este telefone</legend>
            {busca.tutores.map((t) => (
              <label key={t.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="tutor" className="size-5 accent-marca-700" checked={tutor?.id === t.id} onChange={() => setTutor(t)} />
                {t.nome} {t.temConta ? "(tem conta no app)" : "(cadastrado pela loja)"}
              </label>
            ))}
          </fieldset>
        )}
        {tutor && (
          <p className="mt-3 text-sm">
            <strong>{tutor.nome}</strong> · {telefoneLegivel(tutor.telefone)}
            {tutor.faltas > 0 && <span className="text-red-700 dark:text-red-400"> · {tutor.faltas} falta(s)</span>}
            {tutor.exigeSinal && <span className="text-red-700 dark:text-red-400"> · exige sinal</span>}
          </p>
        )}
        {busca && busca.tutores.length === 0 && (
          <div className="mt-3 flex flex-col gap-3">
            <Aviso tipo="info">Nenhum cliente da loja com {telefoneLegivel(busca.telefone)}. Cadastre o tutor:</Aviso>
            <Campo rotulo="Nome do tutor" nome="tutor_nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} maxLength={120} />
            <Caixa rotulo="O tutor autoriza lembretes por WhatsApp" nome="consentimento" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} />
            <Botao type="button" onClick={criarTutor} disabled={ocupado || novoNome.trim().length < 2}>
              Cadastrar tutor
            </Botao>
          </div>
        )}
      </Cartao>

      {tutor && (
        <Cartao>
          <h2 className="mb-3 font-medium">2. Pets</h2>
          {tutor.pets.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="sr-only">Pets atendidos (na ordem escolhida)</legend>
              {tutor.pets.map((p) => (
                <Caixa
                  key={p.id}
                  nome={`pet-${p.id}`}
                  rotulo={`${p.nome} · ${NOME_PORTE[p.porte as keyof typeof NOME_PORTE]}, pelagem ${NOME_PELAGEM[p.pelagem as keyof typeof NOME_PELAGEM].toLowerCase()}${pets.length > 1 && pets.includes(p.id) ? ` (${pets.indexOf(p.id) + 1}º)` : ""}`}
                  checked={pets.includes(p.id)}
                  onChange={(e) => alternarPet(p.id, e.target.checked)}
                />
              ))}
            </fieldset>
          )}
          {novoPet ? (
            <div className="mt-3 flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <Campo rotulo="Nome do pet" nome="pet_nome" value={novoPet.nome} onChange={(e) => setNovoPet({ ...novoPet, nome: e.target.value })} maxLength={60} />
              <div className="grid grid-cols-2 gap-3">
                <Selecao rotulo="Espécie" nome="pet_especie" value={novoPet.especie} onChange={(e) => setNovoPet({ ...novoPet, especie: e.target.value })}>
                  <option value="cao">Cão</option>
                  <option value="gato">Gato</option>
                </Selecao>
                <Campo rotulo="Raça (opcional)" nome="pet_raca" value={novoPet.raca} onChange={(e) => setNovoPet({ ...novoPet, raca: e.target.value })} maxLength={60} />
                <Selecao rotulo="Porte" nome="pet_porte" value={novoPet.porte} onChange={(e) => setNovoPet({ ...novoPet, porte: e.target.value })}>
                  {PORTES.map((p) => (
                    <option key={p} value={p}>
                      {NOME_PORTE[p]}
                    </option>
                  ))}
                </Selecao>
                <Selecao rotulo="Pelagem" nome="pet_pelagem" value={novoPet.pelagem} onChange={(e) => setNovoPet({ ...novoPet, pelagem: e.target.value })}>
                  {PELAGENS.map((p) => (
                    <option key={p} value={p}>
                      {NOME_PELAGEM[p]}
                    </option>
                  ))}
                </Selecao>
              </div>
              <div className="flex gap-2">
                <Botao type="button" onClick={criarPet} disabled={ocupado || !novoPet.nome.trim()}>
                  Cadastrar pet
                </Botao>
                {tutor.pets.length > 0 && (
                  <Botao type="button" variante="secundario" onClick={() => setNovoPet(null)}>
                    Cancelar
                  </Botao>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="mt-2 min-h-11 text-sm font-medium text-marca-700 dark:text-marca-400"
              onClick={() => setNovoPet({ nome: "", porte: "medio", pelagem: "curta", especie: "cao", raca: "" })}
            >
              + Novo pet
            </button>
          )}
        </Cartao>
      )}

      {tutor && pets.length > 0 && (
        <Cartao>
          <h2 className="mb-3 font-medium">3. Serviços</h2>
          <div className="flex flex-col gap-4">
            {pets.map((id) => {
              const pet = petPorId.get(id)!;
              const escolha = escolhas[id] ?? { principal: "", adicionais: [] };
              const atualizar = (e: Partial<Escolha>) => setEscolhas((s) => ({ ...s, [id]: { ...escolha, ...e } }));
              const principais = catalogo.filter((s) => s.tipo === "principal" && precoDe(s, pet));
              const adicionais = catalogo.filter((s) => s.tipo === "adicional" && precoDe(s, pet));
              return (
                <div key={id} className="flex flex-col gap-2">
                  <Selecao rotulo={`Serviço principal de ${pet.nome}`} nome={`principal-${id}`} value={escolha.principal} onChange={(e) => atualizar({ principal: e.target.value })}>
                    <option value="">Escolha…</option>
                    {principais.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome} · {formatarReais(precoDe(s, pet)!.preco_centavos)} · {precoDe(s, pet)!.duracao_minutos} min
                      </option>
                    ))}
                  </Selecao>
                  {adicionais.map((s) => (
                    <Caixa
                      key={s.id}
                      nome={`adicional-${id}-${s.id}`}
                      rotulo={`${s.nome} (${pet.nome}) · + ${formatarReais(precoDe(s, pet)!.preco_centavos)}`}
                      checked={escolha.adicionais.includes(s.id)}
                      onChange={(e) => atualizar({ adicionais: e.target.checked ? [...escolha.adicionais, s.id] : escolha.adicionais.filter((x) => x !== s.id) })}
                    />
                  ))}
                  {principais.length === 0 && <p className="text-sm text-red-700">A loja não tem serviço com preço para o porte e a pelagem de {pet.nome}.</p>}
                </div>
              );
            })}
          </div>
        </Cartao>
      )}

      {itens && (
        <Cartao>
          <h2 className="mb-3 font-medium">4. Horário</h2>
          <div className="flex flex-col gap-3">
            <Caixa
              rotulo="Encaixe (fora da grade, com um profissional escolhido)"
              nome="encaixe"
              checked={encaixe}
              onChange={(e) => {
                setEncaixe(e.target.checked);
                setHorario(null);
                if (e.target.checked && !profissional) setProfissional(profissionais[0]?.id ?? "");
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              <Selecao rotulo="Profissional" nome="profissional" value={profissional} onChange={(e) => setProfissional(e.target.value)}>
                {!encaixe && <option value="">Qualquer profissional</option>}
                {profissionais.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Selecao>
              <Campo rotulo="Data" nome="data" type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
              {encaixe && <Campo rotulo="Hora do encaixe" nome="hora" type="time" step={300} value={hora} onChange={(e) => setHora(e.target.value)} />}
            </div>
            {encaixe ? (
              <p className="text-xs text-neutral-500">O encaixe ignora a grade e o horário de trabalho, mas nunca fica por cima de outro atendimento do mesmo profissional.</p>
            ) : horarios === null || (ocupado && !horario) ? (
              <p className="text-sm text-neutral-500">Carregando horários…</p>
            ) : horarios.length === 0 ? (
              <p className="text-sm text-neutral-500">Sem horários neste dia. Tente outro dia, outro profissional ou um encaixe.</p>
            ) : (
              <Horarios disponiveis={horarios} passo={slotMinutos} selecionado={horario?.inicio} onEscolher={(h) => setHorario(horarios.find((x) => x.inicio === h.inicio)!)} />
            )}
          </div>
        </Cartao>
      )}

      {itens && (
        <Cartao>
          <h2 className="mb-3 font-medium">5. Confirmar</h2>
          <div className="flex flex-col gap-3">
            <AreaTexto rotulo="Observações (opcional)" nome="observacoes" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={1000} />
            <p className="text-sm">
              Total: <strong>{formatarReais(total)}</strong>
            </p>
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <Botao type="button" onClick={agendar} disabled={!pronto || ocupado}>
              {ocupado ? "Agendando…" : encaixe ? "Agendar encaixe" : horario ? `Agendar às ${horario.hora}` : "Escolha o horário"}
            </Botao>
          </div>
        </Cartao>
      )}
      {!itens && erro && <Aviso tipo="erro">{erro}</Aviso>}
    </div>
  );
}
