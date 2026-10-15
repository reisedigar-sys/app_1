"use server";

import { z } from "zod";
import { SEM_PERMISSAO, checkbox, iniciarAcao, opcional, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, dadosDoForm, errosDeValidacao } from "@/lib/painel/estado";

const servico = z.object({
  nome: z.string().trim().min(2, "Informe o nome do serviço."),
  descricao: opcional(z.string().trim().max(300, "No máximo 300 caracteres.")),
  tipo: z.enum(["principal", "adicional"], "Escolha o tipo."),
  categoria_id: opcional(z.guid()),
  ordem: z.coerce.number().int().min(0).max(999).default(0),
});

export async function criarCategoria(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = z.object({ nome: z.string().trim().min(2, "Informe o nome da categoria.") }).safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const { count } = await supabase.from("categoria_servico").select("id", { count: "exact", head: true }).eq("petshop_id", lojaId);
  const { error } = await supabase.from("categoria_servico").insert({ petshop_id: lojaId, nome: dados.data.nome, ordem: count ?? 0 });
  if (error) return { ok: false, mensagem: mensagemDeErro(error, { duplicado: "Já existe uma categoria com esse nome." }) };
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Categoria criada." };
}

export async function criarServico(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = servico.safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const { data, error } = await supabase.from("servico").insert({ ...dados.data, petshop_id: lojaId }).select("id").single();
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  revalidarLoja(lojaId);
  return {
    ok: true,
    mensagem: `Serviço criado. Agora cadastre os preços e quem faz ${dados.data.nome}.`,
    proximo: { href: `/painel/${lojaId}/precos?servico=${data.id}`, rotulo: `Cadastrar preços de ${dados.data.nome} ›` },
  };
}

export async function salvarServico(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = servico.extend({ id: z.guid(), ativo: checkbox }).safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const { id, ...campos } = dados.data;
  const { data, error } = await supabase.from("servico").update(campos).eq("id", id).eq("petshop_id", lojaId).select("id");
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  if (!data?.length) return SEM_PERMISSAO;
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Salvo." };
}

export async function copiarCatalogo(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = z
    .object({ origem: z.guid("Escolha a unidade de origem."), substituir: checkbox })
    .safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const { data, error } = await supabase.rpc("copiar_catalogo", {
    p_origem: dados.data.origem,
    p_destino: lojaId,
    p_substituir: dados.data.substituir,
  });
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  const r = data as { categorias: number; servicos_novos: number; servicos_atualizados: number; precos: number };
  revalidarLoja(lojaId);
  return {
    ok: true,
    mensagem:
      `Catálogo copiado: ${r.servicos_novos} serviço(s) novo(s), ${r.servicos_atualizados} atualizado(s), ` +
      `${r.precos} preço(s) e ${r.categorias} categoria(s). Agora defina quem faz cada serviço nesta unidade.`,
  };
}
