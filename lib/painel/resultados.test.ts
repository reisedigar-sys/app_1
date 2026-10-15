import { describe, expect, it } from "vitest";
import { ehMes, faltasEvitadas, nomeDoMes, percentual, somarMeses } from "./resultados";

describe("resultados", () => {
  it("estima faltas evitadas pela taxa de antes, nunca abaixo de zero", () => {
    // 15% de 40 atendimentos = 6 faltas esperadas; houve 2 → 4 evitadas.
    expect(faltasEvitadas(15, 38, 2)).toBe(4);
    expect(faltasEvitadas(5, 10, 3)).toBe(0);
    expect(faltasEvitadas(null, 38, 2)).toBeNull();
    expect(faltasEvitadas(15, 0, 0)).toBeNull();
  });

  it("percentual sem divisão por zero", () => {
    expect(percentual(1, 3)).toBe(33);
    expect(percentual(0, 0)).toBeNull();
  });

  it("navega entre meses e valida o parâmetro", () => {
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(ehMes("2026-10")).toBe(true);
    expect(ehMes("2026-13")).toBe(false);
    expect(nomeDoMes("2026-10")).toBe("outubro de 2026");
  });
});
