import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AvisosPush } from "@/components/avisos-push";
import { Aviso, Cartao, Carregando, Titulo } from "@/components/ui";
import { exigirLoja } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { LinkDaLoja } from "../link-da-loja";

type Checklist = {
  completo: boolean;
  dados_loja: boolean;
  tem_profissional: boolean;
  tem_servico_principal: boolean;
  servicos_incompletos: { id: string; nome: string; faltando: ("preco" | "profissional")[] }[];
  profissionais_sem_horario: { id: string; nome: string }[];
};

export const metadata: Metadata = { title: "Configurar loja" };

export default function ConfigurarPage({ params }: PageProps<"/painel/[lojaId]/configurar">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  const { loja } = await exigirLoja(lojaId);
  const supabase = await createClient();
  const { data } = await supabase.rpc("checklist_onboarding", { p_petshop_id: lojaId });
  const c = data as Checklist | null;
  const base = `/painel/${lojaId}`;

  if (!c) return <Aviso tipo="erro">Não foi possível carregar o checklist.</Aviso>;

  const itens = [
    { ok: c.dados_loja, texto: "Dados da loja: telefone e endereço completos", href: `${base}/loja` },
    { ok: c.tem_profissional, texto: "Pelo menos um profissional ativo", href: `${base}/profissionais` },
    { ok: c.tem_servico_principal, texto: "Pelo menos um serviço principal ativo", href: `${base}/servicos` },
    {
      ok: c.servicos_incompletos.length === 0,
      texto: "Todo serviço ativo tem preço e profissional habilitado",
      href: `${base}/precos`,
    },
    { ok: c.profissionais_sem_horario.length === 0, texto: "Todo profissional ativo tem horário", href: `${base}/horarios` },
  ];

  return (
    <>
      <Titulo>Configuração da loja</Titulo>
      {c.completo ? (
        <>
          <Aviso tipo="ok">Tudo pronto! Mande o link abaixo para os seus clientes agendarem.</Aviso>
          <Cartao className="mt-4">
            <h2 className="mb-2 font-medium">Link da loja</h2>
            <LinkDaLoja slug={loja.slug} nome={loja.nome} />
          </Cartao>
        </>
      ) : (
        <Aviso tipo="alerta">Complete os itens abaixo para começar a receber agendamentos.</Aviso>
      )}

      <Cartao className="mt-4">
        <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" aria-label="Checklist de onboarding">
          {itens.map((i) => (
            <li key={i.texto} className="flex min-h-12 items-center gap-3 py-2" data-ok={i.ok}>
              <span
                aria-hidden
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i.ok ? "bg-emerald-600 text-white" : "border-2 border-neutral-300 dark:border-neutral-700"}`}
              >
                {i.ok ? "✓" : ""}
              </span>
              <span className="flex-1 text-sm">
                {i.texto}
                <span className="sr-only">{i.ok ? " (concluído)" : " (pendente)"}</span>
              </span>
              {!i.ok && (
                <Link href={i.href} className="text-sm font-medium text-marca-700 dark:text-marca-400">
                  Resolver
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Cartao>

      <Cartao className="mt-4">
        <h2 className="mb-2 font-medium">Avisos no celular</h2>
        <AvisosPush
          escopo="equipe"
          texto="Receba um aviso quando um cliente agendar ou cancelar pelo app e quando alguém não confirmar. Cada pessoa liga no próprio celular."
        />
      </Cartao>

      {c.servicos_incompletos.length > 0 && (
        <Cartao className="mt-4">
          <h2 className="mb-2 font-medium">Serviços incompletos</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {c.servicos_incompletos.map((s) => (
              <li key={s.id}>
                <strong>{s.nome}</strong>: falta{" "}
                {s.faltando.map((f, i) => (
                  <span key={f}>
                    {i > 0 && " e "}
                    <Link className="text-marca-700 underline dark:text-marca-400" href={f === "preco" ? `${base}/precos?servico=${s.id}` : `${base}/habilitacao`}>
                      {f === "preco" ? "preço" : "profissional habilitado"}
                    </Link>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {c.profissionais_sem_horario.length > 0 && (
        <Cartao className="mt-4">
          <h2 className="mb-2 font-medium">Profissionais sem horário</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {c.profissionais_sem_horario.map((p) => (
              <li key={p.id}>
                <Link className="text-marca-700 underline dark:text-marca-400" href={`${base}/horarios?profissional=${p.id}`}>
                  {p.nome}
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </>
  );
}
