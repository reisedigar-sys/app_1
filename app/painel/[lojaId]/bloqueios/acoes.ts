"use server";

import { z } from "zod";
import { SEM_PERMISSAO, checkbox, iniciarAcao, opcional, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, dadosDoForm, errosDeValidacao } from "@/lib/painel/estado";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const hora = opcional(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida."));

const schema = z
  .object({
    profissional_id: opcional(z.guid()),
    tipo: z.enum(["folga", "almoco", "feriado", "outro"]),
    dia_inteiro: checkbox,
    data_inicio: data,
    hora_inicio: hora,
    data_fim: data,
    hora_fim: hora,
    motivo: opcional(z.string().trim().max(200)),
  })
  .superRefine((d, ctx) => {
    if (!d.dia_inteiro) {
      if (!d.hora_inicio) ctx.addIssue({ code: "custom", path: ["hora_inicio"], message: "Informe a hora." });
      if (!d.hora_fim) ctx.addIssue({ code: "custom", path: ["hora_fim"], message: "Informe a hora." });
    }
  });

function somarDia(dataIso: string) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function criarBloqueio(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = schema.safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const d = dados.data;

  // Horário local da loja; a conversão para UTC é feita no banco com o fuso da loja.
  const inicio = d.dia_inteiro ? `${d.data_inicio} 00:00` : `${d.data_inicio} ${d.hora_inicio}`;
  const fim = d.dia_inteiro ? `${somarDia(d.data_fim)} 00:00` : `${d.data_fim} ${d.hora_fim}`;
  if (fim <= inicio) return { ok: false, mensagem: "O fim precisa ser depois do início.", erros: { data_fim: "Depois do início." } };

  const { error } = await supabase.rpc("criar_bloqueio", {
    p_petshop_id: lojaId,
    p_inicio: inicio,
    p_fim: fim,
    p_tipo: d.tipo,
    p_profissional_id: d.profissional_id ?? undefined,
    p_motivo: d.motivo ?? undefined,
  });
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Bloqueio criado." };
}

export async function removerBloqueio(form: FormData) {
  const { supabase, lojaId } = await iniciarAcao(form);
  const id = z.guid().parse(form.get("id"));
  const { data } = await supabase.from("bloqueio").delete().eq("id", id).eq("petshop_id", lojaId).select("id");
  if (!data?.length) throw new Error(SEM_PERMISSAO.mensagem);
  revalidarLoja(lojaId);
}
