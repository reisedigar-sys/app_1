import { describe, expect, it } from "vitest";
import {
  CHAVES,
  ehPrecoUnico,
  gradeVazia,
  mesmaGrade,
  normalizarPreco,
  preencherTodas,
  primeiraPreenchida,
} from "./precos";

describe("tabela de preços", () => {
  it("tem as 15 combinações de porte e pelagem", () => {
    expect(CHAVES).toHaveLength(15);
    expect(Object.keys(gradeVazia())).toEqual(CHAVES);
  });

  it("preencher todas aplica só os campos informados", () => {
    const g = { ...gradeVazia(), "mini.curta": { preco: "40,00", duracao: "30" } };
    const soDuracao = preencherTodas(g, "", "45");
    expect(soDuracao["mini.curta"]).toEqual({ preco: "40,00", duracao: "45" });
    expect(soDuracao["gigante.longa"]).toEqual({ preco: "", duracao: "45" });
    const tudo = preencherTodas(g, "50,00", "60");
    expect(CHAVES.every((k) => tudo[k].preco === "50,00" && tudo[k].duracao === "60")).toBe(true);
  });

  it("reconhece preço único (mesmo valor escrito de outro jeito também conta)", () => {
    expect(ehPrecoUnico(gradeVazia())).toBe(false);
    const unica = preencherTodas(gradeVazia(), "25,00", "15");
    expect(ehPrecoUnico(unica)).toBe(true);
    expect(ehPrecoUnico({ ...unica, "medio.media": { preco: "25", duracao: "15" } })).toBe(true);
    expect(ehPrecoUnico({ ...unica, "medio.media": { preco: "30,00", duracao: "15" } })).toBe(false);
    expect(ehPrecoUnico({ ...unica, "medio.media": { preco: "", duracao: "" } })).toBe(false);
  });

  it("primeira combinação preenchida serve de base", () => {
    expect(primeiraPreenchida(gradeVazia())).toEqual({ preco: "", duracao: "" });
    expect(primeiraPreenchida({ ...gradeVazia(), "medio.curta": { preco: "70,00", duracao: "60" } })).toEqual({
      preco: "70,00",
      duracao: "60",
    });
  });

  it("compara tabelas para saber se há alteração não salva", () => {
    const a = preencherTodas(gradeVazia(), "50,00", "60");
    expect(mesmaGrade(a, { ...a })).toBe(true);
    expect(mesmaGrade(a, { ...a, "mini.curta": { preco: "51,00", duracao: "60" } })).toBe(false);
  });

  it("mostra o preço como será salvo", () => {
    expect(normalizarPreco("45.9")).toBe("45,90");
    expect(normalizarPreco("50")).toBe("50,00");
    expect(normalizarPreco("abc")).toBe("abc");
    expect(normalizarPreco("")).toBe("");
  });
});
