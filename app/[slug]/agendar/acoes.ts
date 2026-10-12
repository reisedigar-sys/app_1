"use server";

import { z } from "zod";
import {
  ErroAgendamento,
  type ItemPedido,
  criarPedido,
  diasComVaga,
  horariosDoDia,
  profissionaisAptos,
  profissionaisDisponiveis,
  unidadesParaPedido,
} from "@/lib/disponibilidade";
import { tutorAtual } from "@/lib/conta/sessao";
import { createClient } from "@/lib/supabase/server";

// Cada ação devolve { ok, dados } ou { ok: false, erro } para a tela mostrar a mensagem sem quebrar o fluxo.
type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string; codigo?: string };

const id = z.guid();
const itensSchema = z
  .array(
    z.union([
      z.object({ pet_id: id, servicos: z.array(id).min(1) }),
      z.object({ porte: z.string(), pelagem: z.string(), servicos: z.array(id).min(1) }),
    ]),
  )
  .min(1)
  .max(10);

async function executar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, dados: await fn() };
  } catch (e) {
    if (e instanceof ErroAgendamento) return { ok: false, erro: e.message, codigo: e.codigo };
    if (e instanceof z.ZodError) return { ok: false, erro: "Dados inválidos." };
    console.error(e);
    return { ok: false, erro: "Não foi possível carregar. Tente de novo." };
  }
}

export async function buscarUnidades(lojaId: string, itens: ItemPedido[], local?: { lat: number; lng: number }) {
  return executar(async () => {
    const coords = local ? z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(local) : undefined;
    return unidadesParaPedido(await createClient(), id.parse(lojaId), itensSchema.parse(itens) as ItemPedido[], coords);
  });
}

/** CEP → coordenadas (BrasilAPI). Sem coordenadas, a lista de unidades aparece sem ordenar por distância. */
export async function localizarCep(cep: string): Promise<Resultado<{ lat: number; lng: number } | null>> {
  const digitos = cep.replace(/\D/g, "");
  if (digitos.length !== 8) return { ok: false, erro: "CEP com 8 dígitos." };
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${digitos}`, { signal: AbortSignal.timeout(4000) });
    if (r.status === 404) return { ok: false, erro: "CEP não encontrado." };
    if (!r.ok) return { ok: true, dados: null };
    const json = (await r.json()) as { location?: { coordinates?: { latitude?: string; longitude?: string } } };
    const lat = Number(json.location?.coordinates?.latitude);
    const lng = Number(json.location?.coordinates?.longitude);
    return { ok: true, dados: Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null };
  } catch {
    return { ok: true, dados: null };
  }
}

export async function buscarDias(lojaId: string, itens: ItemPedido[], mes: string, profissionalId?: string) {
  return executar(async () =>
    diasComVaga(await createClient(), id.parse(lojaId), itensSchema.parse(itens) as ItemPedido[], z.iso.date().parse(mes), profissionalId ? id.parse(profissionalId) : undefined),
  );
}

export async function buscarHorarios(lojaId: string, itens: ItemPedido[], data: string, profissionalId?: string) {
  return executar(async () =>
    horariosDoDia(await createClient(), id.parse(lojaId), itensSchema.parse(itens) as ItemPedido[], z.iso.date().parse(data), profissionalId ? id.parse(profissionalId) : undefined),
  );
}

export async function buscarProfissionaisDisponiveis(lojaId: string, itens: ItemPedido[], inicio: string) {
  return executar(async () =>
    profissionaisDisponiveis(await createClient(), id.parse(lojaId), itensSchema.parse(itens) as ItemPedido[], z.iso.datetime({ offset: true }).parse(inicio)),
  );
}

export async function buscarProfissionaisAptos(lojaId: string, itens: ItemPedido[]) {
  return executar(async () => profissionaisAptos(await createClient(), id.parse(lojaId), itensSchema.parse(itens) as ItemPedido[]));
}

export async function confirmarPedido(p: {
  lojaId: string;
  itens: ItemPedido[];
  inicio: string;
  profissionalId?: string;
  chave: string;
  observacoes?: string;
  consentimentoContato: boolean;
}) {
  return executar(async () => {
    const tutor = await tutorAtual();
    if (!tutor) throw new ErroAgendamento("sem_permissao");
    const supabase = await createClient();
    const lojaId = id.parse(p.lojaId);
    const resumo = await criarPedido(supabase, {
      lojaId,
      tutorId: tutor.id,
      itens: itensSchema.parse(p.itens) as ItemPedido[],
      inicio: z.iso.datetime({ offset: true }).parse(p.inicio),
      canal: "app_proprio",
      chaveIdempotencia: z.string().min(8).max(100).parse(p.chave),
      profissionalId: p.profissionalId ? id.parse(p.profissionalId) : undefined,
      observacoes: p.observacoes?.slice(0, 1000),
    });
    // Só registra quando o tutor marca a opção: desmarcar aqui não apaga uma autorização dada antes.
    if (p.consentimentoContato) await supabase.rpc("registrar_consentimento", { p_petshop_id: lojaId, p_contato: true, p_marketing: false });
    return resumo;
  });
}
