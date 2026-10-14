"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tutorAtual } from "@/lib/conta/sessao";
import type { Estado } from "@/lib/painel/estado";
import { createClient } from "@/lib/supabase/server";

/** Liga ou desliga os avisos pelo WhatsApp de uma loja (o mesmo que responder PARAR, mas só para ela). */
export async function definirAvisosWhatsApp(_: Estado, form: FormData): Promise<Estado> {
  if (!(await tutorAtual())) return { ok: false, mensagem: "Entre na sua conta." };
  const lojaId = z.guid().parse(form.get("loja_id"));
  const ligado = form.get("ligado") === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_avisos_whatsapp", { p_petshop_id: lojaId, p_ligado: ligado });
  if (error) return { ok: false, mensagem: "Não foi possível mudar os avisos. Tente de novo." };
  revalidatePath("/conta/lojas");
  return { ok: true, mensagem: ligado ? "Avisos pelo WhatsApp ligados." : "Avisos pelo WhatsApp desligados." };
}
