import { describe, expect, it } from "vitest";
import { type Db, emTransacao, usuario } from "../helpers/db";
import { HOJE, somarDias } from "../helpers/datas";
import { LOJA, PROFISSIONAL, USUARIO } from "../helpers/ids";

const gabriel = usuario(USUARIO.gabrielGerenteCentro);
const alice = usuario(USUARIO.aliceAtendenteCentro);
const diego = usuario(USUARIO.diegoDonoMoema);

// Um mês sem dados do seed nem de outros testes: daqui a ~5 meses, primeira terça (todos trabalham de terça a sábado).
const MES = `${somarDias(HOJE, 150).slice(0, 7)}-01`;
const TERCA = (() => {
  let d = MES;
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 2) d = somarDias(d, 1);
  return d;
})();

type Resultados = {
  mes: string;
  agendados: number;
  concluidos: number;
  faltas: number;
  cancelados: number;
  pedidos: number;
  pedidos_confirmados: number;
  faturado_centavos: number;
  previsto_centavos: number;
  clientes_atendidos: number;
  por_canal: Record<string, number>;
  faltas_antes_pct: number | null;
  ocupacao: { profissional_id: string; minutos_disponiveis: number; minutos_ocupados: number }[];
};

async function resultados(db: Db, mes = MES) {
  const [{ r }] = await db.rows<{ r: Resultados }>("select public.resultados_do_mes($1, $2::date) as r", [LOJA.centro, mes]);
  return r;
}

/** Um atendimento de balcão (encaixe) às `hora` da terça, com um cliente novo. */
async function atendimento(db: Db, n: number, hora: string, canal = "balcao") {
  const [{ tutor }] = await db.rows<{ tutor: string }>("select public.cadastrar_tutor_balcao($1, $2, $3, true) as tutor", [
    LOJA.centro,
    `Resultado ${n}`,
    `+55119666600${String(n).padStart(2, "0")}`,
  ]);
  const [{ pet }] = await db.rows<{ pet: string }>("select public.cadastrar_pet_balcao($1, $2, $3, 'pequeno', 'curta') as pet", [LOJA.centro, tutor, `Pet ${n}`]);
  const [{ id: servico }] = await db.rows<{ id: string }>("select id from public.servico where petshop_id = $1 and nome = 'Banho'", [LOJA.centro]);
  const [{ r }] = await db.rows<{ r: { pedido_id: string; agendamentos: { id: string }[] } }>(
    "select public.criar_pedido($1, $2, $3::jsonb, $4::timestamptz, $5::public.canal_agendamento, $6, $7, null, true) as r",
    [LOJA.centro, tutor, JSON.stringify([{ pet_id: pet, servicos: [servico] }]), `${TERCA} ${hora}-03`, canal, crypto.randomUUID(), PROFISSIONAL.paula],
  );
  return { agendamento: r.agendamentos[0].id, pedido: r.pedido_id };
}

describe("resultados do mês", () => {
  it("conta atendimentos, faltas, cancelamentos, confirmações, faturamento e ocupação", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      const a = await atendimento(db, 1, "09:00");
      const b = await atendimento(db, 2, "10:00");
      const c = await atendimento(db, 3, "11:00");
      const d = await atendimento(db, 4, "14:00", "whatsapp");

      // O mês é futuro: os status são acertados direto, como se o dia já tivesse passado.
      await db.comoSuperusuario();
      await db.query("update public.agendamento set status = 'concluido' where id = $1", [a.agendamento]);
      await db.query("update public.agendamento set status = 'faltou' where id = $1", [b.agendamento]);
      await db.query("update public.agendamento set status = 'cancelado', cancelado_em = now() where id = $1", [c.agendamento]);
      await db.query("update public.pedido set confirmado_em = now() where id in ($1, $2)", [a.pedido, d.pedido]);
      const [{ preco, minutos }] = await db.rows<{ preco: number; minutos: number }>(
        "select preco_total_centavos as preco, extract(epoch from fim - inicio) / 60 as minutos from public.agendamento where id = $1",
        [a.agendamento],
      );

      await db.como(gabriel);
      const r = await resultados(db);
      expect(r.mes).toBe(MES.slice(0, 7));
      expect(r).toMatchObject({ agendados: 3, concluidos: 1, faltas: 1, cancelados: 1, pedidos: 3, pedidos_confirmados: 2, clientes_atendidos: 1 });
      expect(r.faturado_centavos).toBe(preco);
      expect(r.previsto_centavos).toBe(preco); // o da Paula às 14h, mesmo serviço e porte
      expect(r.por_canal).toEqual({ balcao: 2, whatsapp: 1 });
      expect(r.faltas_antes_pct).toBe(15);

      // Ocupação da Paula: atendimentos que aconteceram ou vão acontecer (sem falta e cancelado), sobre as horas do mês.
      const paula = r.ocupacao.find((o) => o.profissional_id === PROFISSIONAL.paula)!;
      expect(paula.minutos_ocupados).toBe(Math.round(minutos) * 2);
      expect(paula.minutos_disponiveis).toBeGreaterThan(9 * 60 * 15);
    });
  });

  it("só o dono e a gerência da loja veem os resultados", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      expect(await db.erro("select public.resultados_do_mes($1)", [LOJA.centro])).toBe("42501");
      await db.como(diego);
      expect(await db.erro("select public.resultados_do_mes($1)", [LOJA.centro])).toBe("42501");
      // A referência de faltas também é só da gestão.
      expect(await db.count("select * from public.petshop_indicador where petshop_id = $1", [LOJA.centro])).toBe(0);
      await db.como(alice);
      expect(await db.count("select * from public.petshop_indicador where petshop_id = $1", [LOJA.centro])).toBe(0);
    });
  });
});
