import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso, BotaoLink, Carregando, Titulo, Vazio, classeInput } from "@/components/ui";
import { dataNoFuso, horaNoFuso } from "@/lib/painel/agenda";
import { telefoneLegivel } from "@/lib/painel/formatos";
import { exigirLoja, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clientes" };

const POR_PAGINA = 30;

export default function ClientesPage({ params, searchParams }: PageProps<"/painel/[lojaId]/clientes">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const dataCurta = (instante: string, fuso: string) => dataNoFuso(instante, fuso).split("-").reverse().slice(0, 2).join("/");

async function Conteudo({ params, searchParams }: { params: Promise<{ lojaId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ lojaId }, busca] = await Promise.all([params, searchParams]);
  const { loja, papel } = await exigirLoja(lojaId);
  if (!podeOperar(papel)) return <Aviso>A lista de clientes fica com a recepção da loja.</Aviso>;
  const q = typeof busca.q === "string" ? busca.q.trim().slice(0, 80) : "";
  const pagina = Math.max(1, Number(busca.pagina) || 1);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clientes_da_loja", {
    p_petshop_id: lojaId,
    p_busca: q || undefined,
    p_limite: POR_PAGINA,
    p_pular: (pagina - 1) * POR_PAGINA,
  });
  const base = `/painel/${lojaId}/clientes`;
  const total = Number(data?.[0]?.total ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <Titulo acao={<BotaoLink href={`/painel/${lojaId}/agenda/novo`} variante="secundario">Novo atendimento</BotaoLink>}>Clientes</Titulo>
      {/* GET: a busca fica na URL e o botão voltar do celular funciona. */}
      <form action={base} role="search" className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Buscar cliente</span>
          <input name="q" type="search" defaultValue={q} placeholder="Nome do tutor, do pet ou telefone" className={classeInput} />
        </label>
        <button type="submit" className="min-h-11 rounded-lg bg-marca-700 px-4 text-sm font-medium text-white hover:bg-marca-800">
          Buscar
        </button>
      </form>

      {error ? (
        <Aviso tipo="erro">Não foi possível carregar os clientes.</Aviso>
      ) : !data.length ? (
        <Vazio>{q ? `Nenhum cliente encontrado para “${q}”.` : "Nenhum cliente ainda. Eles aparecem aqui depois do primeiro agendamento."}</Vazio>
      ) : (
        <>
          <p className="text-sm text-neutral-500">{q ? `${total} cliente(s) encontrado(s)` : `${total} cliente(s)`}</p>
          <ul aria-label="Clientes da loja" className="flex flex-col gap-2">
            {data.map((c) => (
              <li key={c.tutor_id}>
                <Link
                  href={`${base}/${c.tutor_id}`}
                  className="flex flex-col gap-0.5 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm hover:border-marca-600 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{c.nome}</span>
                    <span className="text-xs text-neutral-500">{telefoneLegivel(c.telefone)}</span>
                  </span>
                  <span className="text-neutral-600 dark:text-neutral-400">{c.pets.length ? c.pets.join(", ") : "Sem pets cadastrados"}</span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-neutral-500">
                    {c.proximo_atendimento && (
                      <span className="font-medium text-marca-700 dark:text-marca-400">
                        Próximo: {dataCurta(c.proximo_atendimento, loja.fuso)} às {horaNoFuso(c.proximo_atendimento, loja.fuso)}
                      </span>
                    )}
                    {c.ultimo_atendimento && <span>Último: {dataCurta(c.ultimo_atendimento, loja.fuso)}</span>}
                    {c.faltas > 0 && <span className="text-red-700 dark:text-red-400">{c.faltas} falta(s)</span>}
                    {c.exige_sinal && <span className="text-red-700 dark:text-red-400">exige sinal</span>}
                    {!c.contato_autorizado && <span>sem lembretes</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {pagina > 1 && (
              <BotaoLink href={`${base}?${new URLSearchParams({ ...(q ? { q } : {}), pagina: String(pagina - 1) })}`} variante="secundario">
                Página anterior
              </BotaoLink>
            )}
            {total > pagina * POR_PAGINA && (
              <BotaoLink href={`${base}?${new URLSearchParams({ ...(q ? { q } : {}), pagina: String(pagina + 1) })}`} variante="secundario">
                Próxima página
              </BotaoLink>
            )}
          </div>
        </>
      )}
    </div>
  );
}
