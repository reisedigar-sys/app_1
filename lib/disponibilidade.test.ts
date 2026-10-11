import { describe, expect, it } from "vitest";
import { ErroAgendamento, erroDeAgendamento } from "./disponibilidade";

describe("erroDeAgendamento", () => {
  it("traduz os códigos do banco", () => {
    expect(erroDeAgendamento({ code: "AG001" }).codigo).toBe("horario_indisponivel");
    expect(erroDeAgendamento({ code: "AG003" }).message).toBe("A loja não atende esse serviço para o porte e a pelagem do pet.");
    expect(erroDeAgendamento({ code: "42501" }).codigo).toBe("sem_permissao");
    const desconhecido = erroDeAgendamento({ code: "XX000", message: "boom" });
    expect(desconhecido).toBeInstanceOf(ErroAgendamento);
    expect(desconhecido.codigo).toBe("erro");
    expect(desconhecido.detalhe).toBe("boom");
  });
});
