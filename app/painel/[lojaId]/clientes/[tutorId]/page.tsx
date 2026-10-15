import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { Aviso, BotaoLink, Cartao, Carregando, Vazio } from "@/components/ui";
import { COR_STATUS, NOME_STATUS, dataNoFuso, horaNoFuso } from "@/lib/painel/agenda";
import { NOME_PELAGEM, NOME_PORTE, formatarReais, telefoneLegivel } from "@/lib/painel/formatos";
import { exigirLoja, podeConfigurar, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { dispensarSinal } from "../../agenda/acoes";
import { ContatoTutor } from "../../lista-atendimentos";
import { ObservacoesTutor } from "../../pets/[petId]/formularios";

export const metadata: Metadata = { title: "Cliente" };

export default function FichaClientePage({ params }: PageProps<"/painel/[lojaId]/clientes/[tutorId]">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

// Instante da requisição (a página é sempre dinâmica: a sessão é lida em createClient()).
const agora = () => Date.now();
const dataLegivel = (instante: string, fuso: string) => dataNoFuso(instante, fuso).split("-").reverse().join("/");

async function Conteudo({ params }: { params: Promise<{ lojaId: string; tutorId: string }> }) {
  const { lojaId, tutorId } = await params;
  const { loja, papel } = await exigirLoja(lojaId);
  if (!podeOperar(papel)) return <Aviso>A ficha dos clientes fica com a recepção da loja.</Aviso>;
  const supabase = await createClient();
  const [tutor, vinculo, pets, agenda] = await Promise.all([
    supabase.from("tutor").select("id, nome, telefone_e164, user_id").eq("id", tutorId).maybeSingle(),
    supabase
      .from("tutor_petshop")
      .select("faltas, exige_sinal, observacoes, consentimento_contato_em, consentimento_marketing_em, criado_em")
      .eq("petshop_id", lojaId)
      .eq("tutor_id", tutorId)
      .maybeSingle(),
    supabase.from("pet").select("id, nome, especie, raca, porte, pelagem, alergias").eq("tutor_id", tutorId).order("nome"),
    supabase
      .from("agendamento")
      .select("id, status, inicio, preco_total_centavos, pet(nome), profissional(nome), agendamento_item(ordem, servico(nome))")
      .eq("petshop_id", lojaId)
      .eq("tutor_id", tutorId)
      .order("inicio", { ascending: false })
      .limit(40),
  ]);
  // Só clientes desta loja: um tutor de outra unidade não abre aqui, mesmo que a equipe o veja lá.
  if (!tutor.data || !vinculo.data) notFound();
  const t = tutor.data;
  const v = vinculo.data;
  const base = `/painel/${lojaId}`;
  const atendimentos = agenda.data ?? [];
  const proximos = atendimentos.filter((a) => (a.status === "agendado" || a.status === "confirmado") && new Date(a.inicio).getTime() > agora()).reverse();
  const historico = atendimentos.filter((a) => !proximos.includes(a));
  const concluidos = atendimentos.filter((a) => a.status === "concluido");
  const gasto = concluidos.reduce((s, a) => s + a.preco_total_centavos, 0);

  return (
    <div className="flex flex-col gap-4">
      <Link href={`${base}/clientes`} className="text-sm text-marca-700 dark:text-marca-400">
        ‹ Clientes
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.nome}</h1>
          <p className="text-sm text-neutral-500">
            {telefoneLegivel(t.telefone_e164)} · {t.user_id ? "tem conta no app" : "cadastrado pela loja"} · cliente desde {dataLegivel(v.criado_em, loja.fuso)}
          </p>
        </div>
        <BotaoLink href={`${base}/agenda/novo?cliente=${t.id}`}>Agendar</BotaoLink>
      </div>
      <div className="flex flex-wrap gap-2">
        <ContatoTutor telefone={t.telefone_e164} texto={`Olá, ${t.nome.trim().split(/\s+/)[0]}! Aqui é da ${loja.nome}.`} />
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {[
          ["Atendimentos", String(concluidos.length)],
          ["Faltas", String(v.faltas)],
          ["Total gasto", formatarReais(gasto)],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <dt className="text-xs text-neutral-500">{rotulo}</dt>
            <dd className={`text-lg font-semibold ${rotulo === "Faltas" && v.faltas > 0 ? "text-red-700 dark:text-red-400" : ""}`}>{valor}</dd>
          </div>
        ))}
      </dl>
      {atendimentos.length === 40 && <p className="-mt-2 text-xs text-neutral-500">Números dos últimos 40 atendimentos.</p>}

      {v.exige_sinal && (
        <Aviso tipo="alerta">
          Este cliente faltou e passou a exigir sinal nos próximos agendamentos.
          {podeConfigurar(papel) && (
            <FormAcao acao={dispensarSinal} semBotao className="mt-2">
              <input type="hidden" name="loja_id" value={lojaId} />
              <input type="hidden" name="tutor_id" value={t.id} />
              <BotaoEnviar variante="secundario">Dispensar o sinal deste cliente</BotaoEnviar>
            </FormAcao>
          )}
        </Aviso>
      )}

      <Cartao>
        <h2 className="mb-2 font-medium">Pets</h2>
        {!pets.data?.length ? (
          <p className="text-sm text-neutral-500">Nenhum pet cadastrado.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900">
            {pets.data.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`${base}/pets/${p.id}`} className="flex flex-col text-sm">
                  <span className="font-medium text-marca-700 dark:text-marca-400">{p.nome}</span>
                  <span className="text-neutral-500">
                    {p.especie === "gato" ? "Gato" : "Cão"}
                    {p.raca && ` · ${p.raca}`} · {NOME_PORTE[p.porte]} · pelagem {NOME_PELAGEM[p.pelagem].toLowerCase()}
                  </span>
                  {p.alergias && <span className="text-red-700 dark:text-red-400">Alergias: {p.alergias}</span>}
                </Link>
                <BotaoLink href={`${base}/agenda/novo?cliente=${t.id}&pet=${p.id}`} variante="secundario" className="min-h-10 px-3">
                  Agendar de novo
                </BotaoLink>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao>
        <h2 className="mb-2 font-medium">Contato e autorizações</h2>
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            {v.consentimento_contato_em
              ? `Autorizou lembretes por WhatsApp em ${dataLegivel(v.consentimento_contato_em, loja.fuso)}.`
              : "Não autorizou lembretes: não recebe confirmação nem lembretes."}
          </li>
          <li className="text-neutral-500">
            {v.consentimento_marketing_em ? "Aceita receber promoções." : "Não aceitou receber promoções."}
          </li>
        </ul>
        <div className="mt-3">
          <ObservacoesTutor lojaId={lojaId} tutorId={t.id} valor={v.observacoes ?? ""} />
        </div>
      </Cartao>

      <ListaAtendimentos titulo="Próximos atendimentos" itens={proximos} base={base} fuso={loja.fuso} vazio="Nenhum atendimento marcado." />
      <ListaAtendimentos titulo="Histórico" itens={historico} base={base} fuso={loja.fuso} vazio="Nenhum atendimento anterior nesta loja." />
    </div>
  );
}

type Atendimento = {
  id: string;
  status: keyof typeof NOME_STATUS;
  inicio: string;
  preco_total_centavos: number;
  pet: { nome: string } | null;
  profissional: { nome: string } | null;
  agendamento_item: { ordem: number; servico: { nome: string } | null }[];
};

function ListaAtendimentos({ titulo, itens, base, fuso, vazio }: { titulo: string; itens: Atendimento[]; base: string; fuso: string; vazio: string }) {
  return (
    <section aria-label={titulo}>
      <h2 className="mb-2 font-semibold">{titulo}</h2>
      {itens.length === 0 ? (
        <Vazio>{vazio}</Vazio>
      ) : (
        <ul className="flex flex-col gap-2">
          {itens.map((a) => (
            <li key={a.id}>
              <Link
                href={`${base}/agenda/${a.id}`}
                className="flex flex-col gap-0.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm hover:border-marca-600 dark:border-neutral-800 dark:bg-neutral-950"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {dataLegivel(a.inicio, fuso)} às {horaNoFuso(a.inicio, fuso)} · {a.pet?.nome}
                  </span>
                  <span className={`rounded-full border px-2 text-xs ${COR_STATUS[a.status]}`}>{NOME_STATUS[a.status]}</span>
                </span>
                <span className="text-neutral-600 dark:text-neutral-400">
                  {[...a.agendamento_item]
                    .sort((x, y) => x.ordem - y.ordem)
                    .map((i) => i.servico?.nome)
                    .join(" + ")}{" "}
                  · {a.profissional?.nome} · {formatarReais(a.preco_total_centavos)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
