import type { Metadata } from "next";
import { Suspense } from "react";
import { Cartao, Carregando } from "@/components/ui";
import { exigirUsuario } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { FormularioNovaLoja } from "./formulario";

export const metadata: Metadata = { title: "Nova loja" };

export default function NovaLojaPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="mb-1 text-xl font-semibold">Cadastrar loja</h1>
      <p className="mb-4 text-sm text-neutral-500">Depois você completa endereço, equipe, serviços e horários.</p>
      <Cartao>
        <Suspense fallback={<Carregando />}>
          <Conteudo />
        </Suspense>
      </Cartao>
    </main>
  );
}

async function Conteudo() {
  const usuario = await exigirUsuario();
  const supabase = await createClient();
  const { data } = await supabase.from("rede_membro").select("rede(id, nome)").eq("user_id", usuario.id);
  const redes = (data ?? []).flatMap((r) => (r.rede ? [r.rede] : []));
  return <FormularioNovaLoja redes={redes} />;
}
