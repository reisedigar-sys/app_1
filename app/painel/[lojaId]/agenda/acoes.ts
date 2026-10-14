"use server";

import { z } from "zod";
import { ErroAgendamento, type ItemPedido, criarPedido, erroDeAgendamento } from "@/lib/disponibilidade";
import { SEM_PERMISSAO, iniciarAcao, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import type { Estado } from "@/lib/painel/estado";
import { telefoneParaE164 } from "@/lib/painel/formatos";
import { exigirUsuario } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";

const id = z.guid();
const STATUS = ["agendado", "confirmado", "em_atendimento", "pronto", "concluido", "faltou"] as const;

/** Botões de status da ficha do atendimento (o banco confere a transição e o papel). */
export async function mudarStatus(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const agendamento = id.parse(form.get("id"));
  const status = z.enum(STATUS).parse(form.get("status"));
  const { data, error } = await supabase
    .from("agendamento")
    .update({ status })
    .eq("id", agendamento)
    .eq("petshop_id", lojaId)
    .select("id");
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  if (!data.length) return SEM_PERMISSAO;
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Status atualizado." };
}

export async function cancelarNoPainel(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const { data, error } = await supabase.rpc("cancelar_agendamento", { p_agendamento_id: id.parse(form.get("id")) });
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  revalidarLoja(lojaId);
  const gratuito = (data as { gratuito: boolean }).gratuito;
  return { ok: true, mensagem: gratuito ? "Atendimento cancelado." : "Atendimento cancelado fora do prazo de cancelamento gratuito." };
}

export async function salvarObservacoesAtendimento(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const observacoes = z.string().trim().max(1000).parse(form.get("observacoes") ?? "");
  const { data, error } = await supabase
    .from("agendamento")
    .update({ observacoes: observacoes || null })
    .eq("id", id.parse(form.get("id")))
    .eq("petshop_id", lojaId)
    .select("id");
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  if (!data.length) return SEM_PERMISSAO;
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Observações salvas." };
}

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

/** Remarca pelo motor de disponibilidade; sem profissional, mantém o atual se estiver livre. */
export async function remarcarNoPainel(p: { lojaId: string; id: string; inicio: string; profissionalId?: string }): Promise<Resultado<null>> {
  await exigirUsuario();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remarcar_agendamento", {
    p_agendamento_id: id.parse(p.id),
    p_inicio: z.iso.datetime({ offset: true }).parse(p.inicio),
    p_profissional_id: p.profissionalId ? id.parse(p.profissionalId) : undefined,
  });
  if (error) return { ok: false, erro: erroDeAgendamento(error).detalhe ?? erroDeAgendamento(error).message };
  revalidarLoja(id.parse(p.lojaId));
  return { ok: true, dados: null };
}

// ---------------------------------------------------------------------------
// Novo atendimento (balcão, telefone, WhatsApp)
// ---------------------------------------------------------------------------

export type TutorBalcao = {
  id: string;
  nome: string;
  telefone: string;
  temConta: boolean;
  faltas: number;
  exigeSinal: boolean;
  pets: PetBalcao[];
};
export type PetBalcao = { id: string; nome: string; porte: string; pelagem: string; raca: string | null };

const telefone = z.string().transform((t, ctx) => {
  const e164 = telefoneParaE164(t);
  if (!e164) {
    ctx.addIssue({ code: "custom", message: "Telefone com DDD, ex.: (11) 98888-7777." });
    return z.NEVER;
  }
  return e164;
});

function falha(e: unknown): { ok: false; erro: string } {
  if (e instanceof z.ZodError) return { ok: false, erro: e.issues[0]?.message ?? "Dados inválidos." };
  if (e instanceof ErroAgendamento) return { ok: false, erro: e.detalhe ?? e.message };
  console.error(e);
  return { ok: false, erro: "Não foi possível concluir. Tente de novo." };
}

/** Clientes desta loja com o telefone informado (pode haver um com conta e um cadastrado pela loja). */
export async function buscarTutor(lojaId: string, tel: string): Promise<Resultado<{ telefone: string; tutores: TutorBalcao[] }>> {
  try {
    await exigirUsuario();
    const e164 = telefone.parse(tel);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("buscar_tutor_balcao", { p_petshop_id: id.parse(lojaId), p_telefone: e164 });
    if (error) return { ok: false, erro: mensagemDeErro(error) };
    return {
      ok: true,
      dados: {
        telefone: e164,
        tutores: data.map((t) => ({
          id: t.tutor_id,
          nome: t.nome,
          telefone: t.telefone,
          temConta: t.tem_conta,
          faltas: t.faltas,
          exigeSinal: t.exige_sinal,
          pets: t.pets as unknown as PetBalcao[],
        })),
      },
    };
  } catch (e) {
    return falha(e);
  }
}

export async function cadastrarTutor(p: { lojaId: string; nome: string; telefone: string; consentimento: boolean }): Promise<Resultado<TutorBalcao>> {
  try {
    await exigirUsuario();
    const nome = z.string().trim().min(2, "Informe o nome do tutor.").max(120).parse(p.nome);
    const e164 = telefone.parse(p.telefone);
    const supabase = await createClient();
    const lojaId = id.parse(p.lojaId);
    const { data: tutorId, error } = await supabase.rpc("cadastrar_tutor_balcao", {
      p_petshop_id: lojaId,
      p_nome: nome,
      p_telefone: e164,
      p_consentimento_contato: p.consentimento,
    });
    if (error) return { ok: false, erro: mensagemDeErro(error) };
    // Lê de volta: o cadastro pode já existir (feito por outra loja) e trazer pets.
    const { data: lista } = await supabase.rpc("buscar_tutor_balcao", { p_petshop_id: lojaId, p_telefone: e164 });
    const t = lista?.find((x) => x.tutor_id === tutorId);
    if (!t) return { ok: false, erro: "Não foi possível cadastrar o tutor." };
    return {
      ok: true,
      dados: { id: t.tutor_id, nome: t.nome, telefone: t.telefone, temConta: t.tem_conta, faltas: t.faltas, exigeSinal: t.exige_sinal, pets: t.pets as unknown as PetBalcao[] },
    };
  } catch (e) {
    return falha(e);
  }
}

const petSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do pet.").max(60),
  porte: z.enum(["mini", "pequeno", "medio", "grande", "gigante"]),
  pelagem: z.enum(["curta", "media", "longa"]),
  especie: z.enum(["cao", "gato"]),
  raca: z.string().trim().max(60).optional(),
});

export async function cadastrarPet(p: { lojaId: string; tutorId: string; pet: z.input<typeof petSchema> }): Promise<Resultado<PetBalcao>> {
  try {
    await exigirUsuario();
    const pet = petSchema.parse(p.pet);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cadastrar_pet_balcao", {
      p_petshop_id: id.parse(p.lojaId),
      p_tutor_id: id.parse(p.tutorId),
      p_nome: pet.nome,
      p_porte: pet.porte,
      p_pelagem: pet.pelagem,
      p_especie: pet.especie,
      p_raca: pet.raca || undefined,
    });
    if (error) return { ok: false, erro: mensagemDeErro(error) };
    return { ok: true, dados: { id: data, nome: pet.nome, porte: pet.porte, pelagem: pet.pelagem, raca: pet.raca || null } };
  } catch (e) {
    return falha(e);
  }
}

const itensSchema = z.array(z.object({ pet_id: id, servicos: z.array(id).min(1) })).min(1).max(10);

/**
 * Cria o atendimento pela mesma `criar_pedido` do app. Encaixe: horário livre (no fuso da loja) com um profissional
 * escolhido, fora da grade, mas nunca sobreposto a outro atendimento dele (a constraint do banco garante).
 */
export async function agendarNoPainel(p: {
  lojaId: string;
  tutorId: string;
  itens: ItemPedido[];
  canal: "balcao" | "whatsapp";
  chave: string;
  observacoes?: string;
  profissionalId?: string;
  inicio?: string;
  encaixe?: { data: string; hora: string };
}): Promise<Resultado<{ data: string }>> {
  try {
    await exigirUsuario();
    const supabase = await createClient();
    const lojaId = id.parse(p.lojaId);
    let inicio: string;
    if (p.encaixe) {
      const data = z.iso.date().parse(p.encaixe.data);
      const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida.").parse(p.encaixe.hora);
      if (!p.profissionalId) return { ok: false, erro: "Escolha o profissional do encaixe." };
      const { data: utc, error } = await supabase.rpc("horario_da_loja", { p_petshop_id: lojaId, p_local: `${data} ${hora}` });
      if (error || !utc) return { ok: false, erro: "Loja não encontrada." };
      inicio = utc;
    } else {
      inicio = z.iso.datetime({ offset: true }).parse(p.inicio);
    }
    await criarPedido(supabase, {
      lojaId,
      tutorId: id.parse(p.tutorId),
      itens: itensSchema.parse(p.itens),
      inicio,
      canal: z.enum(["balcao", "whatsapp"]).parse(p.canal),
      chaveIdempotencia: z.string().min(8).max(100).parse(p.chave),
      profissionalId: p.profissionalId ? id.parse(p.profissionalId) : undefined,
      observacoes: p.observacoes?.slice(0, 1000),
      encaixe: Boolean(p.encaixe),
    });
    revalidarLoja(lojaId);
    const { data: loja } = await supabase.from("petshop").select("fuso").eq("id", lojaId).single();
    return { ok: true, dados: { data: new Intl.DateTimeFormat("en-CA", { timeZone: loja?.fuso ?? "America/Sao_Paulo" }).format(new Date(inicio)) } };
  } catch (e) {
    return falha(e);
  }
}
