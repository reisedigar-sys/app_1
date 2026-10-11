import { describe, expect, it } from "vitest";
import { ANON, type Db, comConexao, emTransacao, usuario } from "../helpers/db";
import { HOJE, proximo, somarDias } from "../helpers/datas";
import { LOJA, PEDIDO, PET, PROFISSIONAL, TUTOR, USUARIO } from "../helpers/ids";

// Datas relativas: TER é a terça-feira entre 14 e 20 dias à frente (dentro da janela padrão de 30 dias da loja
// e longe dos agendamentos e bloqueios do seed). Equipe da Centro: Paula (ordem 1; tosa só ter/qui 9h–13h), Marcos (ordem 2; 20% mais lento,
// não faz tosa) e Júlia (ordem 3). Todos trabalham ter–sáb, 9h–18h. Buffer da loja: 10 min. Grade: 15 min.
// Durações do seed: Mel (pequeno/curta) banho 45, tosa 90, hidratação 15; Thor (grande/longa) banho 90.
const TER = proximo(2, 14);
const DOM = somarDias(TER, -2);
const SEG = somarDias(TER, -1);
const QUA = somarDias(TER, 1);
const QUI = somarDias(TER, 2);
const ana = usuario(USUARIO.anaTutora);
const alice = usuario(USUARIO.aliceAtendenteCentro);
const local = (data: string, hora: string) => `${data} ${hora}-03`; // America/Sao_Paulo

type Servicos = Record<"banho" | "tosa" | "hidratacao" | "unhas", string>;

/** IDs dos serviços da Centro. */
async function preparar(db: Db): Promise<Servicos> {
  const rows = await db.rows<{ id: string; nome: string }>("select id, nome from public.servico where petshop_id = $1", [LOJA.centro]);
  const id = (nome: string) => rows.find((r) => r.nome === nome)!.id;
  return { banho: id("Banho"), tosa: id("Tosa completa"), hidratacao: id("Hidratação"), unhas: id("Corte de unhas") };
}

const item = (pet: string, ...servicos: string[]) => ({ pet_id: pet, servicos });

async function horarios(db: Db, itens: object[], data: string, prof: string | null = null) {
  const r = await db.rows<{ hora: string }>("select hora from public.horarios_do_dia($1, $2::jsonb, $3::date, $4)", [
    LOJA.centro,
    JSON.stringify(itens),
    data,
    prof,
  ]);
  return r.map((x) => x.hora);
}

async function disponiveis(db: Db, itens: object[], inicio: string) {
  return db.rows<{ profissional_id: string; minutos: number }>(
    `select profissional_id, extract(epoch from retirada_estimada - $3::timestamptz)::int / 60 as minutos
       from public.profissionais_disponiveis($1, $2::jsonb, $3::timestamptz)`,
    [LOJA.centro, JSON.stringify(itens), inicio],
  );
}

type Resumo = {
  pedido_id: string;
  total_centavos: number;
  retirada_estimada: string;
  agendamentos: { id: string; pet_id: string; profissional_id: string; inicio: string; fim: string }[];
};

const sqlPedido = `select public.criar_pedido($1, $2, $3::jsonb, $4::timestamptz, $5::public.canal_agendamento, $6, $7, null, $8) as r`;
function argsPedido(o: { itens: object[]; inicio: string; prof?: string | null; chave?: string; canal?: string; encaixe?: boolean; tutor?: string }) {
  return [
    LOJA.centro,
    o.tutor ?? TUTOR.ana,
    JSON.stringify(o.itens),
    o.inicio,
    o.canal ?? "app_proprio",
    o.chave ?? crypto.randomUUID(),
    o.prof ?? null,
    o.encaixe ?? false,
  ];
}
async function pedir(db: Db, o: Parameters<typeof argsPedido>[0]): Promise<Resumo> {
  const [{ r }] = await db.rows<{ r: Resumo }>(sqlPedido, argsPedido(o));
  return r;
}
const erroPedido = (db: Db, o: Parameters<typeof argsPedido>[0]) => db.erro(sqlPedido, argsPedido(o));

/** Agendamento gravado direto (superusuário), para ocupar a agenda nos testes. */
async function ocupar(db: Db, prof: string, inicio: string, fim: string) {
  await db.query(
    `insert into public.agendamento (petshop_id, pedido_id, tutor_id, pet_id, profissional_id, canal, inicio, fim, buffer_minutos)
     values ($1, $2, $3, $4, $5, 'balcao', $6, $7, 10)`,
    [LOJA.centro, PEDIDO.anaCentro, TUTOR.ana, PET.thor, prof, inicio, fim],
  );
}

describe("horários do dia", () => {
  it("grade de 15 min dentro do expediente; o último horário termina no fim do expediente", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(ana);
      const h = await horarios(db, [item(PET.mel, s.banho)], TER, PROFISSIONAL.paula);
      expect(h[0]).toBe("09:00");
      expect(h.at(-1)).toBe("17:15"); // 17:15 + 45 min = 18:00
      expect(h).toHaveLength(34);
      expect(h).not.toContain("17:30");
    });
  });

  it("folga: sem janela no dia, sem horário", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(ana);
      expect(await horarios(db, [item(PET.mel, s.banho)], SEG)).toEqual([]);
      expect(await horarios(db, [item(PET.mel, s.banho)], DOM)).toEqual([]);
    });
  });

  it("sobreposição e buffer: o atendimento e a limpeza não invadem outro agendamento", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await ocupar(db, PROFISSIONAL.paula, local(TER, "10:00"), local(TER, "11:00")); // ocupa até 11:10 (buffer)
      await db.como(ana);
      const h = await horarios(db, [item(PET.mel, s.banho)], TER, PROFISSIONAL.paula);
      expect(h).toContain("09:00"); // 09:00–09:45 + 10 de limpeza = 09:55
      expect(h).not.toContain("09:15"); // a limpeza iria até 10:10
      expect(h).not.toContain("10:00");
      expect(h).not.toContain("11:00"); // ainda na limpeza do anterior
      expect(h).toContain("11:15"); // primeiro horário da grade depois de 11:10
    });
  });

  it("cancelado não ocupa a agenda", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await ocupar(db, PROFISSIONAL.paula, local(TER, "10:00"), local(TER, "11:00"));
      await db.query("update public.agendamento set status = 'cancelado' where profissional_id = $1 and inicio = $2", [
        PROFISSIONAL.paula,
        local(TER, "10:00"),
      ]);
      await db.como(ana);
      expect(await horarios(db, [item(PET.mel, s.banho)], TER, PROFISSIONAL.paula)).toContain("10:00");
    });
  });

  it("bloqueio do profissional e da loja inteira", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.query("insert into public.bloqueio (petshop_id, profissional_id, tipo, periodo) values ($1, $2, 'almoco', tstzrange($3, $4))", [
        LOJA.centro,
        PROFISSIONAL.paula,
        local(TER, "12:00"),
        local(TER, "13:00"),
      ]);
      await db.query("insert into public.bloqueio (petshop_id, tipo, periodo) values ($1, 'feriado', tstzrange($2, $3))", [
        LOJA.centro,
        local(QUA, "00:00"),
        local(QUI, "00:00"),
      ]);
      await db.como(ana);
      const h = await horarios(db, [item(PET.mel, s.banho)], TER, PROFISSIONAL.paula);
      expect(h).toContain("11:15"); // termina 12:00, encostado no bloqueio
      expect(h).not.toContain("11:30");
      expect(h).not.toContain("12:45");
      expect(h).toContain("13:00");
      // Outros profissionais não são afetados pelo almoço da Paula.
      expect(await horarios(db, [item(PET.mel, s.banho)], TER, PROFISSIONAL.julia)).toContain("12:00");
      // Feriado da loja: ninguém atende.
      expect(await horarios(db, [item(PET.mel, s.banho)], QUA)).toEqual([]);
    });
  });

  it("janela específica do serviço: tosa da Paula só terça e quinta de manhã", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(ana);
      const ter = await horarios(db, [item(PET.mel, s.tosa)], TER, PROFISSIONAL.paula);
      expect(ter[0]).toBe("09:00");
      expect(ter.at(-1)).toBe("11:30"); // 11:30 + 90 = 13:00
      expect(await horarios(db, [item(PET.mel, s.tosa)], QUA, PROFISSIONAL.paula)).toEqual([]);
      // A Júlia não tem janela específica: faz tosa no horário geral.
      expect(await horarios(db, [item(PET.mel, s.tosa)], QUA, PROFISSIONAL.julia)).toContain("16:30");
      // Banho da Paula na quarta segue o horário geral.
      expect(await horarios(db, [item(PET.mel, s.banho)], QUA, PROFISSIONAL.paula)).toContain("16:00");
    });
  });

  it("vários serviços em sequência: soma as durações e respeita a janela de todos", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(ana);
      // Tosa (90, só até 13h para a Paula) + hidratação (15) = 105 min.
      const h = await horarios(db, [item(PET.mel, s.tosa, s.hidratacao)], TER, PROFISSIONAL.paula);
      expect(h.at(-1)).toBe("11:15");
      // Banho + hidratação + unhas = 70 min.
      const b = await horarios(db, [item(PET.mel, s.banho, s.hidratacao, s.unhas)], TER, PROFISSIONAL.paula);
      expect(b.at(-1)).toBe("16:45"); // 16:45 + 70 = 17:55
    });
  });

  it("dias com vaga no mês", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(ana);
      const dias = (
        await db.rows<{ dia: Date }>("select dia from public.dias_com_vaga($1, $2::jsonb, $3::date)", [
          LOJA.centro,
          JSON.stringify([item(PET.mel, s.tosa)]),
          TER,
        ])
      ).map((d) => d.dia.toISOString().slice(0, 10));
      expect(dias).toContain(TER);
      expect(dias).not.toContain(SEG);
      expect(dias).not.toContain(DOM);
      // Só terça a sábado, e nunca antes de hoje.
      expect(dias.every((d) => [2, 3, 4, 5, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))).toBe(true);
      expect(dias.every((d) => d >= HOJE)).toBe(true);
    });
  });
});

describe("profissionais disponíveis", () => {
  it("só aparece quem está habilitado em todos os serviços escolhidos", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(ana);
      const ter = (await disponiveis(db, [item(PET.mel, s.tosa, s.hidratacao)], local(TER, "09:00"))).map((p) => p.profissional_id);
      expect(ter.sort()).toEqual([PROFISSIONAL.paula, PROFISSIONAL.julia].sort()); // Marcos não faz tosa
      const qua = (await disponiveis(db, [item(PET.mel, s.tosa, s.hidratacao)], local(QUA, "09:00"))).map((p) => p.profissional_id);
      expect(qua).toEqual([PROFISSIONAL.julia]); // tosa da Paula só ter/qui
    });
  });

  it("aplica o fator de duração de cada profissional na retirada estimada", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(ana);
      const r = await disponiveis(db, [item(PET.mel, s.banho)], local(TER, "09:00"));
      const min = (p: string) => r.find((x) => x.profissional_id === p)?.minutos;
      expect(min(PROFISSIONAL.paula)).toBe(45);
      expect(min(PROFISSIONAL.marcos)).toBe(54); // 45 × 1,2
    });
  });

  it("profissional inativo não aparece", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.query("update public.profissional set ativo = false where id = $1", [PROFISSIONAL.julia]);
      await db.como(ana);
      const r = (await disponiveis(db, [item(PET.mel, s.banho)], local(TER, "09:00"))).map((p) => p.profissional_id);
      expect(r).not.toContain(PROFISSIONAL.julia);
    });
  });

  it("profissional escolhido sem vaga; 'qualquer profissional' ainda tem", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.query("insert into public.bloqueio (petshop_id, profissional_id, tipo, periodo) values ($1, $2, 'folga', tstzrange($3, $4))", [
        LOJA.centro,
        PROFISSIONAL.paula,
        local(TER, "00:00"),
        local(QUA, "00:00"),
      ]);
      await db.como(ana);
      expect(await horarios(db, [item(PET.mel, s.banho)], TER, PROFISSIONAL.paula)).toEqual([]);
      const qualquer = await db.rows<{ profissionais: string[] }>(
        "select profissionais from public.horarios_do_dia($1, $2::jsonb, $3::date) where hora = '09:00'",
        [LOJA.centro, JSON.stringify([item(PET.mel, s.banho)]), TER],
      );
      expect(qualquer[0].profissionais.sort()).toEqual([PROFISSIONAL.marcos, PROFISSIONAL.julia].sort());
    });
  });
});

describe("vários pets no mesmo pedido", () => {
  async function comNina(db: Db) {
    const [{ id }] = await db.rows<{ id: string }>(
      "insert into public.pet (tutor_id, nome, porte, pelagem) values ($1, 'Nina', 'mini', 'curta') returning id",
      [TUTOR.ana],
    );
    return id; // banho mini/curta = 40 min
  }

  it("1, 2 e 3 pets: um bloco contínuo com o mesmo profissional", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      const nina = await comNina(db);
      await db.como(ana);
      const um = await horarios(db, [item(PET.thor, s.banho)], TER, PROFISSIONAL.paula);
      expect(um.at(-1)).toBe("16:30"); // 90 min
      const dois = await horarios(db, [item(PET.thor, s.banho), item(PET.mel, s.banho)], TER, PROFISSIONAL.paula);
      expect(dois.at(-1)).toBe("15:30"); // 90 + 10 + 45 = 145 min
      const tres = await horarios(db, [item(PET.thor, s.banho), item(PET.mel, s.banho), item(nina, s.banho)], TER, PROFISSIONAL.paula);
      expect(tres.at(-1)).toBe("14:45"); // 90 + 10 + 45 + 10 + 40 = 195 min
    });
  });

  it("cria um agendamento por pet, em sequência, e devolve a retirada estimada", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      const nina = await comNina(db);
      await db.como(ana);
      const r = await pedir(db, {
        itens: [item(PET.thor, s.banho), item(PET.mel, s.banho, s.hidratacao), item(nina, s.banho)],
        inicio: local(TER, "09:00"),
        prof: PROFISSIONAL.paula,
      });
      const h = (iso: string) => new Date(iso).toISOString().slice(11, 16); // UTC
      expect(r.agendamentos.map((a) => [a.pet_id, h(a.inicio), h(a.fim)])).toEqual([
        [PET.thor, "12:00", "13:30"], // 09:00–10:30 local
        [PET.mel, "13:40", "14:40"], // 10:40–11:40 (banho 45 + hidratação 15)
        [nina, "14:50", "15:30"], // 11:50–12:30
      ]);
      expect(h(r.retirada_estimada)).toBe("15:30");
      expect(r.agendamentos.every((a) => a.profissional_id === PROFISSIONAL.paula)).toBe(true);
      // Total = soma dos preços do seed (Thor banho 111 + Mel banho 50 + hidratação 25 + Nina banho 40).
      expect(r.total_centavos).toBe(11100 + 5000 + 2500 + 4000);
      await db.comoSuperusuario();
      const itens = await db.rows<{ duracao_minutos: number }>(
        "select duracao_minutos from public.agendamento_item where agendamento_id = $1 order by ordem",
        [r.agendamentos[1].id],
      );
      expect(itens.map((i) => i.duracao_minutos)).toEqual([45, 15]);
    });
  });

  it("se um pet não couber, nada é gravado", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      const nina = await comNina(db);
      const antes = await db.count("select 1 from public.agendamento");
      const pedidosAntes = await db.count("select 1 from public.pedido");
      await db.como(ana);
      expect(
        await erroPedido(db, {
          itens: [item(PET.thor, s.banho), item(PET.mel, s.banho), item(nina, s.banho)],
          inicio: local(TER, "15:00"), // o bloco de 195 min passaria das 18h
          prof: PROFISSIONAL.paula,
        }),
      ).toBe("AG001");
      await db.comoSuperusuario();
      expect(await db.count("select 1 from public.agendamento")).toBe(antes);
      expect(await db.count("select 1 from public.pedido")).toBe(pedidosAntes);
    });
  });
});

describe("criar_pedido", () => {
  it("'qualquer profissional': quem tem menos minutos no dia; empate pela ordem da loja", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(ana);
      const p1 = await pedir(db, { itens: [item(PET.mel, s.banho)], inicio: local(TER, "09:00") });
      expect(p1.agendamentos[0].profissional_id).toBe(PROFISSIONAL.paula); // todos com 0 min → ordem 1
      const p2 = await pedir(db, { itens: [item(PET.thor, s.banho)], inicio: local(TER, "11:00") });
      expect(p2.agendamentos[0].profissional_id).toBe(PROFISSIONAL.marcos); // Paula já tem 45 min
      const p3 = await pedir(db, { itens: [item(PET.mel, s.banho)], inicio: local(TER, "14:00") });
      expect(p3.agendamentos[0].profissional_id).toBe(PROFISSIONAL.julia);
    });
  });

  it("horário ocupado devolve 'horário indisponível'", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await ocupar(db, PROFISSIONAL.paula, local(TER, "10:00"), local(TER, "11:00"));
      await db.como(ana);
      expect(await erroPedido(db, { itens: [item(PET.mel, s.banho)], inicio: local(TER, "10:15"), prof: PROFISSIONAL.paula })).toBe("AG001");
      // Fora da grade de 15 min também não é aceito.
      expect(await erroPedido(db, { itens: [item(PET.mel, s.banho)], inicio: local(TER, "13:07"), prof: PROFISSIONAL.paula })).toBe("AG001");
    });
  });

  it("idempotência: a mesma chave não duplica; outro tutor não reaproveita a chave", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(ana);
      const o = { itens: [item(PET.mel, s.banho)], inicio: local(TER, "09:00"), chave: "pedido-ana-1" };
      const a = await pedir(db, o);
      const b = await pedir(db, o);
      expect(b.pedido_id).toBe(a.pedido_id);
      await db.comoSuperusuario();
      expect(await db.count("select 1 from public.pedido where chave_idempotencia = 'pedido-ana-1'")).toBe(1);
      expect(await db.count("select 1 from public.agendamento where pedido_id = $1", [a.pedido_id])).toBe(1);
      await db.como(usuario(USUARIO.brunoTutor));
      expect(
        await erroPedido(db, { itens: [item(PET.luna, s.banho)], inicio: local(TER, "15:00"), chave: "pedido-ana-1", tutor: TUTOR.bruno }),
      ).toBe("AG002");
    });
  });

  it("antecedência mínima e janela máxima valem para o cliente, não para a equipe", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.query("update public.petshop set janela_maxima_dias = 30 where id = $1", [LOJA.centro]);
      const [{ longe, perto }] = await db.rows<{ longe: string; perto: string }>(
        // terça daqui a ~6 semanas (fora dos 30 dias) e daqui a 30 min (dentro da antecedência de 60 min)
        `select (current_date + 42 + ((9 - extract(dow from current_date + 42)::int) % 7))::text as longe,
                (date_trunc('hour', now()) + interval '1 hour')::text as perto`,
      );
      await db.como(ana);
      expect(await horarios(db, [item(PET.mel, s.banho)], longe)).toEqual([]);
      expect(await erroPedido(db, { itens: [item(PET.mel, s.banho)], inicio: perto })).toBe("AG004");
      await db.como(alice);
      expect((await horarios(db, [item(PET.mel, s.banho)], longe)).length).toBeGreaterThan(0);
    });
  });

  it("encaixe: só a equipe, fora da grade, mas nunca sobrepondo", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(alice);
      const r = await pedir(db, {
        itens: [item(PET.mel, s.banho)],
        inicio: local(TER, "19:00"), // depois do expediente
        prof: PROFISSIONAL.paula,
        canal: "balcao",
        encaixe: true,
      });
      expect(r.agendamentos).toHaveLength(1);
      expect(
        await erroPedido(db, { itens: [item(PET.thor, s.banho)], inicio: local(TER, "19:30"), prof: PROFISSIONAL.paula, canal: "balcao", encaixe: true }),
      ).toBe("AG001");
      await db.como(ana);
      expect(
        await erroPedido(db, { itens: [item(PET.mel, s.banho)], inicio: local(TER, "20:00"), prof: PROFISSIONAL.paula, encaixe: true }),
      ).toBe("42501");
    });
  });

  it("autorização: tutor só agenda para si, pelo app; visitante não agenda", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(ana);
      expect(await erroPedido(db, { itens: [item(PET.luna, s.banho)], inicio: local(TER, "09:00"), tutor: TUTOR.bruno })).toBe("42501");
      expect(await erroPedido(db, { itens: [item(PET.mel, s.banho)], inicio: local(TER, "09:00"), canal: "balcao" })).toBe("42501");
      // Pet de outro tutor no pedido da Ana.
      expect(await erroPedido(db, { itens: [item(PET.luna, s.banho)], inicio: local(TER, "09:00") })).toBe("AG002");
      await db.como(ANON);
      expect(await erroPedido(db, { itens: [item(PET.mel, s.banho)], inicio: local(TER, "09:00") })).toBe("42501");
    });
  });

  it("a equipe agenda pelo balcão para um tutor e registra o vínculo com a loja", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(alice);
      const r = await pedir(db, { itens: [item(PET.luna, s.banho)], inicio: local(TER, "09:00"), tutor: TUTOR.bruno, canal: "balcao" });
      await db.comoSuperusuario();
      expect(await db.rows("select canal, criado_por_tipo from public.pedido where id = $1", [r.pedido_id])).toEqual([
        { canal: "balcao", criado_por_tipo: "equipe" },
      ]);
      expect(await db.count("select 1 from public.tutor_petshop where petshop_id = $1 and tutor_id = $2", [LOJA.centro, TUTOR.bruno])).toBe(1);
    });
  });
});

describe("validação dos itens", () => {
  it("um principal por pet, adicionais depois, serviços da própria loja, com preço", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      const [{ id: banhoMoema }] = await db.rows<{ id: string }>("select id from public.servico where petshop_id = $1 and nome = 'Banho'", [LOJA.moema]);
      await db.query("delete from public.servico_preco where servico_id = $1 and porte = 'pequeno' and pelagem = 'curta'", [s.hidratacao]);
      await db.como(ana);
      const sql = "select * from public.horarios_do_dia($1, $2::jsonb, $3::date)";
      const tentar = (itens: object[]) => db.erro(sql, [LOJA.centro, JSON.stringify(itens), TER]);
      expect(await tentar([item(PET.mel, s.banho, s.tosa)])).toBe("AG002"); // dois principais
      expect(await tentar([item(PET.mel, s.hidratacao)])).toBe("AG002"); // só adicional
      expect(await tentar([item(PET.mel, banhoMoema)])).toBe("AG002"); // serviço de outra loja
      expect(await tentar([item(PET.mel, s.banho), item(PET.mel, s.banho)])).toBe("AG002"); // pet repetido
      expect(await tentar([])).toBe("AG002");
      expect(await tentar([item(PET.mel, s.banho, s.hidratacao)])).toBe("AG003"); // sem preço p/ pequeno/curta
    });
  });

  it("visitante consulta por porte e pelagem, mas não pelo pet de outra pessoa", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.como(ANON);
      expect(await horarios(db, [{ porte: "pequeno", pelagem: "curta", servicos: [s.banho] }], TER)).toContain("09:00");
      expect(await db.erro("select * from public.horarios_do_dia($1, $2::jsonb, $3::date)", [LOJA.centro, JSON.stringify([item(PET.mel, s.banho)]), TER])).toBe(
        "AG002",
      );
    });
  });
});

describe("fuso horário e virada de dia", () => {
  it("horários no fuso da loja; janela até perto da meia-noite não muda o dia local", async () => {
    await emTransacao(async (db) => {
      const s = await preparar(db);
      await db.query("update public.petshop set fuso = 'America/Manaus' where id = $1", [LOJA.centro]); // UTC−4
      await db.query(
        "insert into public.horario_trabalho (petshop_id, profissional_id, dia_semana, inicio, fim) values ($1, $2, 2, '22:00', '23:45')",
        [LOJA.centro, PROFISSIONAL.paula],
      );
      await db.como(ana);
      const r = await db.rows<{ hora: string; inicio: Date }>("select hora, inicio from public.horarios_do_dia($1, $2::jsonb, $3::date, $4)", [
        LOJA.centro,
        JSON.stringify([item(PET.mel, s.banho)]),
        TER,
        PROFISSIONAL.paula,
      ]);
      const utc = (hora: string) => r.find((x) => x.hora === hora)?.inicio.toISOString();
      expect(utc("09:00")).toBe(`${TER}T13:00:00.000Z`);
      expect(utc("22:00")).toBe(`${QUA}T02:00:00.000Z`); // já é quarta em UTC
      expect(r.at(-1)?.hora).toBe("23:00"); // 23:00 + 45 = 23:45
      const dias = (
        await db.rows<{ dia: Date }>("select dia from public.dias_com_vaga($1, $2::jsonb, $3::date, $4)", [
          LOJA.centro,
          JSON.stringify([item(PET.mel, s.banho)]),
          TER,
          PROFISSIONAL.paula,
        ])
      ).map((d) => d.dia.toISOString().slice(0, 10));
      expect(dias).toContain(TER);
      expect(dias).not.toContain(SEG); // segunda continua sem vaga
    });
  });
});

describe("concorrência", () => {
  it("dois pedidos no mesmo horário ao mesmo tempo: só um passa", async () => {
    const chaves = [`concorrencia-${crypto.randomUUID()}`, `concorrencia-${crypto.randomUUID()}`];
    try {
      const [{ id: banho }] = await comConexao((db) =>
        db.rows<{ id: string }>("select id from public.servico where petshop_id = $1 and nome = 'Banho'", [LOJA.centro]),
      );
      // Terça entre 7 e 13 dias à frente (dentro da janela real de 30 dias), 15h.
      const [{ inicio }] = await comConexao((db) =>
        db.rows<{ inicio: string }>(
          `select ((current_date + 7 + ((9 - extract(dow from current_date + 7)::int) % 7)) + time '15:00')
                    at time zone 'America/Sao_Paulo' as inicio`,
        ),
      );
      const tentar = (chave: string) =>
        comConexao(async (db) => {
          await db.query("begin");
          try {
            await db.como(ana);
            const r = await db.rows(sqlPedido, argsPedido({ itens: [item(PET.mel, banho)], inicio, prof: PROFISSIONAL.paula, chave }));
            await db.query("commit");
            return r;
          } catch (e) {
            await db.query("rollback");
            throw e;
          }
        });
      const resultados = await Promise.allSettled(chaves.map(tentar));
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const falha = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect((falha.reason as { code?: string }).code).toBe("AG001");
    } finally {
      await comConexao((db) => db.query("delete from public.pedido where chave_idempotencia = any($1)", [chaves]));
    }
  });
});
