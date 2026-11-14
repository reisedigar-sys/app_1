import { describe, expect, it } from "vitest";
import { diaDaSemana, semana, textoSituacao } from "./funcionamento";

const FUSO = "America/Sao_Paulo";
// Terça, 10:00 em São Paulo.
const AGORA = new Date("2027-06-01T13:00:00Z");

describe("textoSituacao", () => {
  it("aberta: diz quando fecha hoje", () => {
    expect(textoSituacao({ aberto: true, fechaEm: "2027-06-01T21:00:00Z", abreEm: null }, FUSO, AGORA)).toEqual({ titulo: "Aberto agora", detalhe: "fecha às 18:00" });
  });

  it("fechada: abre hoje, amanhã ou no dia da semana", () => {
    expect(textoSituacao({ aberto: false, fechaEm: null, abreEm: "2027-06-01T16:00:00Z" }, FUSO, AGORA).detalhe).toBe("abre hoje às 13:00");
    expect(textoSituacao({ aberto: false, fechaEm: null, abreEm: "2027-06-02T12:00:00Z" }, FUSO, AGORA).detalhe).toBe("abre amanhã às 09:00");
    expect(textoSituacao({ aberto: false, fechaEm: null, abreEm: "2027-06-04T12:00:00Z" }, FUSO, AGORA).detalhe).toBe("abre sexta às 09:00");
  });

  it("perto da meia-noite usa o dia da loja, não o UTC", () => {
    // Terça 22:30 em São Paulo (quarta 01:30 UTC); abre quarta 09:00 = amanhã.
    expect(textoSituacao({ aberto: false, fechaEm: null, abreEm: "2027-06-02T12:00:00Z" }, FUSO, new Date("2027-06-02T01:30:00Z")).detalhe).toBe("abre amanhã às 09:00");
  });

  it("fechada sem previsão de abrir", () => {
    expect(textoSituacao({ aberto: false, fechaEm: null, abreEm: null }, FUSO, AGORA)).toEqual({ titulo: "Fechado", detalhe: null });
  });
});

describe("semana", () => {
  it("segunda primeiro, faixas em ordem", () => {
    const s = semana([
      { dia_semana: 2, abre: "13:00:00", fecha: "18:00:00" },
      { dia_semana: 2, abre: "08:00:00", fecha: "12:00:00" },
    ]);
    expect(s.map((d) => d.dia)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(s[1].faixas).toEqual(["08:00–12:00", "13:00–18:00"]);
    expect(s[0].faixas).toEqual([]);
  });

  it("dia da semana no fuso da loja", () => {
    expect(diaDaSemana(FUSO, new Date("2027-06-02T01:30:00Z"))).toBe(2);
  });
});
