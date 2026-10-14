import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Enums = Database["public"]["Enums"];

export type PedidoDoLink = {
  pedido_id: string;
  confirmado_em: string | null;
  tutor_nome: string;
  loja: { id: string; nome: string; slug: string; telefone: string | null; fuso: string; slot_minutos: number; endereco: string };
  agendamentos: {
    id: string;
    status: Enums["status_agendamento"];
    inicio: string;
    fim: string;
    pet_nome: string;
    porte: Enums["porte"];
    pelagem: Enums["pelagem"];
    profissional_id: string;
    profissional_nome: string;
    servicos: string[];
    servico_ids: string[];
    alteravel: boolean;
    cancelamento_gratuito_ate: string;
  }[];
};

/** Pedido pelo token do link (null se o token não existe). */
export async function pedidoDoLink(token: string): Promise<PedidoDoLink | null> {
  if (!z.guid().safeParse(token).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("pedido_por_token", { p_token: token });
  return (data as PedidoDoLink | null) ?? null;
}
