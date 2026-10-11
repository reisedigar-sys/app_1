"use server";

import { z } from "zod";
import { SEM_PERMISSAO, iniciarAcao, opcional, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, dadosDoForm, errosDeValidacao } from "@/lib/painel/estado";
import { exigirUsuario } from "@/lib/painel/sessao";

const schema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.")),
    papel: z.enum(["dono", "gerente", "atendente", "profissional"], "Escolha o papel."),
    profissional_id: opcional(z.guid()),
  })
  .refine((d) => d.papel !== "profissional" || d.profissional_id, {
    path: ["profissional_id"],
    message: "Escolha qual profissional é essa pessoa.",
  });

export async function adicionarMembro(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = schema.safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const { error } = await supabase.rpc("adicionar_membro", {
    p_petshop_id: lojaId,
    p_email: dados.data.email,
    p_papel: dados.data.papel,
    p_profissional_id: dados.data.papel === "profissional" ? (dados.data.profissional_id ?? undefined) : undefined,
  });
  if (error) return { ok: false, mensagem: mensagemDeErro(error), erros: error.code === "P0002" ? { email: "Conta não encontrada." } : undefined };
  revalidarLoja(lojaId);
  return { ok: true, mensagem: `${dados.data.email} agora faz parte da equipe.` };
}

export async function removerMembro(form: FormData) {
  const { supabase, lojaId } = await iniciarAcao(form);
  const userId = z.guid().parse(form.get("user_id"));
  const eu = await exigirUsuario();
  if (userId === eu.id) throw new Error("Você não pode remover a si mesmo.");
  const { data } = await supabase.from("petshop_membro").delete().eq("petshop_id", lojaId).eq("user_id", userId).select("user_id");
  if (!data?.length) throw new Error(SEM_PERMISSAO.mensagem);
  revalidarLoja(lojaId);
}
