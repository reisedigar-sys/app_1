"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirTutor } from "@/lib/conta/sessao";
import { caminhoSeguro } from "@/lib/conta/voltar";
import { checkbox, opcional } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, dadosDoForm, errosDeValidacao } from "@/lib/painel/estado";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do pet."),
  especie: z.enum(["cao", "gato"]),
  raca: opcional(z.string().trim().max(80)),
  porte: z.enum(["mini", "pequeno", "medio", "grande", "gigante"], "Escolha o porte."),
  pelagem: z.enum(["curta", "media", "longa"], "Escolha a pelagem."),
  nascimento: opcional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")),
  alergias: opcional(z.string().trim().max(300)),
  temperamento: opcional(z.string().trim().max(300)),
  vacinas: opcional(z.string().trim().max(300)),
  foto_url: opcional(z.url()),
});

export async function salvarPet(_: Estado, form: FormData): Promise<Estado> {
  const tutor = await exigirTutor("/conta/pets");
  const dados = schema.extend({ id: opcional(z.guid()) }).safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const { id, ...pet } = dados.data;
  const supabase = await createClient();
  const r = id
    ? await supabase.from("pet").update(pet).eq("id", id).select("id")
    : await supabase.from("pet").insert({ ...pet, tutor_id: tutor.id }).select("id");
  if (r.error) return { ok: false, mensagem: mensagemDeErro(r.error) };
  if (!r.data?.length) return { ok: false, mensagem: "Pet não encontrado." };
  revalidatePath("/conta/pets");
  redirect(caminhoSeguro(form.get("voltar"), "/conta/pets"));
}

export async function removerPet(form: FormData) {
  await exigirTutor("/conta/pets");
  const dados = z.object({ id: z.guid(), confirmar: checkbox }).parse(dadosDoForm(form));
  const supabase = await createClient();
  // O histórico de agendamentos continua; o pet só deixa de aparecer para novos agendamentos.
  await supabase.from("pet").update({ ativo: false }).eq("id", dados.id);
  revalidatePath("/conta/pets");
  redirect("/conta/pets");
}
