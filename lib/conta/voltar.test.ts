import { describe, expect, it } from "vitest";
import { caminhoSeguro } from "./voltar";

describe("caminhoSeguro", () => {
  it("aceita só caminhos internos", () => {
    expect(caminhoSeguro("/pet-feliz-centro/agendar")).toBe("/pet-feliz-centro/agendar");
    expect(caminhoSeguro("https://golpe.com")).toBe("/conta");
    expect(caminhoSeguro("//golpe.com")).toBe("/conta");
    expect(caminhoSeguro("/\\golpe.com")).toBe("/conta");
    expect(caminhoSeguro(undefined, "/x")).toBe("/x");
  });
});
