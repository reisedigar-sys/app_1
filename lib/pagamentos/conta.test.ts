import { describe, expect, it } from "vitest";
import { contaSchema, documentoValido, sinalSchema } from "./conta";

const base = {
  tipo: "cnpj",
  cpf_cnpj: "11.222.333/0001-81",
  nome: "Pet Feliz Ltda",
  email: "financeiro@petfeliz.test",
  celular: "(11) 98888-0001",
  nascimento: "",
  tipo_empresa: "LIMITED",
  faturamento: "20.000,00",
  cep: "01310-100",
  endereco: "Av. Paulista",
  numero: "1000",
  complemento: "",
  bairro: "Bela Vista",
};

describe("documentoValido", () => {
  it("confere os dígitos de CPF e CNPJ", () => {
    expect(documentoValido("11222333000181")).toBe(true);
    expect(documentoValido("11222333000182")).toBe(false);
    expect(documentoValido("52998224725")).toBe(true);
    expect(documentoValido("52998224724")).toBe(false);
    expect(documentoValido("11111111111")).toBe(false);
    expect(documentoValido("123")).toBe(false);
  });
});

describe("contaSchema", () => {
  it("limpa máscaras e converte o faturamento", () => {
    const r = contaSchema.parse(base);
    expect(r).toMatchObject({ cpf_cnpj: "11222333000181", celular: "11988880001", cep: "01310100", faturamento_centavos: 2_000_000 });
    expect(r.complemento).toBeUndefined();
  });

  it("CPF exige data de nascimento; CNPJ exige o tipo de empresa", () => {
    const cpf = contaSchema.safeParse({ ...base, tipo: "cpf", cpf_cnpj: "529.982.247-25", tipo_empresa: "" });
    expect(cpf.success).toBe(false);
    expect(cpf.error?.issues.map((i) => i.path[0])).toContain("nascimento");
    const cnpj = contaSchema.safeParse({ ...base, tipo_empresa: "" });
    expect(cnpj.error?.issues.map((i) => i.path[0])).toContain("tipo_empresa");
    expect(contaSchema.safeParse({ ...base, tipo: "cpf", cpf_cnpj: "52998224725", nascimento: "1990-05-01", tipo_empresa: "" }).success).toBe(true);
  });
});

describe("sinalSchema", () => {
  it("percentual com vírgula, valor fixo em reais e 'nunca' sem valores", () => {
    expect(sinalSchema.parse({ modo: "todos", tipo: "percentual", percentual: "30,5" })).toEqual({ modo: "todos", tipo: "percentual", percentual: 30.5, fixoCentavos: null });
    expect(sinalSchema.parse({ modo: "faltas", tipo: "fixo", fixo: "25.90" })).toEqual({ modo: "faltas", tipo: "fixo", percentual: null, fixoCentavos: 2590 });
    expect(sinalSchema.parse({ modo: "nunca", tipo: "percentual", percentual: "abc" }).modo).toBe("nunca");
    expect(sinalSchema.safeParse({ modo: "todos", tipo: "percentual", percentual: "0" }).success).toBe(false);
    expect(sinalSchema.safeParse({ modo: "todos", tipo: "fixo", fixo: "" }).success).toBe(false);
  });
});
