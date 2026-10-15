import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso, Carregando } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { FormularioNovaSenha } from "../formularios";

export const metadata: Metadata = { title: "Nova senha" };

export default function NovaSenhaPage({ searchParams }: PageProps<"/senha/nova">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Crie sua nova senha</h1>
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const para = sp.para === "equipe" ? "equipe" : "tutor";
  // O link do e-mail abre uma sessão (em /auth/confirmar); sem ela, o link expirou ou já foi usado.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub || sp.erro)
    return (
      <>
        <Aviso tipo="erro">Esse link expirou ou já foi usado. Peça um novo.</Aviso>
        <Link href={`/senha/esqueci?para=${para}`} className="text-center text-sm text-marca-700 underline dark:text-marca-400">
          Pedir um novo link
        </Link>
      </>
    );
  return (
    <>
      <p className="-mt-4 text-sm text-neutral-500">Conta: {String(data.claims.email ?? "")}</p>
      <FormularioNovaSenha para={para} />
    </>
  );
}
