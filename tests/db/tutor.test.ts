import { describe, expect, it } from "vitest";
import { ANON, type Db, emTransacao, usuario } from "../helpers/db";
import { proximo } from "../helpers/datas";
import { AGENDAMENTO, LOJA, PET, PROFISSIONAL, TUTOR, USUARIO } from "../helpers/ids";

const ana = usuario(USUARIO.anaTutora);
const TER = proximo(2, 14);
const local = (data: string, hora: string) => `${data} ${hora}-03`;

async function servicos(db: Db, loja: string) {
  const rows = await db.rows<{ id: string; nome: string }>("select id, nome from public.servico where petshop_id = $1", [loja]);
  return Object.fromEntries(rows.map((r) => [r.nome, r.id])) as Record<string, string>;
}

describe("perfil do tutor", () => {
  it("cria e atualiza o próprio cadastro; telefone de outra conta é recusado", async () => {
    await emTransacao(async (db) => {
      await db.query(
        `insert into auth.users (instance_id, id, aud, role, email) values ('00000000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'carla@tutor.test')`,
      );
      const carla = usuario("b2000000-0000-0000-0000-000000000001");
      await db.como(ANON);
      expect(await db.erro("select public.salvar_perfil_tutor('X', '+5511977770000')")).toBe("42501");
      await db.como(carla);
      const [{ id }] = await db.rows<{ id: string }>("select public.salvar_perfil_tutor('Carla', '+5511977770000') as id");
      const [{ id: mesmo }] = await db.rows<{ id: string }>("select public.salvar_perfil_tutor('Carla Dias', '+5511977770001') as id");
      expect(mesmo).toBe(id);
      expect(await db.rows("select nome, telefone_e164, email from public.tutor where id = $1", [id])).toEqual([
        { nome: "Carla Dias", telefone_e164: "+5511977770001", email: "carla@tutor.test" },
      ]);
      // Telefone da Ana (conta) → recusado.
      expect(await db.erro("select public.salvar_perfil_tutor('Carla', '+5511988880001')")).toBe("23505");
    });
  });

  it("registra e retira o consentimento de contato e de marketing por loja", async () => {
    await emTransacao(async (db) => {
      await db.como(ana);
      await db.query("select public.registrar_consentimento($1, true, true)", [LOJA.zonaSul]);
      const ler = async () =>
        (
          await db.rows<{ contato: boolean; marketing: boolean }>(
            `select consentimento_contato_em is not null as contato, consentimento_marketing_em is not null as marketing
               from public.tutor_petshop where petshop_id = $1 and tutor_id = $2`,
            [LOJA.zonaSul, TUTOR.ana],
          )
        )[0];
      expect(await ler()).toEqual({ contato: true, marketing: true });
      await db.query("select public.registrar_consentimento($1, true, false)", [LOJA.zonaSul]);
      expect(await ler()).toEqual({ contato: true, marketing: false });
    });
  });
});

describe("unidades_para_pedido", () => {
  it("lista as unidades da mesma rede com o pedido traduzido e o preço de cada uma", async () => {
    await emTransacao(async (db) => {
      const centro = await servicos(db, LOJA.centro);
      const zonaSul = await servicos(db, LOJA.zonaSul);
      await db.como(ana);
      const itens = [{ pet_id: PET.mel, servicos: [centro["Banho"], centro["Hidratação"]] }];
      const r = await db.rows<{ petshop_id: string; itens: { pet_id: string; servicos: string[] }[]; total_centavos: number; distancia_km: string | null }>(
        "select * from public.unidades_para_pedido($1, $2::jsonb)",
        [LOJA.centro, JSON.stringify(itens)],
      );
      expect(r.map((u) => u.petshop_id)).toEqual([LOJA.centro, LOJA.zonaSul]); // Moema é de outra rede
      expect(r[0].total_centavos).toBe(5000 + 2500);
      expect(r[1].total_centavos).toBe(5500 + 2800); // preços da Zona Sul (seed: +10%)
      expect(r[1].itens).toEqual([{ pet_id: PET.mel, servicos: [zonaSul["Banho"], zonaSul["Hidratação"]] }]);
    });
  });

  it("ordena pela distância e tira quem não tem o serviço", async () => {
    await emTransacao(async (db) => {
      const centro = await servicos(db, LOJA.centro);
      const itens = JSON.stringify([{ porte: "pequeno", pelagem: "curta", servicos: [centro["Banho"], centro["Hidratação"]] }]);
      await db.como(ANON);
      // Perto do Brooklin (Zona Sul).
      const perto = await db.rows<{ petshop_id: string; distancia_km: string }>(
        "select petshop_id, distancia_km from public.unidades_para_pedido($1, $2::jsonb, -23.61, -46.69)",
        [LOJA.centro, itens],
      );
      expect(perto.map((u) => u.petshop_id)).toEqual([LOJA.zonaSul, LOJA.centro]);
      expect(Number(perto[0].distancia_km)).toBeLessThan(1);
      await db.comoSuperusuario();
      await db.query("update public.servico set ativo = false where petshop_id = $1 and nome = 'Hidratação'", [LOJA.zonaSul]);
      await db.como(ANON);
      const sem = await db.rows<{ petshop_id: string }>("select petshop_id from public.unidades_para_pedido($1, $2::jsonb)", [LOJA.centro, itens]);
      expect(sem.map((u) => u.petshop_id)).toEqual([LOJA.centro]);
    });
  });
});

describe("profissionais com avaliação", () => {
  it("lista os aptos com a nota média (só quem tem avaliação tem nota)", async () => {
    await emTransacao(async (db) => {
      const centro = await servicos(db, LOJA.centro);
      await db.como(ana);
      const r = await db.rows<{ nome: string; nota_media: string | null; avaliacoes: number }>(
        "select nome, nota_media, avaliacoes from public.profissionais_aptos($1, $2::jsonb)",
        [LOJA.centro, JSON.stringify([{ pet_id: PET.mel, servicos: [centro["Tosa completa"]] }])],
      );
      expect(r).toEqual([
        { nome: "Paula", nota_media: "5.0", avaliacoes: 1 },
        { nome: "Júlia", nota_media: null, avaliacoes: 0 },
      ]);
    });
  });
});

describe("meus agendamentos, cancelar e remarcar", () => {
  it("o tutor vê os próprios agendamentos com loja, pet, profissional e serviços", async () => {
    await emTransacao(async (db) => {
      await db.como(ana);
      const r = await db.rows<{ pet_nome: string; loja_nome: string; servicos: string[] }>("select * from public.meus_agendamentos()");
      expect(r).toHaveLength(3);
      expect(r.some((a) => a.loja_nome === "Banho & Cia Moema" && a.pet_nome === "Mel")).toBe(true);
      expect(r.every((a) => a.servicos.length > 0)).toBe(true);
      await db.como(usuario(USUARIO.brunoTutor));
      expect((await db.rows<{ pet_nome: string }>("select pet_nome from public.meus_agendamentos()")).every((a) => ["Luna", "Bob"].includes(a.pet_nome))).toBe(true);
    });
  });

  it("cancelar: dentro do prazo é gratuito; cancela os lembretes; só o dono ou a equipe", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.brunoTutor));
      expect(await db.erro("select public.cancelar_agendamento($1)", [AGENDAMENTO.thorCentro])).toBe("AG002");
      await db.como(ana);
      const [{ r }] = await db.rows<{ r: { gratuito: boolean } }>("select public.cancelar_agendamento($1) as r", [AGENDAMENTO.thorCentro]);
      expect(r.gratuito).toBe(true); // daqui a 2 dias; prazo de 24 h
      expect(await db.erro("select public.cancelar_agendamento($1)", [AGENDAMENTO.thorCentro])).toBe("AG002"); // já cancelado
      await db.comoSuperusuario();
      expect(await db.rows("select status from public.agendamento where id = $1", [AGENDAMENTO.thorCentro])).toEqual([{ status: "cancelado" }]);
      expect(await db.count("select 1 from public.notificacao_agendada where agendamento_id = $1 and status = 'pendente'", [AGENDAMENTO.thorCentro])).toBe(0);
    });
  });

  it("cancelar fora do prazo gratuito ainda é permitido, mas é informado", async () => {
    await emTransacao(async (db) => {
      await db.query("update public.petshop set cancelamento_gratuito_horas = 200 where id = $1", [LOJA.centro]);
      await db.como(ana);
      const [{ r }] = await db.rows<{ r: { gratuito: boolean } }>("select public.cancelar_agendamento($1) as r", [AGENDAMENTO.thorCentro]);
      expect(r.gratuito).toBe(false);
    });
  });

  it("remarcar: pelo motor, ignorando o próprio horário, e recusando horário ocupado", async () => {
    await emTransacao(async (db) => {
      const centro = await servicos(db, LOJA.centro);
      await db.como(ana);
      const [{ r: pedido }] = await db.rows<{ r: { agendamentos: { id: string }[] } }>(
        `select public.criar_pedido($1, $2, $3::jsonb, $4::timestamptz, 'app_proprio', 'remarcar-1', $5) as r`,
        [LOJA.centro, TUTOR.ana, JSON.stringify([{ pet_id: PET.mel, servicos: [centro["Banho"]] }]), local(TER, "10:00"), PROFISSIONAL.paula],
      );
      const id = pedido.agendamentos[0].id;
      // 15 min depois: sobrepõe o próprio horário antigo, e mesmo assim é permitido.
      const [{ r }] = await db.rows<{ r: { profissional_id: string; fim: string } }>(
        "select public.remarcar_agendamento($1, $2::timestamptz) as r",
        [id, local(TER, "10:15")],
      );
      expect(r.profissional_id).toBe(PROFISSIONAL.paula); // mantém a profissional quando ela está livre
      expect(new Date(r.fim).toISOString()).toBe(new Date(local(TER, "11:00")).toISOString());
      // A Paula ocupada às 14h: remarcar com ela para 14h é recusado.
      await db.comoSuperusuario();
      await db.query(
        `insert into public.agendamento (petshop_id, pedido_id, tutor_id, pet_id, profissional_id, canal, inicio, fim, buffer_minutos)
         values ($1, '60000000-0000-0000-0000-000000000001', $2, $3, $4, 'balcao', $5, $6, 10)`,
        [LOJA.centro, TUTOR.ana, PET.thor, PROFISSIONAL.paula, local(TER, "14:00"), local(TER, "15:00")],
      );
      await db.como(ana);
      expect(await db.erro("select public.remarcar_agendamento($1, $2::timestamptz, $3)", [id, local(TER, "14:00"), PROFISSIONAL.paula])).toBe("AG001");
      // Sem profissional definido, outro profissional livre assume.
      const [{ r: outro }] = await db.rows<{ r: { profissional_id: string } }>("select public.remarcar_agendamento($1, $2::timestamptz) as r", [
        id,
        local(TER, "14:00"),
      ]);
      expect(outro.profissional_id).not.toBe(PROFISSIONAL.paula);
      // Outro tutor não remarca.
      await db.como(usuario(USUARIO.brunoTutor));
      expect(await db.erro("select public.remarcar_agendamento($1, $2::timestamptz)", [id, local(TER, "16:00")])).toBe("AG002");
    });
  });
});

describe("foto do pet e endereços reservados", () => {
  it("o tutor envia foto só para a própria pasta", async () => {
    await emTransacao(async (db) => {
      await db.como(ana);
      const sql = "insert into storage.objects (bucket_id, name, owner_id) values ('fotos', $1, $2)";
      expect(await db.erro(sql, [`tutores/${TUTOR.ana}/mel.jpg`, USUARIO.anaTutora])).toBeNull();
      expect(await db.erro(sql, [`tutores/${TUTOR.bruno}/x.jpg`, USUARIO.anaTutora])).toBe("42501");
      expect(await db.erro(sql, [`${LOJA.centro}/profissionais/x.jpg`, USUARIO.anaTutora])).toBe("42501");
    });
  });

  it("uma loja não pode usar o endereço de uma rota do app", async () => {
    await emTransacao(async (db) => {
      expect(await db.erro("update public.petshop set slug = 'painel' where id = $1", [LOJA.centro])).toBe("23514");
      expect(await db.erro("update public.petshop set slug = 'conta' where id = $1", [LOJA.centro])).toBe("23514");
    });
  });
});
