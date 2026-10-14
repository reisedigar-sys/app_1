import { describe, expect, it } from "vitest";
import { mascaraData, nascimentoDeIso, nascimentoParaIso } from "./data-nascimento";

const hoje = new Date("2026-10-14T12:00:00Z");

describe("data de nascimento", () => {
  it("máscara enquanto digita", () => {
    expect(mascaraData("1")).toBe("1");
    expect(mascaraData("150")).toBe("15/0");
    expect(mascaraData("15032020")).toBe("15/03/2020");
    expect(mascaraData("15/03/2020999")).toBe("15/03/2020");
    expect(mascaraData("ab")).toBe("");
  });
  it("converte para ISO", () => {
    expect(nascimentoParaIso("15/03/2020", hoje)).toBe("2020-03-15");
    expect(nascimentoParaIso("29/02/2024", hoje)).toBe("2024-02-29");
    expect(nascimentoParaIso("14/10/2026", hoje)).toBe("2026-10-14");
  });
  it("recusa datas inválidas, futuras ou antigas demais", () => {
    expect(nascimentoParaIso("31/02/2020", hoje)).toBeNull();
    expect(nascimentoParaIso("29/02/2023", hoje)).toBeNull();
    expect(nascimentoParaIso("15/13/2020", hoje)).toBeNull();
    expect(nascimentoParaIso("15/03/20", hoje)).toBeNull();
    expect(nascimentoParaIso("15/10/2026", hoje)).toBeNull();
    expect(nascimentoParaIso("01/01/1980", hoje)).toBeNull();
  });
  it("volta para DD/MM/AAAA", () => {
    expect(nascimentoDeIso("2020-03-15")).toBe("15/03/2020");
    expect(nascimentoDeIso(null)).toBe("");
  });
});
