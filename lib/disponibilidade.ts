import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Camada fina sobre as funções SQL do motor (migração 004). A regra de disponibilidade fica toda no banco;
// aqui só há tipos e tradução de erros para o app.

type Cliente = SupabaseClient<Database>;
type Canal = Database["public"]["Enums"]["canal_agendamento"];

/** Um pet do pedido: o primeiro serviço é o principal, os demais são adicionais. */
export type ItemPedido =
  | { pet_id: string; servicos: string[] }
  | { porte: Database["public"]["Enums"]["porte"]; pelagem: Database["public"]["Enums"]["pelagem"]; servicos: string[] };

export type Horario = { inicio: string; hora: string; retiradaEstimada: string; profissionais: string[] };
export type Profissional = { id: string; nome: string; fotoUrl: string | null; bio: string | null; notaMedia: number | null; avaliacoes: number };
export type ProfissionalDisponivel = Profissional & { retiradaEstimada: string };
export type Unidade = {
  id: string;
  nome: string;
  slug: string;
  endereco: string;
  telefone: string | null;
  distanciaKm: number | null;
  /** O pedido traduzido para os serviços desta unidade. */
  itens: ItemPedido[];
  totalCentavos: number;
};
export type ResumoPedido = {
  pedido_id: string;
  total_centavos: number;
  token_confirmacao: string;
  retirada_estimada: string;
  agendamentos: { id: string; pet_id: string; profissional_id: string; inicio: string; fim: string; preco_total_centavos: number }[];
};

export type CodigoErro = "horario_indisponivel" | "pedido_invalido" | "sem_preco" | "fora_do_periodo" | "sem_permissao" | "erro";

const CODIGOS: Record<string, CodigoErro> = {
  AG001: "horario_indisponivel",
  AG002: "pedido_invalido",
  AG003: "sem_preco",
  AG004: "fora_do_periodo",
  "42501": "sem_permissao",
};

const MENSAGENS: Record<CodigoErro, string> = {
  horario_indisponivel: "Esse horário acabou de ficar indisponível. Escolha outro.",
  pedido_invalido: "Não foi possível montar o pedido. Revise os pets e serviços.",
  sem_preco: "A loja não atende esse serviço para o porte e a pelagem do pet.",
  fora_do_periodo: "Esse horário está fora do período de agendamento da loja.",
  sem_permissao: "Você não tem permissão para fazer esse agendamento.",
  erro: "Não foi possível concluir. Tente de novo.",
};

export class ErroAgendamento extends Error {
  constructor(
    readonly codigo: CodigoErro,
    readonly detalhe?: string,
  ) {
    super(MENSAGENS[codigo]);
    this.name = "ErroAgendamento";
  }
}

/** Converte o erro do PostgREST no erro de domínio (o detalhe em português vem do banco). */
export function erroDeAgendamento(erro: { code?: string; message?: string }): ErroAgendamento {
  return new ErroAgendamento(CODIGOS[erro.code ?? ""] ?? "erro", erro.message);
}

function ou<T>(r: { data: T | null; error: { code?: string; message?: string } | null }): T {
  if (r.error) throw erroDeAgendamento(r.error);
  return r.data as T;
}

/** Dias do mês (yyyy-mm-dd, qualquer dia do mês) com ao menos um horário. */
export async function diasComVaga(sb: Cliente, lojaId: string, itens: ItemPedido[], mes: string, profissionalId?: string) {
  const dados = ou(await sb.rpc("dias_com_vaga", { p_petshop_id: lojaId, p_itens: itens, p_mes: mes, p_profissional_id: profissionalId }));
  return dados.map((d) => d.dia);
}

/** Horários do dia na grade da loja; sem profissional = "qualquer profissional". */
export async function horariosDoDia(sb: Cliente, lojaId: string, itens: ItemPedido[], data: string, profissionalId?: string): Promise<Horario[]> {
  const dados = ou(await sb.rpc("horarios_do_dia", { p_petshop_id: lojaId, p_itens: itens, p_data: data, p_profissional_id: profissionalId }));
  return dados.map((h) => ({ inicio: h.inicio, hora: h.hora, retiradaEstimada: h.retirada_estimada, profissionais: h.profissionais }));
}

/** Quem pode atender num horário (com a retirada estimada de cada um). */
export async function profissionaisDisponiveis(sb: Cliente, lojaId: string, itens: ItemPedido[], inicio: string): Promise<ProfissionalDisponivel[]> {
  const dados = ou(await sb.rpc("profissionais_disponiveis", { p_petshop_id: lojaId, p_itens: itens, p_inicio: inicio }));
  return dados.map((p) => ({ ...profissional(p), retiradaEstimada: p.retirada_estimada }));
}

function profissional(p: { profissional_id: string; nome: string; foto_url: string | null; bio: string | null; nota_media: number | null; avaliacoes: number }): Profissional {
  return {
    id: p.profissional_id,
    nome: p.nome,
    fotoUrl: p.foto_url,
    bio: p.bio,
    notaMedia: p.nota_media === null ? null : Number(p.nota_media),
    avaliacoes: p.avaliacoes,
  };
}

/** Caminho "Profissional": todos os profissionais aptos para o pedido, com avaliação. */
export async function profissionaisAptos(sb: Cliente, lojaId: string, itens: ItemPedido[]): Promise<Profissional[]> {
  const dados = ou(await sb.rpc("profissionais_aptos", { p_petshop_id: lojaId, p_itens: itens }));
  return dados.map(profissional);
}

/** Unidades da mesma rede que atendem o pedido, com o preço de cada uma e a distância (se houver localização). */
export async function unidadesParaPedido(sb: Cliente, lojaId: string, itens: ItemPedido[], local?: { lat: number; lng: number }): Promise<Unidade[]> {
  const dados = ou(
    await sb.rpc("unidades_para_pedido", { p_petshop_id: lojaId, p_itens: itens, p_lat: local?.lat, p_lng: local?.lng }),
  );
  return dados.map((u) => ({
    id: u.petshop_id,
    nome: u.nome,
    slug: u.slug,
    endereco: u.endereco,
    telefone: u.telefone,
    distanciaKm: u.distancia_km === null ? null : Number(u.distancia_km),
    itens: u.itens as unknown as ItemPedido[],
    totalCentavos: u.total_centavos,
  }));
}

/** Cria o pedido (um agendamento por pet, em sequência). A mesma chave de idempotência nunca duplica. */
export async function criarPedido(
  sb: Cliente,
  p: {
    lojaId: string;
    tutorId: string;
    itens: ItemPedido[];
    inicio: string;
    canal: Canal;
    chaveIdempotencia: string;
    profissionalId?: string;
    observacoes?: string;
    encaixe?: boolean;
  },
): Promise<ResumoPedido> {
  const dados = ou(
    await sb.rpc("criar_pedido", {
      p_petshop_id: p.lojaId,
      p_tutor_id: p.tutorId,
      p_itens: p.itens,
      p_inicio: p.inicio,
      p_canal: p.canal,
      p_chave_idempotencia: p.chaveIdempotencia,
      p_profissional_id: p.profissionalId,
      p_observacoes: p.observacoes,
      p_encaixe: p.encaixe,
    }),
  );
  return dados as unknown as ResumoPedido;
}
