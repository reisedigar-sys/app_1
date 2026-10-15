import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Carregando } from "@/components/ui";
import { FormularioEsqueci } from "../formularios";

export const metadata: Metadata = { title: "Esqueci a senha" };

export default function EsqueciPage({ searchParams }: PageProps<"/senha/esqueci">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Esqueci a senha</h1>
        <p className="text-sm text-neutral-500">Informe o e-mail da sua conta. Enviamos um link para você criar uma senha nova.</p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const para = (await searchParams).para === "equipe" ? "equipe" : "tutor";
  return (
    <>
      <FormularioEsqueci para={para} />
      <Link href={para === "equipe" ? "/entrar" : "/conta/entrar"} className="text-center text-sm text-marca-700 underline dark:text-marca-400">
        Voltar para o login
      </Link>
    </>
  );
}
