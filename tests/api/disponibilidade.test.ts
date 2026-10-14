import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { ErroAgendamento, criarPedido, diasComVaga, horariosDoDia, profissionaisDisponiveis } from "@/lib/disponibilidade";
import type { Database } from "@/lib/supabase/database.types";
import { proximo } from "../helpers/datas";
import { apagarPedidos } from "../helpers/db";
import { LOJA, PET, PROFISSIONAL, TUTOR } from "../helpers/ids";

// Pela API de verdade (Auth + PostgREST), como o app vai chamar. Grava de fato: limpa no final.
const TER = proximo(2, 21);
const chave = `api-${crypto.randomUUID()}`;

async function clienteAna() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  await sb.auth.signInWithPassword({ email: "ana@tutor.test", password: "senha123" });
  return sb;
}

afterAll(async () => {
  await apagarPedidos([chave]);
});

describe("motor de disponibilidade pela API", () => {
  it("consulta dias, horários e profissionais e cria o pedido", async () => {
    const sb = await clienteAna();
    const { data: banho } = await sb.from("servico").select("id").eq("petshop_id", LOJA.centro).eq("nome", "Banho").single();
    const itens = [{ pet_id: PET.mel, servicos: [banho!.id] }];

    expect(await diasComVaga(sb, LOJA.centro, itens, TER)).toContain(TER);
    const horarios = await horariosDoDia(sb, LOJA.centro, itens, TER);
    const dezHoras = horarios.find((h) => h.hora === "10:00")!;
    expect(dezHoras.profissionais).toHaveLength(3);
    const profs = await profissionaisDisponiveis(sb, LOJA.centro, itens, dezHoras.inicio);
    expect(profs.map((p) => p.nome)).toEqual(["Paula", "Marcos", "Júlia"]);

    const pedido = await criarPedido(sb, {
      lojaId: LOJA.centro,
      tutorId: TUTOR.ana,
      itens,
      inicio: dezHoras.inicio,
      canal: "app_proprio",
      chaveIdempotencia: chave,
      profissionalId: PROFISSIONAL.julia,
    });
    expect(pedido.agendamentos).toHaveLength(1);
    expect(new Date(pedido.retirada_estimada).getTime() - new Date(dezHoras.inicio).getTime()).toBe(45 * 60_000);

    // O horário some para a Júlia; repetir a chave devolve o mesmo pedido.
    const depois = await horariosDoDia(sb, LOJA.centro, itens, TER, PROFISSIONAL.julia);
    expect(depois.map((h) => h.hora)).not.toContain("10:00");
    const repetido = await criarPedido(sb, {
      lojaId: LOJA.centro,
      tutorId: TUTOR.ana,
      itens,
      inicio: dezHoras.inicio,
      canal: "app_proprio",
      chaveIdempotencia: chave,
      profissionalId: PROFISSIONAL.julia,
    });
    expect(repetido.pedido_id).toBe(pedido.pedido_id);

    // Mesmo horário com a mesma profissional e outra chave: erro de domínio traduzido.
    await expect(
      criarPedido(sb, {
        lojaId: LOJA.centro,
        tutorId: TUTOR.ana,
        itens: [{ pet_id: PET.thor, servicos: [banho!.id] }],
        inicio: dezHoras.inicio,
        canal: "app_proprio",
        chaveIdempotencia: `${chave}-2`,
        profissionalId: PROFISSIONAL.julia,
      }),
    ).rejects.toMatchObject({ codigo: "horario_indisponivel" } satisfies Partial<ErroAgendamento>);
  });
});
