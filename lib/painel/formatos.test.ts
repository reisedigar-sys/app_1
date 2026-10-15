import { describe, expect, it } from "vitest";
import { centavosParaReais, reaisParaCentavos, slugify, telefoneLegivel, telefoneParaE164 } from "./formatos";

describe("formatos", () => {
  it("converte reais em centavos", () => {
    expect(reaisParaCentavos("50")).toBe(5000);
    expect(reaisParaCentavos("50,5")).toBe(5050);
    expect(reaisParaCentavos("R$ 1.234,56")).toBe(123456);
    // Teclado numérico só com ponto: "45.90" é R$ 45,90, não R$ 4.590,00.
    expect(reaisParaCentavos("45.90")).toBe(4590);
    expect(reaisParaCentavos("45.9")).toBe(4590);
    expect(reaisParaCentavos("1.234")).toBe(123400);
    expect(reaisParaCentavos("1.234.567")).toBe(123456700);
    expect(reaisParaCentavos("45,999")).toBeNull();
    expect(reaisParaCentavos("4,5,6")).toBeNull();
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
    expect(telefoneLegivel("+5511988880001")).toBe("(11) 98888-0001");
    expect(telefoneLegivel("+551133334444")).toBe("(11) 3333-4444");
  });
});
