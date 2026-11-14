import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Situação de uma loja agora, calculada no banco (`situacao_lojas`). */
export type Situacao = { aberto: boolean; fechaEm: string | null; abreEm: string | null };

/** Situação de várias lojas; loja sem horário cadastrado fica fora do mapa (a tela não mostra selo). */
export async function situacaoDasLojas(sb: SupabaseClient<Database>, lojas: string[]): Promise<Map<string, Situacao>> {
  if (lojas.length === 0) return new Map();
  const { data } = await sb.rpc("situacao_lojas", { p_lojas: lojas });
  // Sem resposta do banco, nada de selo: melhor não mostrar do que mostrar "fechado" errado.
  return new Map(
    (data ?? []).map((s) => [s.petshop_id, { aberto: s.aberto, fechaEm: s.fecha_em ?? null, abreEm: s.abre_em ?? null }]),
  );
}

const DIA_CURTO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function partes(iso: string, fuso: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** "Aberto agora · fecha às 18:00", "Fechado · abre amanhã às 09:00", "Fechado · abre terça às 09:00". */
export function textoSituacao(s: Situacao, fuso: string, agora: Date = new Date()): { titulo: string; detalhe: string | null } {
  const hoje = partes(agora.toISOString(), fuso).dia;
  if (s.aberto) {
    if (!s.fechaEm) return { titulo: "Aberto agora", detalhe: null };
    const f = partes(s.fechaEm, fuso);
    return { titulo: "Aberto agora", detalhe: f.dia === hoje ? `fecha às ${f.hora}` : null };
  }
  if (!s.abreEm) return { titulo: "Fechado", detalhe: null };
  const a = partes(s.abreEm, fuso);
  const n = diasEntre(hoje, a.dia);
  const quando = n === 0 ? "hoje" : n === 1 ? "amanhã" : DIA_CURTO[new Date(`${a.dia}T12:00:00Z`).getUTCDay()];
  return { titulo: "Fechado", detalhe: `abre ${quando} às ${a.hora}` };
}

/** Faixas da semana para mostrar ao tutor: segunda primeiro, "Fechado" nos dias sem faixa. */
export function semana(faixas: { dia_semana: number; abre: string; fecha: string }[]) {
  return [1, 2, 3, 4, 5, 6, 0].map((dia) => ({
    dia,
    faixas: faixas
      .filter((f) => f.dia_semana === dia)
      .sort((x, y) => x.abre.localeCompare(y.abre))
      .map((f) => `${f.abre.slice(0, 5)}–${f.fecha.slice(0, 5)}`),
  }));
}

/** Dia da semana (0 = domingo) agora, no fuso da loja. */
export function diaDaSemana(fuso: string, agora: Date = new Date()) {
  return new Date(`${partes(agora.toISOString(), fuso).dia}T12:00:00Z`).getUTCDay();
}
