"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, dadosDoForm, errosDeValidacao } from "@/lib/painel/estado";
import { exigirUsuario } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  rede_id: z.string().optional(),
  rede_nome: z.string().trim().optional(),
  loja_nome: z.string().trim().min(2, "Informe o nome da loja."),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífens (ex.: pet-feliz-centro)."),
});

export async function criarLoja(_: Estado, form: FormData): Promise<Estado> {
  await exigirUsuario();
  const dados = schema.safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const { rede_id, rede_nome, loja_nome, slug } = dados.data;
  const supabase = await createClient();
  const contexto = { duplicado: "Esse endereço (slug) já está em uso por outra loja. Escolha outro." };

  let lojaId: string;
  if (rede_id) {
    // Nova unidade numa rede existente: só o dono da rede (conferido no banco).
    const { data, error } = await supabase.rpc("criar_unidade", { p_rede_id: rede_id, p_nome: loja_nome, p_slug: slug });
    if (error) return { ok: false, mensagem: mensagemDeErro(error, contexto), erros: error.code === "23505" ? { slug: contexto.duplicado } : undefined };
    lojaId = data;
  } else {
    if (!rede_nome || rede_nome.length < 2) return { ok: false, mensagem: "Confira os campos destacados.", erros: { rede_nome: "Informe o nome da rede ou marca." } };
    const { data, error } = await supabase.rpc("criar_rede_e_loja", { p_rede_nome: rede_nome, p_loja_nome: loja_nome, p_slug: slug });
    if (error) return { ok: false, mensagem: mensagemDeErro(error, contexto), erros: error.code === "23505" ? { slug: contexto.duplicado } : undefined };
    lojaId = data;
  }
  redirect(`/painel/${lojaId}/configurar`);
}
