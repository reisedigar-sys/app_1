import { describe, expect, it } from "vitest";
import { formatarPeriodo, lerPeriodo } from "./periodo";

describe("período", () => {
  it("lê o tstzrange do PostgREST", () => {
    const p = lerPeriodo('["2030-01-08 15:00:00+00","2030-01-08 16:00:00+00")');
    expect(p.inicio.toISOString()).toBe("2030-01-08T15:00:00.000Z");
    expect(p.fim.toISOString()).toBe("2030-01-08T16:00:00.000Z");
  });

  it("formata no fuso da loja", () => {
    const p = lerPeriodo('["2030-01-08 15:00:00+00","2030-01-08 16:00:00+00")');
    expect(formatarPeriodo(p, "America/Sao_Paulo")).toBe("ter 08/01, 12:00–13:00");
    expect(formatarPeriodo(p, "America/Manaus")).toBe("ter 08/01, 11:00–12:00");
  });

  it("mostra dias inteiros sem hora", () => {
    const um = lerPeriodo('["2030-01-08 03:00:00+00","2030-01-09 03:00:00+00")');
    expect(formatarPeriodo(um, "America/Sao_Paulo")).toBe("ter 08/01 (dia inteiro)");
    const tres = lerPeriodo('["2030-01-08 03:00:00+00","2030-01-11 03:00:00+00")');
    expect(formatarPeriodo(tres, "America/Sao_Paulo")).toBe("ter 08/01 a qui 10/01 (dias inteiros)");
  });
});
