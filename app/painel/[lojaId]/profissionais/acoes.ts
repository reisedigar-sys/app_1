"use server";

import { z } from "zod";
import { SEM_PERMISSAO, checkbox, iniciarAcao, opcional, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, dadosDoForm, errosDeValidacao } from "@/lib/painel/estado";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  bio: opcional(z.string().trim().max(500, "No máximo 500 caracteres.")),
  ordem: z.coerce.number().int().min(0).max(999).default(0),
  foto_url: opcional(z.url("Foto inválida.")),
});

export async function criarProfissional(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = schema.safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const { error } = await supabase.from("profissional").insert({ ...dados.data, petshop_id: lojaId });
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  revalidarLoja(lojaId);
  return { ok: true, mensagem: `${dados.data.nome} cadastrado(a). Agora defina os horários e os serviços que faz.` };
}

export async function salvarProfissional(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = schema.extend({ id: z.guid(), ativo: checkbox }).safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const { id, ...campos } = dados.data;
  const { data, error } = await supabase.from("profissional").update(campos).eq("id", id).eq("petshop_id", lojaId).select("id");
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  if (!data?.length) return SEM_PERMISSAO;
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Salvo." };
}
