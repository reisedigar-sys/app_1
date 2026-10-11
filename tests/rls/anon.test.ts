import { describe, expect, it } from "vitest";
import { ANON, emTransacao } from "../helpers/db";
import { LOJA, PROFISSIONAL } from "../helpers/ids";

describe("visitante (catálogo público)", () => {
  it("lê lojas ativas, serviços, preços e profissionais ativos", async () => {
    await emTransacao(async (db) => {
      await db.como(ANON);
      expect(await db.count("select 1 from public.petshop")).toBe(3);
      expect(await db.count("select 1 from public.rede")).toBe(2);
      expect(await db.count("select 1 from public.servico where petshop_id = $1", [LOJA.centro])).toBe(6);
      expect(await db.count("select 1 from public.servico_preco where petshop_id = $1", [LOJA.centro])).toBe(90);
      expect(await db.count("select 1 from public.profissional where petshop_id = $1", [LOJA.centro])).toBe(3);
    });
  });

  it("não lê tabelas fora do catálogo (inclusive as sem petshop_id)", async () => {
    await emTransacao(async (db) => {
      await db.como(ANON);
      for (const t of ["tutor", "pet", "rede_membro", "petshop_membro"]) {
        expect(await db.count(`select 1 from public.${t}`), t).toBe(0);
      }
    });
  });

  it("loja inativa e profissional inativo somem do catálogo", async () => {
    await emTransacao(async (db) => {
      await db.query("update public.petshop set ativo = false where id = $1", [LOJA.zonaSul]);
      await db.query("update public.profissional set ativo = false where id = $1", [PROFISSIONAL.paula]);
      await db.query("update public.servico set ativo = false where petshop_id = $1 and nome = 'Hidratação'", [LOJA.centro]);
      await db.como(ANON);
      expect(await db.count("select 1 from public.petshop where id = $1", [LOJA.zonaSul])).toBe(0);
      expect(await db.count("select 1 from public.servico where petshop_id = $1", [LOJA.zonaSul])).toBe(0);
      expect(await db.count("select 1 from public.servico_preco where petshop_id = $1", [LOJA.zonaSul])).toBe(0);
      expect(await db.count("select 1 from public.profissional where id = $1", [PROFISSIONAL.paula])).toBe(0);
      expect(await db.count("select 1 from public.servico where petshop_id = $1", [LOJA.centro])).toBe(5);
    });
  });

  it("rede inativa tira todas as suas lojas do catálogo", async () => {
    await emTransacao(async (db) => {
      await db.query("update public.rede set ativo = false where id = '10000000-0000-0000-0000-000000000002'");
      await db.como(ANON);
      expect(await db.count("select 1 from public.petshop where id = $1", [LOJA.moema])).toBe(0);
    });
  });
});
