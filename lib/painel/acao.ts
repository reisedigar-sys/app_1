import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirUsuario } from "./sessao";

/** Início de toda Server Action do painel: exige login e lê a loja do formulário. O RLS faz a autorização. */
export async function iniciarAcao(form: FormData) {
  await exigirUsuario();
  const lojaId = z.guid().parse(form.get("loja_id"));
  const supabase = await createClient();
  return { supabase, lojaId };
}

export function revalidarLoja(lojaId: string) {
  revalidatePath(`/painel/${lojaId}`, "layout");
}

export const SEM_PERMISSAO = { ok: false, mensagem: "Você não tem permissão para fazer isso nesta loja." } as const;

/** Campo de formulário opcional: ausente ou "" vira null. */
export const opcional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v), schema.nullable());

export const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
