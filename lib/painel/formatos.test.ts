import { describe, expect, it } from "vitest";
import { centavosParaReais, reaisParaCentavos, slugify, telefoneParaE164 } from "./formatos";

describe("formatos", () => {
  it("converte reais em centavos", () => {
    expect(reaisParaCentavos("50")).toBe(5000);
    expect(reaisParaCentavos("50,5")).toBe(5050);
    expect(reaisParaCentavos("R$ 1.234,56")).toBe(123456);
    expect(reaisParaCentavos("")).toBeNull();
    expect(reaisParaCentavos("abc")).toBeNull();
    expect(reaisParaCentavos("-1")).toBeNull();
    expect(centavosParaReais(5050)).toBe("50,50");
  });

  it("gera slug", () => {
    expect(slugify("Banho & Cia — Moema")).toBe("banho-e-cia-moema");
    expect(slugify("  Pet Feliz São João  ")).toBe("pet-feliz-sao-joao");
  });

  it("normaliza telefone para E.164", () => {
    expect(telefoneParaE164("(11) 98888-0001")).toBe("+5511988880001");
    expect(telefoneParaE164("11 3333-4444")).toBe("+551133334444");
    expect(telefoneParaE164("+55 11 98888-0001")).toBe("+5511988880001");
    expect(telefoneParaE164("123")).toBeNull();
  });
});
