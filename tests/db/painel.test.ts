import { describe, expect, it } from "vitest";
import { ANON, type Db, emTransacao, usuario } from "../helpers/db";
import { HOJE, somarDias } from "../helpers/datas";
import { AGENDAMENTO, LOJA, PET, PROFISSIONAL, TUTOR, USUARIO } from "../helpers/ids";

const alice = usuario(USUARIO.aliceAtendenteCentro);
const paula = usuario(USUARIO.paulaProfissionalCentro);
const diego = usuario(USUARIO.diegoDonoMoema);

// Terça-feira passada (todos trabalham de terça a sábado, 9h–18h): a falta só pode ser marcada depois do início.
const DIA = (() => {
  let d = somarDias(HOJE, -1);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 2) d = somarDias(d, -1);
  return d;
})();
const as = (hora: string, data = DIA) => `${data} ${hora}-03`;

async function banho(db: Db) {
  const [{ id }] = await db.rows<{ id: string }>("select id from public.servico where petshop_id = $1 and nome = 'Banho'", [LOJA.centro]);
  return id;
}

async function cadastrarCliente(db: Db, nome: string, telefone: string) {
  const [{ tutor }] = await db.rows<{ tutor: string }>("select public.cadastrar_tutor_balcao($1, $2, $3, true) as tutor", [LOJA.centro, nome, telefone]);
  const [{ pet }] = await db.rows<{ pet: string }>("select public.cadastrar_pet_balcao($1, $2, $3, 'pequeno', 'curta') as pet", [LOJA.centro, tutor, `Pet de ${nome}`]);
  return { tutor, pet };
}

type Resumo = { pedido_id: string; agendamentos: { id: string; profissional_id: string; inicio: string; fim: string }[] };
const sqlPedido = `select public.criar_pedido($1, $2, $3::jsonb, $4::timestamptz, $5::public.canal_agendamento, $6, $7, null, $8) as r`;

async function agendar(db: Db, o: { tutor: string; pet: string; servico: string; inicio: string; prof?: string; canal?: string; encaixe?: boolean }) {
  const args = [LOJA.centro, o.tutor, JSON.stringify([{ pet_id: o.pet, servicos: [o.servico] }]), o.inicio, o.canal ?? "balcao", crypto.randomUUID(), o.prof ?? null, o.encaixe ?? false];
  const r = await db.tentar(sqlPedido, args);
  if (r.codigo) return { erro: r.codigo } as const;
  const [{ r: resumo }] = await db.rows<{ r: Resumo }>(sqlPedido, args);
  return { resumo } as const;
}

describe("simulação de um dia de loja", () => {
  it("10 atendimentos, 2 cancelamentos, 1 falta e 1 encaixe sem inconsistência na agenda", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      const servico = await banho(db);
      const clientes = [];
      for (let i = 0; i < 10; i++) clientes.push(await cadastrarCliente(db, `Cliente ${i}`, `+55119777700${String(i).padStart(2, "0")}`));

      // Banho para porte pequeno e pelagem curta: 45 min (Marcos, 20% mais lento: 54 min) + 10 min de buffer.
      const plano: [string, string | undefined][] = [
        ["09:00", PROFISSIONAL.paula],
        ["10:00", PROFISSIONAL.paula],
        ["11:00", PROFISSIONAL.paula],
        ["09:00", PROFISSIONAL.marcos],
        ["10:15", PROFISSIONAL.marcos],
        ["09:00", PROFISSIONAL.julia],
        ["10:00", PROFISSIONAL.julia],
        ["11:00", PROFISSIONAL.julia],
        ["14:00", undefined], // qualquer profissional
        ["15:00", undefined],
      ];
      const ids: string[] = [];
      for (const [i, [hora, prof]] of plano.entries()) {
        const r = await agendar(db, { ...clientes[i], servico, inicio: as(hora), prof, canal: i === 9 ? "whatsapp" : "balcao" });
        expect(r.erro, `atendimento ${i} às ${hora}`).toBeUndefined();
        ids.push(r.resumo!.agendamentos[0].id);
      }
      // "Qualquer profissional" vai para quem tem menos minutos no dia: Marcos (108 min) contra 135 das outras.
      const [{ profissional_id: qualquer }] = await db.rows("select profissional_id from public.agendamento where id = $1", [ids[8]]);
      expect(qualquer).toBe(PROFISSIONAL.marcos);

      // Overbooking é recusado (Paula está ocupada até 09:55 com o buffer), e nada é gravado.
      expect((await agendar(db, { ...clientes[0], servico, inicio: as("09:30"), prof: PROFISSIONAL.paula })).erro).toBe("AG001");

      // Encaixe fora da grade (12:05) é aceito; sobreposto a outro atendimento, nunca.
      const encaixe = await agendar(db, { ...clientes[1], servico, inicio: as("12:05"), prof: PROFISSIONAL.paula, encaixe: true });
      expect(encaixe.erro).toBeUndefined();
      expect((await agendar(db, { ...clientes[1], servico, inicio: as("10:20"), prof: PROFISSIONAL.paula, encaixe: true })).erro).toBe("AG001");

      // 2 cancelamentos: o horário volta a aparecer no motor.
      await db.query("select public.cancelar_agendamento($1)", [ids[2]]);
      await db.query("select public.cancelar_agendamento($1)", [ids[6]]);
      const horas = await db.rows<{ hora: string }>("select hora from public.horarios_do_dia($1, $2::jsonb, $3, $4)", [
        LOJA.centro,
        JSON.stringify([{ pet_id: clientes[0].pet, servicos: [servico] }]),
        DIA,
        PROFISSIONAL.paula,
      ]);
      expect(horas.map((h) => h.hora)).toContain("11:00");

      // 1 falta: conta no cadastro do tutor nesta loja.
      await db.query("update public.agendamento set status = 'faltou' where id = $1", [ids[7]]);
      const [vinculo] = await db.rows<{ faltas: number }>("select faltas from public.tutor_petshop where petshop_id = $1 and tutor_id = $2", [
        LOJA.centro,
        clientes[7].tutor,
      ]);
      expect(vinculo.faltas).toBe(1);

      // Fluxo de status completo, e transições inválidas recusadas.
      for (const s of ["confirmado", "em_atendimento", "pronto", "concluido"]) {
        expect(await db.erro("update public.agendamento set status = $2 where id = $1", [ids[0], s]), s).toBeNull();
      }
      expect(await db.erro("update public.agendamento set status = 'concluido' where id = $1", [ids[1]])).toBe("AG005");
      expect(await db.erro("update public.agendamento set status = 'cancelado' where id = $1", [ids[0]])).toBe("AG005");
      expect(await db.erro("update public.agendamento set status = 'agendado' where id = $1", [ids[2]])).toBe("AG005");

      // Remarcar pelo motor (mantém a Paula) para o horário liberado pelo cancelamento.
      const [{ r: remarcado }] = await db.rows<{ r: { profissional_id: string } }>("select public.remarcar_agendamento($1, $2::timestamptz) as r", [
        ids[1],
        as("11:00"),
      ]);
      expect(remarcado.profissional_id).toBe(PROFISSIONAL.paula);

      // A agenda do dia mostra tudo, e nenhum profissional tem dois atendimentos ativos sobrepostos (com buffer).
      const agenda = await db.rows<{ id: string; status: string; encaixe: boolean; pet_nome: string; tutor_nome: string; servicos: string[] }>(
        "select id, status, encaixe, pet_nome, tutor_nome, servicos from public.agenda_loja($1, $2, $2)",
        [LOJA.centro, DIA],
      );
      expect(agenda).toHaveLength(11);
      const contar = (s: string) => agenda.filter((a) => a.status === s).length;
      expect([contar("cancelado"), contar("faltou"), contar("concluido"), agenda.filter((a) => a.encaixe).length]).toEqual([2, 1, 1, 1]);
      expect(agenda.every((a) => a.pet_nome && a.tutor_nome && a.servicos[0] === "Banho")).toBe(true);

      await db.comoSuperusuario();
      expect(
        await db.count(
          `select 1 from public.agendamento a join public.agendamento b
             on a.profissional_id = b.profissional_id and a.id < b.id and a.ocupado && b.ocupado
            where a.petshop_id = $1 and a.status not in ('cancelado', 'faltou') and b.status not in ('cancelado', 'faltou')`,
          [LOJA.centro],
        ),
      ).toBe(0);
    });
  });
});

describe("agenda da loja", () => {
  it("a profissional vê só a própria agenda; outra loja não vê nada", async () => {
    await emTransacao(async (db) => {
      const de = somarDias(HOJE, -20);
      const ate = somarDias(HOJE, 5);
      await db.como(alice);
      const todos = await db.rows<{ profissional_id: string }>("select profissional_id from public.agenda_loja($1, $2, $3)", [LOJA.centro, de, ate]);
      expect(new Set(todos.map((a) => a.profissional_id))).toEqual(new Set([PROFISSIONAL.julia, PROFISSIONAL.paula]));

      await db.como(paula);
      const dela = await db.rows<{ profissional_id: string; tutor_nome: string }>("select profissional_id, tutor_nome from public.agenda_loja($1, $2, $3)", [
        LOJA.centro,
        de,
        ate,
      ]);
      expect(dela.length).toBeGreaterThan(0);
      expect(dela.every((a) => a.profissional_id === PROFISSIONAL.paula && a.tutor_nome)).toBe(true);

      await db.como(diego);
      expect(await db.count("select * from public.agenda_loja($1, $2, $3)", [LOJA.centro, de, ate])).toBe(0);
    });
  });

  it("usa o dia no fuso da loja e limita o período a 31 dias", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      const dia = somarDias(HOJE, 2); // Thor, 10h com a Júlia (seed)
      expect(await db.rows("select id from public.agenda_loja($1, $2, $2)", [LOJA.centro, dia])).toEqual([{ id: AGENDAMENTO.thorCentro }]);
      expect(await db.count("select * from public.agenda_loja($1, $2, $3)", [LOJA.centro, somarDias(dia, 1), somarDias(dia, 1)])).toBe(0);
      expect(await db.count("select * from public.agenda_loja($1, $2, $3)", [LOJA.centro, HOJE, somarDias(HOJE, 40)])).toBe(0);
    });
  });

  it("está publicada no Realtime", async () => {
    await emTransacao(async (db) => {
      expect(await db.count("select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'agendamento'")).toBe(1);
    });
  });

  it("converte o horário da loja para UTC", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      const [{ t }] = await db.rows<{ t: Date }>("select public.horario_da_loja($1, '2030-01-08 14:10') as t", [LOJA.centro]);
      expect(t.toISOString()).toBe("2030-01-08T17:10:00.000Z");
    });
  });
});

describe("status pelo painel", () => {
  it("falta só depois do início; cancelar ou faltar cancela as notificações pendentes", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      expect(await db.erro("update public.agendamento set status = 'faltou' where id = $1", [AGENDAMENTO.thorCentro])).toBe("AG005");
      await db.query("update public.agendamento set status = 'cancelado' where id = $1", [AGENDAMENTO.thorCentro]);
      await db.comoSuperusuario();
      expect(await db.count("select 1 from public.notificacao_agendada where agendamento_id = $1 and status = 'pendente' and tipo <> 'cancelamento'", [AGENDAMENTO.thorCentro])).toBe(0);
      // A loja cancelou: o tutor recebe o aviso de cancelamento (semana 6).
      expect(await db.count("select 1 from public.notificacao_agendada where agendamento_id = $1 and status = 'pendente' and tipo = 'cancelamento'", [AGENDAMENTO.thorCentro])).toBe(1);
    });
  });

  it("a profissional conduz o atendimento, mas não confirma, cancela nem marca falta", async () => {
    await emTransacao(async (db) => {
      await db.comoSuperusuario();
      // Atendimento da Paula que já começou.
      await db.query("update public.agendamento set status = 'agendado' where id = $1", [AGENDAMENTO.melCentroPassado]);
      await db.como(paula);
      for (const s of ["confirmado", "cancelado", "faltou"]) {
        expect(await db.erro("update public.agendamento set status = $2 where id = $1", [AGENDAMENTO.melCentroPassado, s]), s).toBe("42501");
      }
      expect(await db.erro("update public.agendamento set status = 'em_atendimento' where id = $1", [AGENDAMENTO.melCentroPassado])).toBeNull();
      expect(await db.erro("update public.agendamento set status = 'pronto' where id = $1", [AGENDAMENTO.melCentroPassado])).toBeNull();
      // Agenda de outro profissional: o RLS nem deixa ver.
      const r = await db.tentar("update public.agendamento set status = 'em_atendimento' where id = $1", [AGENDAMENTO.thorCentro]);
      expect(r).toEqual({ codigo: null, linhas: 0 });
    });
  });
});

describe("balcão", () => {
  it("busca o tutor pelo telefone só entre os clientes da loja", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      const ana = await db.rows<{ tutor_id: string; pets: { nome: string }[] }>("select tutor_id, pets from public.buscar_tutor_balcao($1, '+5511988880001')", [
        LOJA.centro,
      ]);
      expect(ana.map((t) => t.tutor_id)).toEqual([TUTOR.ana]);
      expect(ana[0].pets.map((p) => p.nome).sort()).toEqual(["Mel", "Thor"]);
      // Bruno não é cliente do Centro: o telefone não revela o cadastro dele.
      expect(await db.count("select * from public.buscar_tutor_balcao($1, '+5511988880002')", [LOJA.centro])).toBe(0);
      await db.como(paula);
      expect(await db.count("select * from public.buscar_tutor_balcao($1, '+5511988880001')", [LOJA.centro])).toBe(0);
    });
  });

  it("cadastro mínimo: não liga uma conta pelo telefone e reaproveita o cadastro feito por outra loja", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      // Telefone do Bruno (tem conta): a loja cria um cadastro próprio, sem conta, em vez de ligar a conta dele.
      const [{ id }] = await db.rows<{ id: string }>("select public.cadastrar_tutor_balcao($1, 'Bruno L.', '+5511988880002') as id", [LOJA.centro]);
      expect(id).not.toBe(TUTOR.bruno);
      // Repetir devolve o mesmo cadastro (agora cliente da loja).
      const [{ id: denovo }] = await db.rows<{ id: string }>("select public.cadastrar_tutor_balcao($1, 'Bruno', '+5511988880002') as id", [LOJA.centro]);
      expect(denovo).toBe(id);

      // Outra rede, telefone de quem já é cliente dela: a loja usa o cadastro que já conhece.
      await db.como(diego);
      const [{ id: moema }] = await db.rows<{ id: string }>("select public.cadastrar_tutor_balcao($1, 'Bruno', '+5511988880002') as id", [LOJA.moema]);
      expect(moema).toBe(TUTOR.bruno);
      // Telefone com cadastro sem conta feito por outra loja: é o mesmo tutor (identidade global), com os pets.
      await db.como(alice);
      const [{ id: novo }] = await db.rows<{ id: string }>("select public.cadastrar_tutor_balcao($1, 'Lia', '+5511977773333') as id", [LOJA.centro]);
      const [{ pet }] = await db.rows<{ pet: string }>("select public.cadastrar_pet_balcao($1, $2, 'Toby', 'medio', 'curta', 'cao', 'SRD') as pet", [
        LOJA.centro,
        novo,
      ]);
      await db.como(diego);
      const [{ id: mesmo }] = await db.rows<{ id: string }>("select public.cadastrar_tutor_balcao($1, 'Lia M.', '+5511977773333') as id", [LOJA.moema]);
      expect(mesmo).toBe(novo);
      const visiveis = await db.rows<{ tutor_id: string }>("select tutor_id from public.buscar_tutor_balcao($1, '+5511988880002')", [LOJA.moema]);
      expect(visiveis.map((t) => t.tutor_id)).toEqual([TUTOR.bruno]);
      const lia = await db.rows<{ pets: { id: string }[] }>("select pets from public.buscar_tutor_balcao($1, '+5511977773333')", [LOJA.moema]);
      expect(lia[0].pets.map((p) => p.id)).toEqual([pet]);

      // Consentimento é por loja: só é gravado quando informado.
      await db.comoSuperusuario();
      expect(
        await db.rows("select petshop_id, consentimento_contato_em is not null as ok from public.tutor_petshop where tutor_id = $1 order by petshop_id", [novo]),
      ).toEqual([
        { petshop_id: LOJA.centro, ok: false },
        { petshop_id: LOJA.moema, ok: false },
      ]);
    });
  });

  it("pet só para clientes da loja e só pela equipe de operação", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      expect(await db.erro("select public.cadastrar_pet_balcao($1, $2, 'X', 'mini', 'curta')", [LOJA.centro, TUTOR.bruno])).toBe("AG002");
      await db.como(paula);
      expect(await db.erro("select public.cadastrar_pet_balcao($1, $2, 'X', 'mini', 'curta')", [LOJA.centro, TUTOR.ana])).toBe("42501");
      expect(await db.erro("select public.cadastrar_tutor_balcao($1, 'X', '+5511977771111')", [LOJA.centro])).toBe("42501");
      await db.como(usuario(USUARIO.anaTutora));
      expect(await db.erro("select public.cadastrar_tutor_balcao($1, 'X', '+5511977771111')", [LOJA.centro])).toBe("42501");
      await db.como(ANON);
      expect(await db.erro("select public.buscar_tutor_balcao($1, '+5511988880001')", [LOJA.centro])).toBe("42501");
    });
  });

  it("a equipe agenda para o cliente do balcão pelo canal informado", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      const servico = await banho(db);
      const c = await cadastrarCliente(db, "Joana", "+5511977772222");
      const r = await agendar(db, { ...c, servico, inicio: as("16:00", somarDias(DIA, 7)), canal: "whatsapp" });
      expect(r.erro).toBeUndefined();
      const [p] = await db.rows("select canal, criado_por_tipo from public.pedido where id = $1", [r.resumo!.pedido_id]);
      expect(p).toEqual({ canal: "whatsapp", criado_por_tipo: "equipe" });
      // A ficha do pet guarda observações da loja.
      expect(await db.erro("insert into public.pet_petshop (petshop_id, pet_id, observacoes) values ($1, $2, 'medroso')", [LOJA.centro, c.pet])).toBeNull();
      await db.como(paula);
      expect(await db.erro("update public.pet_petshop set observacoes = 'x' where pet_id = $1", [PET.thor])).toBeNull();
      expect(await db.rows("select observacoes from public.pet_petshop where pet_id = $1", [PET.thor])).toEqual([{ observacoes: "Não gosta de secador." }]);
    });
  });
});
