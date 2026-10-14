import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/agenda/profissional";
import { BotaoLink, Carregando } from "@/components/ui";
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
  const [servicos, profissionais] = await Promise.all([
    supabase
      .from("servico")
      .select("id, nome, descricao, tipo, servico_preco(preco_centavos)")
      .eq("petshop_id", loja.id)
      .eq("ativo", true)
      .eq("tipo", "principal")
      .order("ordem"),
    supabase.from("profissional").select("id, nome, foto_url, bio").eq("petshop_id", loja.id).eq("ativo", true).order("ordem"),
  ]);
  const telefone = telefoneLegivel(loja.telefone_e164);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        {loja.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- logo do Storage, tamanho pequeno
          <img src={loja.logo_url} alt={`Logo de ${loja.nome}`} className="mb-2 size-20 rounded-2xl border border-neutral-200 bg-white object-contain dark:border-neutral-800" />
        )}
        <p className="text-sm font-medium text-teal-700 dark:text-teal-400">Banho e tosa</p>
        <h1 className="text-2xl font-semibold">{loja.nome}</h1>
        <p className="text-sm text-neutral-500">{enderecoDaLoja(loja)}</p>
        {telefone && (
          <a href={`tel:${loja.telefone_e164}`} className="text-sm text-teal-700 underline dark:text-teal-400">
            {telefone}
          </a>
        )}
      </header>

      {/* Sem prefetch: a tela de agendamento depende do login e não pode ser guardada antes dele. */}
      <BotaoLink href={`/${loja.slug}/agendar`} prefetch={false} className="w-full text-base">
        Agendar agora
      </BotaoLink>

      {(servicos.data ?? []).length > 0 && (
        <section aria-labelledby="t-servicos">
          <h2 id="t-servicos" className="mb-2 font-semibold">Serviços</h2>
          <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white dark:divide-neutral-900 dark:border-neutral-800 dark:bg-neutral-950">
            {servicos.data!.map((s) => {
              const precos = s.servico_preco.map((p) => p.preco_centavos);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex flex-col">
                    <span className="font-medium">{s.nome}</span>
                    {s.descricao && <span className="text-xs text-neutral-500">{s.descricao}</span>}
                  </span>
                  {precos.length > 0 && <span className="whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-300">a partir de {formatarReais(Math.min(...precos))}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(profissionais.data ?? []).length > 0 && (
        <section aria-labelledby="t-equipe">
          <h2 id="t-equipe" className="mb-2 font-semibold">Equipe</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {profissionais.data!.map((p) => (
              <li key={p.id} className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
                <Avatar foto={p.foto_url} nome={p.nome} />
                <span className="flex flex-col">
                  <span className="font-medium">{p.nome}</span>
                  {p.bio && <span className="text-xs text-neutral-500">{p.bio}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
