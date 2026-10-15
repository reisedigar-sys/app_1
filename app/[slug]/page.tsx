import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Avatar } from "@/components/agenda/profissional";
import { BotaoLink, Carregando } from "@/components/ui";
import { iniciaisDaLoja } from "@/lib/app-da-loja";
import { tutorAtual } from "@/lib/conta/sessao";
import { enderecoDaLoja, lojaPorSlug, telefoneLegivel } from "@/lib/loja-publica";
import { formatarReais } from "@/lib/painel/formatos";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agende banho e tosa" };

export default function LojaPublicaPage({ params }: PageProps<"/[slug]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loja = await lojaPorSlug(slug);
  if (!loja) notFound();
  const supabase = await createClient();
  const tutor = await tutorAtual();
  const [servicos, profissionais, historico] = await Promise.all([
    supabase
      .from("servico")
      .select("id, nome, descricao, tipo, servico_preco(preco_centavos, duracao_minutos)")
      .eq("petshop_id", loja.id)
      .eq("ativo", true)
      .eq("tipo", "principal")
      .order("ordem"),
    supabase.from("profissional").select("id, nome, foto_url, bio").eq("petshop_id", loja.id).eq("ativo", true).order("ordem"),
    tutor ? supabase.rpc("meus_agendamentos") : Promise.resolve({ data: null }),
  ]);
  const telefone = telefoneLegivel(loja.telefone_e164);
  const endereco = enderecoDaLoja(loja);

  // "Repetir o último": o pedido mais recente do tutor nesta loja (todos os pets dele), se não foi cancelado.
  const ultimo = (historico.data ?? []).find((a) => a.petshop_id === loja.id && a.status !== "cancelado");
  const doUltimo = ultimo ? (historico.data ?? []).filter((a) => a.pedido_id === ultimo.pedido_id) : [];

  return (
    <div className="flex flex-col gap-6 pb-24">
      <header className="flex flex-col gap-3 rounded-3xl bg-neutral-900 p-5 text-white dark:bg-neutral-800">
        {loja.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo do Storage, tamanho pequeno
          <img src={loja.logo_url} alt={`Logo de ${loja.nome}`} className="size-16 rounded-2xl bg-white object-contain" />
        ) : (
          <span aria-hidden className="flex size-16 items-center justify-center rounded-2xl bg-marca-500 font-titulo text-2xl font-extrabold">
            {iniciaisDaLoja(loja.nome)}
          </span>
        )}
        <div>
          <p className="text-sm font-semibold text-marca-300">Banho e tosa</p>
          <h1 className="text-3xl font-extrabold">{loja.nome}</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {endereco && <span className="rounded-full bg-white/10 px-3 py-1">{endereco}</span>}
          {telefone && (
            <a href={`tel:${loja.telefone_e164}`} className="rounded-full bg-white/10 px-3 py-1 underline-offset-2 hover:underline">
              {telefone}
            </a>
          )}
        </div>
      </header>

      {ultimo && (
        <Link
          href={`/${loja.slug}/agendar?repetir=${ultimo.pedido_id}`}
          prefetch={false}
          className="flex items-center gap-3 rounded-2xl border-2 border-marca-500 bg-white p-3 dark:bg-neutral-950"
        >
          <span className="flex flex-1 flex-col">
            <span className="font-semibold">Repetir o banho {doUltimo.length > 1 ? "dos seus pets" : `de ${ultimo.pet_nome}`}</span>
            <span className="text-xs text-neutral-500">{doUltimo.map((a) => `${a.pet_nome}: ${a.servicos.join(" + ")}`).join(" · ")}</span>
          </span>
          <span className="shrink-0 rounded-full bg-marca-700 px-3 py-2 text-xs font-bold text-white">Ver horários</span>
        </Link>
      )}

      {(servicos.data ?? []).length > 0 && (
        <section aria-labelledby="t-servicos">
          <h2 id="t-servicos" className="mb-2 text-xl font-bold">Serviços</h2>
          <ul className="flex flex-col gap-2">
            {servicos.data!.map((s) => {
              const precos = s.servico_preco.map((p) => p.preco_centavos);
              const duracoes = s.servico_preco.map((p) => p.duracao_minutos);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-neutral-900">
                  <span className="flex flex-col">
                    <span className="font-semibold">{s.nome}</span>
                    <span className="text-xs text-neutral-500">
                      {[duracoes.length > 0 ? `a partir de ${duracaoLegivel(Math.min(...duracoes))}` : null, s.descricao].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {precos.length > 0 && <span className="whitespace-nowrap text-sm font-semibold tabular-nums">a partir de {formatarReais(Math.min(...precos))}</span>}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">O preço final depende do porte e da pelagem do pet.</p>
        </section>
      )}

      {(profissionais.data ?? []).length > 0 && (
        <section aria-labelledby="t-equipe">
          <h2 id="t-equipe" className="mb-2 text-xl font-bold">Quem cuida</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {profissionais.data!.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-900">
                <Avatar foto={p.foto_url} nome={p.nome} />
                <span className="flex flex-col">
                  <span className="font-semibold">{p.nome}</span>
                  {p.bio && <span className="text-xs text-neutral-500">{p.bio}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sem prefetch: a tela de agendamento depende do login e não pode ser guardada antes dele. */}
      <div className="fixed inset-x-0 bottom-0 z-10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:bg-neutral-950/95">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <BotaoLink href={`/${loja.slug}/agendar`} prefetch={false} className="w-full text-base">
            Agendar banho e tosa
          </BotaoLink>
        </div>
      </div>
    </div>
  );
}

function duracaoLegivel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
