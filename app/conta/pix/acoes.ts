"use server";

import { z } from "zod";
import { ErroPagamento, type Pix, qrDoPagamento, simularPagamento } from "@/lib/pagamentos/servico";
import { createClient } from "@/lib/supabase/server";

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

/** O pagamento só existe para quem o enxerga pelo RLS (o tutor dono dele). */
async function meuPagamento(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("pagamento").select("id").eq("id", z.guid().parse(id)).maybeSingle();
  if (!data) throw new ErroPagamento("Pagamento não encontrado.");
  return data.id;
}

async function executar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, dados: await fn() };
  } catch (e) {
    if (e instanceof ErroPagamento) return { ok: false, erro: e.message };
    console.error(e);
    return { ok: false, erro: "Não foi possível falar com o banco do Pix. Tente de novo." };
  }
}

/** QR Code (criado na primeira vez) e situação do Pix, para a tela de pagamento consultar enquanto espera. */
export async function consultarPix(id: string) {
  return executar<Pix>(async () => qrDoPagamento(await meuPagamento(id)));
}

/** Só em ambiente de teste: faz de conta que o Pix caiu. */
export async function simularPix(id: string) {
  return executar(async () => {
    await simularPagamento(await meuPagamento(id));
    return qrDoPagamento(id);
  });
}
