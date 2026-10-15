import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cartao, Carregando, Vazio } from "@/components/ui";
import { COR_STATUS, NOME_STATUS, dataNoFuso, horaNoFuso } from "@/lib/painel/agenda";
import { NOME_PELAGEM, NOME_PORTE, formatarReais, telefoneLegivel } from "@/lib/painel/formatos";
import { exigirLoja, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { ObservacoesPet, ObservacoesTutor } from "./formularios";

export const metadata: Metadata = { title: "Ficha do pet" };

export default function FichaPetPage({ params }: PageProps<"/painel/[lojaId]/pets/[petId]">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ lojaId: string; petId: string }> }) {
  const { lojaId, petId } = await params;
  const { loja, papel } = await exigirLoja(lojaId);
  const supabase = await createClient();
  // O pet só é visível para a equipe de lojas em que o tutor é cliente (RLS).
  const { data: pet } = await supabase
    .from("pet")
    .select("id, nome, especie, raca, porte, pelagem, nascimento, alergias, temperamento, vacinas, tutor(id, nome, telefone_e164)")
    .eq("id", petId)
    .maybeSingle();
  if (!pet || !pet.tutor) notFound();
  const [vinculo, obs, historico] = await Promise.all([
    supabase.from("tutor_petshop").select("faltas, exige_sinal, observacoes, consentimento_contato_em").eq("petshop_id", lojaId).eq("tutor_id", pet.tutor.id).maybeSingle(),
    supabase.from("pet_petshop").select("observacoes, atualizado_em").eq("petshop_id", lojaId).eq("pet_id", petId).maybeSingle(),
    supabase
      .from("agendamento")
      .select("id, status, inicio, observacoes, preco_total_centavos, profissional(nome), agendamento_item(ordem, servico(nome))")
      .eq("petshop_id", lojaId)
      .eq("pet_id", petId)
      .order("inicio", { ascending: false })
      .limit(50),
  ]);
  // Sem vínculo com esta loja: o pet é de cliente de outra unidade.
  if (!vinculo.data) notFound();
  const editavel = podeOperar(papel);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{pet.nome}</h1>
        <p className="text-sm text-neutral-500">
          {pet.especie === "gato" ? "Gato" : "Cão"}
          {pet.raca && ` · ${pet.raca}`} · {NOME_PORTE[pet.porte]} · pelagem {NOME_PELAGEM[pet.pelagem].toLowerCase()}
          {pet.nascimento && ` · nasceu em ${pet.nascimento.split("-").reverse().join("/")}`}
        </p>
      </div>

      <Cartao>
        <h2 className="mb-2 font-medium">Saúde e comportamento</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-neutral-500">Alergias</dt>
          <dd className={pet.alergias ? "text-red-700 dark:text-red-400" : ""}>{pet.alergias || "Nenhuma informada"}</dd>
          <dt className="text-neutral-500">Temperamento</dt>
          <dd>{pet.temperamento || "Não informado"}</dd>
          <dt className="text-neutral-500">Vacinas</dt>
          <dd>{pet.vacinas || "Não informadas"}</dd>
        </dl>
      </Cartao>

      <Cartao>
        <h2 className="mb-2 font-medium">Observações da loja sobre o pet</h2>
        <p className="mb-2 text-xs text-neutral-500">Só a equipe desta loja vê. O tutor e outras lojas não veem.</p>
        {editavel ? (
          <ObservacoesPet lojaId={lojaId} petId={petId} valor={obs.data?.observacoes ?? ""} />
        ) : (
          <p className="text-sm">{obs.data?.observacoes || "Nenhuma observação."}</p>
        )}
      </Cartao>

      <Cartao>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-medium">Tutor</h2>
          {editavel && (
            <Link href={`/painel/${lojaId}/clientes/${pet.tutor.id}`} className="text-sm font-medium text-marca-700 dark:text-marca-400">
              Ficha do cliente
            </Link>
          )}
        </div>
        <p className="text-sm">
          <strong>{pet.tutor.nome}</strong> · {telefoneLegivel(pet.tutor.telefone_e164)}
        </p>
        <p className="text-sm text-neutral-500">
          {vinculo.data.faltas} falta(s) nesta loja{vinculo.data.exige_sinal && " · exige sinal"} ·{" "}
          {vinculo.data.consentimento_contato_em ? "autorizou lembretes" : "sem autorização para lembretes"}
        </p>
        {editavel ? (
          <div className="mt-2">
            <ObservacoesTutor lojaId={lojaId} tutorId={pet.tutor.id} valor={vinculo.data.observacoes ?? ""} />
          </div>
        ) : (
          vinculo.data.observacoes && <p className="mt-1 text-sm">{vinculo.data.observacoes}</p>
        )}
      </Cartao>

      <section aria-labelledby="t-historico">
        <h2 id="t-historico" className="mb-2 font-semibold">
          Histórico de atendimentos
        </h2>
        {!historico.data?.length ? (
          <Vazio>Nenhum atendimento nesta loja.</Vazio>
        ) : (
          <ul className="flex flex-col gap-2">
            {historico.data.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/painel/${lojaId}/agenda/${a.id}`}
                  className="flex flex-col gap-0.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm hover:border-marca-600 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {dataNoFuso(a.inicio, loja.fuso).split("-").reverse().join("/")} às {horaNoFuso(a.inicio, loja.fuso)} · {a.profissional?.nome}
                    </span>
                    <span className={`rounded-full border px-2 text-xs ${COR_STATUS[a.status]}`}>{NOME_STATUS[a.status]}</span>
                  </span>
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {[...a.agendamento_item]
                      .sort((x, y) => x.ordem - y.ordem)
                      .map((i) => i.servico?.nome)
                      .join(" + ")}{" "}
                    · {formatarReais(a.preco_total_centavos)}
                  </span>
                  {a.observacoes && <span className="text-neutral-500">{a.observacoes}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
