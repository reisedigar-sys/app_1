"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { erroDeAgendamento } from "@/lib/disponibilidade";
import type { Estado } from "@/lib/painel/estado";
import { createClient } from "@/lib/supabase/server";

// Link de confirmação: sem login. O token do pedido é a autorização (conferida nas funções do banco).

export async function confirmar(token: string): Promise<Estado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmar_por_token", { p_token: z.guid().parse(token) });
  if (error) return { ok: false, mensagem: erroDeAgendamento(error).detalhe ?? "Não foi possível confirmar." };
  revalidatePath(`/c/${token}`);
  redirect(`/c/${token}?aviso=confirmado`);
}

export async function cancelar(token: string, _: Estado, form: FormData): Promise<Estado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancelar_por_token", {
    p_token: z.guid().parse(token),
    p_agendamento_id: z.guid().parse(form.get("id")),
  });
  if (error) return { ok: false, mensagem: erroDeAgendamento(error).message };
  revalidatePath(`/c/${token}`);
  redirect(`/c/${token}?aviso=${(data as { gratuito: boolean }).gratuito ? "cancelado" : "cancelado-fora-do-prazo"}`);
}

export async function remarcar(token: string, p: { id: string; inicio: string; profissionalId?: string }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remarcar_por_token", {
    p_token: z.guid().parse(token),
    p_agendamento_id: z.guid().parse(p.id),
    p_inicio: z.iso.datetime({ offset: true }).parse(p.inicio),
    p_profissional_id: p.profissionalId ? z.guid().parse(p.profissionalId) : undefined,
  });
  if (error) return { ok: false as const, erro: erroDeAgendamento(error).message };
  revalidatePath(`/c/${token}`);
  return { ok: true as const };
}
