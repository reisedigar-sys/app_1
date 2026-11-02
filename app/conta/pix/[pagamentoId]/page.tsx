import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Carregando, Titulo } from "@/components/ui";
import { exigirTutor } from "@/lib/conta/sessao";
import { ErroPagamento, qrDoPagamento } from "@/lib/pagamentos/servico";
import { createClient } from "@/lib/supabase/server";
import { PagarDeNovo } from "./pagar";

export const metadata: Metadata = { title: "Pagar sinal" };

export default function PixPage({ params }: PageProps<"/conta/pix/[pagamentoId]">) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Titulo>Pagar sinal</Titulo>
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ params }: { params: Promise<{ pagamentoId: string }> }) {
  const { pagamentoId } = await params;
  await exigirTutor(`/conta/pix/${pagamentoId}`);
  const supabase = await createClient();
  // Leitura com RLS: só o tutor dono do pagamento chega aqui.
  const { data } = await supabase.from("pagamento").select("id").eq("id", pagamentoId).maybeSingle();
  if (!data) notFound();
  const pix = await qrDoPagamento(data.id).catch((e: unknown) => {
    if (e instanceof ErroPagamento) return e;
    throw e;
  });
  if (pix instanceof ErroPagamento) return <p className="text-sm text-red-600">{pix.message}</p>;
  return <PagarDeNovo inicial={pix} />;
}
