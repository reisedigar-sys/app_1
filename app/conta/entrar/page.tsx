import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Carregando } from "@/components/ui";
import { caminhoSeguro } from "@/lib/conta/voltar";
import { FormularioCadastroTutor, FormularioEntrarTutor } from "../formularios";

export const metadata: Metadata = { title: "Entrar" };

export default function EntrarTutorPage({ searchParams }: PageProps<"/conta/entrar">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-teal-700 dark:text-teal-400">Hora do Pet</h1>
        <p className="text-sm text-neutral-500">Agende banho e tosa em poucos toques.</p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const voltar = caminhoSeguro(sp.voltar);
  const cadastro = sp.modo === "cadastrar";
  const q = (modo?: string) => `/conta/entrar?${new URLSearchParams({ ...(modo ? { modo } : {}), voltar }).toString()}`;
  const aba =
    "flex min-h-10 items-center justify-center rounded-md font-medium aria-[current=page]:bg-white aria-[current=page]:shadow-sm dark:aria-[current=page]:bg-neutral-800";
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Entrar ou criar conta" className="grid grid-cols-2 rounded-lg bg-neutral-100 p-1 text-sm dark:bg-neutral-900">
        <Link href={q()} replace aria-current={cadastro ? undefined : "page"} className={aba}>
          Entrar
        </Link>
        <Link href={q("cadastrar")} replace aria-current={cadastro ? "page" : undefined} className={aba}>
          Criar conta
        </Link>
      </nav>
      {cadastro ? <FormularioCadastroTutor voltar={voltar} /> : <FormularioEntrarTutor voltar={voltar} />}
    </div>
  );
}
