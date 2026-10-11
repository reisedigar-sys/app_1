import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BotaoLink, Carregando, Titulo } from "@/components/ui";
import { NOME_PAPEL } from "@/lib/painel/formatos";
import { minhasLojas } from "@/lib/painel/sessao";

export const metadata: Metadata = { title: "Minhas lojas" };

export default function PainelPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <Suspense fallback={<Carregando />}>
        <ListaLojas />
      </Suspense>
    </main>
  );
}

async function ListaLojas() {
  const lojas = await minhasLojas();
  if (lojas.length === 0) redirect("/painel/nova-loja");
  if (lojas.length === 1) redirect(`/painel/${lojas[0].id}`);

  return (
    <>
      <Titulo acao={<BotaoLink href="/painel/nova-loja" variante="secundario">Nova loja</BotaoLink>}>Minhas lojas</Titulo>
      <ul className="flex flex-col gap-2">
        {lojas.map((l) => (
          <li key={l.id}>
            <Link
              href={`/painel/${l.id}`}
              className="flex min-h-14 items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 hover:border-teal-600 dark:border-neutral-800 dark:bg-neutral-950"
            >
              <span className="font-medium">{l.nome}</span>
              <span className="text-xs text-neutral-500">
                {NOME_PAPEL[l.papel]}
                {!l.ativo && " · inativa"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
