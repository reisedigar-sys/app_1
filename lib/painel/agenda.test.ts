import { describe, expect, it } from "vitest";
import { acaoRapida, acoesDeStatus, dataNoFuso, desfazer, faixaDoDia, inicioDaSemana, minutosNoFuso, passaNoFiltro } from "./agenda";

describe("ações de status", () => {
  const status = (s: Parameters<typeof acoesDeStatus>[0], operacao = true, jaComecou = false) =>
    acoesDeStatus(s, { operacao, jaComecou }).map((a) => a.status);

  it("segue agendado → confirmado → em atendimento → pronto → concluído", () => {
    expect(status("agendado")).toEqual(["confirmado", "em_atendimento"]);
    expect(status("confirmado")).toEqual(["em_atendimento"]);
    expect(status("em_atendimento")).toEqual(["pronto", "concluido"]);
    expect(status("pronto")).toEqual(["concluido"]);
    expect(status("concluido")).toEqual([]);
    expect(status("cancelado")).toEqual([]);
  });

  it("falta só aparece depois do horário de início", () => {
    expect(status("confirmado", true, false)).not.toContain("faltou");
    expect(status("confirmado", true, true)).toContain("faltou");
    expect(status("faltou")).toEqual(["agendado"]);
  });

  it("a profissional só conduz o atendimento", () => {
    expect(status("agendado", false, true)).toEqual(["em_atendimento"]);
    expect(status("faltou", false)).toEqual([]);
  });
});

describe("filtro de status", () => {
  it("ativos esconde só os cancelados", () => {
    expect(passaNoFiltro("cancelado", "ativos")).toBe(false);
    expect(passaNoFiltro("faltou", "ativos")).toBe(true);
    expect(passaNoFiltro("cancelado", "todos")).toBe(true);
    expect(passaNoFiltro("agendado", "confirmado")).toBe(false);
  });
});

describe("datas no fuso da loja", () => {
  it("usa a data e a hora locais", () => {
    expect(dataNoFuso("2030-01-08T02:30:00Z", "America/Sao_Paulo")).toBe("2030-01-07");
    expect(minutosNoFuso("2030-01-08T13:15:00Z", "America/Sao_Paulo")).toBe(10 * 60 + 15);
  });

  it("a semana começa na segunda", () => {
    expect(inicioDaSemana("2030-01-08")).toBe("2030-01-07"); // terça → segunda
    expect(inicioDaSemana("2030-01-13")).toBe("2030-01-07"); // domingo → segunda anterior
    expect(inicioDaSemana("2030-01-07")).toBe("2030-01-07");
  });

  it("faixa do dia em horas cheias", () => {
    expect(faixaDoDia([])).toEqual({ inicio: 480, fim: 1140 });
    expect(faixaDoDia([{ inicio: 9 * 60 + 10, fim: 17 * 60 + 5 }, { inicio: 10 * 60, fim: 18 * 60 }])).toEqual({ inicio: 540, fim: 1080 });
  });
});

describe("ação rápida da lista", () => {
  const rapida = (s: Parameters<typeof acaoRapida>[0], operacao = true, ehHoje = true) => acaoRapida(s, { operacao, ehHoje })?.status ?? null;

  it("põe o próximo passo a um toque; iniciar e entregar só no dia", () => {
    expect(rapida("agendado")).toBe("confirmado");
    expect(rapida("confirmado")).toBe("em_atendimento");
    expect(rapida("confirmado", true, false)).toBeNull();
    expect(rapida("em_atendimento")).toBe("pronto");
    expect(rapida("pronto")).toBe("concluido");
    expect(rapida("concluido")).toBeNull();
    expect(rapida("cancelado")).toBeNull();
  });

  it("a profissional não confirma: no dia, inicia direto", () => {
    expect(rapida("agendado", false)).toBe("em_atendimento");
    expect(rapida("agendado", false, false)).toBeNull();
  });

  it("desfazer só volta um passo que o banco aceita", () => {
    expect(desfazer("agendado", "confirmado", { operacao: true })).toBe("agendado");
    expect(desfazer("confirmado", "em_atendimento", { operacao: true })).toBe("confirmado");
    expect(desfazer("agendado", "em_atendimento", { operacao: true })).toBeNull();
    expect(desfazer("pronto", "concluido", { operacao: false })).toBe("pronto");
    expect(desfazer("confirmado", "em_atendimento", { operacao: false })).toBeNull();
  });
});
