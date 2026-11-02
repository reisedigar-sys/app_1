import { describe, expect, it } from "vitest";
import { fraseSinal, politicaCancelamento, seloSinal } from "./sinal";

describe("textos do sinal", () => {
  it("política de cancelamento diz se o sinal volta ou fica", () => {
    expect(politicaCancelamento({ gratuito: true, ate: "sex 07/11 10:00", sinalCentavos: 1500 })).toMatch(/até sex 07\/11 10:00\. Cancelando agora, o sinal de R\$\s15,00 volta para você por Pix\.$/);
    expect(politicaCancelamento({ gratuito: false, ate: "x", sinalCentavos: 1500 })).toMatch(/o sinal de R\$\s15,00 fica com a loja\.$/);
    expect(politicaCancelamento({ gratuito: true, ate: "sex 07/11 10:00" })).toBe("Cancelamento gratuito até sex 07/11 10:00.");
    expect(politicaCancelamento({ gratuito: false, ate: "x", sinalCentavos: null })).toBe("O prazo de cancelamento gratuito da loja já passou.");
  });

  it("selos e frases por situação", () => {
    expect(seloSinal("aguardando")?.texto).toBe("aguardando Pix");
    expect(seloSinal("abatido")).toBeNull();
    expect(seloSinal(null)).toBeNull();
    expect(fraseSinal("aguardando", 1000, "tutor")).toBeNull();
    expect(fraseSinal("retido", 1000, "tutor")).toMatch(/ficou com a loja/);
    expect(fraseSinal("pago", 1000, "loja")).toMatch(/Desconte do valor na loja/);
  });
});
