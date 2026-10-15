"use server";

import { z } from "zod";
import { SEM_PERMISSAO, iniciarAcao, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import type { Estado } from "@/lib/painel/estado";

/** Faltas a cada 100 atendimentos antes do Hora do Pet (referência da estimativa). O RLS só deixa dono e gerência. */
export async function salvarFaltasAntes(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const r = z.coerce
    .number({ error: "Informe um número de 0 a 100." })
    .min(0, "Informe um número de 0 a 100.")
    .max(100, "Informe um número de 0 a 100.")
    .safeParse(String(form.get("faltas_antes_pct") ?? "").replace(",", ".").trim() || undefined);
  if (!r.success) return { ok: false, mensagem: r.error.issues[0].message, erros: { faltas_antes_pct: r.error.issues[0].message } };
  const { data, error } = await supabase
    .from("petshop_indicador")
    .upsert({ petshop_id: lojaId, faltas_antes_pct: Math.round(r.data * 10) / 10, atualizado_em: new Date().toISOString() })
    .select("petshop_id");
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  if (!data.length) return SEM_PERMISSAO;
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Referência salva." };
}
