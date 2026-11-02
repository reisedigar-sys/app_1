"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { tutorAtual } from "@/lib/conta/sessao";
import { erroDeAgendamento } from "@/lib/disponibilidade";
import type { Estado } from "@/lib/painel/estado";
import { createClient } from "@/lib/supabase/server";

export async function cancelar(_: Estado, form: FormData): Promise<Estado> {
  if (!(await tutorAtual())) return { ok: false, mensagem: "Entre na sua conta." };
  const id = z.guid().parse(form.get("id"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancelar_agendamento", { p_agendamento_id: id });
  if (error) return { ok: false, mensagem: erroDeAgendamento(error).message };
  revalidatePath("/conta/agendamentos");
  const gratuito = (data as { gratuito: boolean }).gratuito;
  // Sinal pago: o banco já decidiu se volta ou fica (migração 018).
  const { data: parte } = await supabase.from("pagamento_parte").select("situacao").eq("agendamento_id", id).maybeSingle();
  const aviso =
    parte?.situacao === "devolver" || parte?.situacao === "devolvido"
      ? "cancelado-sinal-devolvido"
      : parte?.situacao === "retido"
        ? "cancelado-sinal-retido"
        : gratuito
          ? "cancelado"
          : "cancelado-fora-do-prazo";
  redirect(`/conta/agendamentos?aviso=${aviso}`);
}

export async function remarcar(p: { id: string; inicio: string; profissionalId?: string }) {
  if (!(await tutorAtual())) return { ok: false as const, erro: "Entre na sua conta." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remarcar_agendamento", {
    p_agendamento_id: z.guid().parse(p.id),
    p_inicio: z.iso.datetime({ offset: true }).parse(p.inicio),
    p_profissional_id: p.profissionalId ? z.guid().parse(p.profissionalId) : undefined,
  });
  if (error) return { ok: false as const, erro: erroDeAgendamento(error).message };
  revalidatePath("/conta/agendamentos");
  return { ok: true as const };
}

export async function sairListaEspera(_: Estado, form: FormData): Promise<Estado> {
  if (!(await tutorAtual())) return { ok: false, mensagem: "Entre na sua conta." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lista_espera")
    .update({ status: "cancelado" })
    .eq("id", z.guid().parse(form.get("id")))
    .in("status", ["aguardando", "notificado"])
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: "Não foi possível sair da lista de espera." };
  revalidatePath("/conta/agendamentos");
  return { ok: true };
}
