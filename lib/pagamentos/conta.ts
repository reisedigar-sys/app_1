import { z } from "zod";
import { reaisParaCentavos } from "@/lib/painel/formatos";

// Formulário "Abrir conta de recebimento" (Configurar → Pagamentos) e regra do sinal. Sem acesso a banco.

const digitos = (v: unknown) => (typeof v === "string" ? v.replace(/\D/g, "") : v);

/** Dígitos verificadores de CPF (11) ou CNPJ (14). */
export function documentoValido(doc: string): boolean {
  if (!/^\d+$/.test(doc) || /^(\d)\1+$/.test(doc)) return false;
  const dv = (base: string, pesos: number[]) => {
    const soma = pesos.reduce((s, p, i) => s + Number(base[i]) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  if (doc.length === 11) {
    const d1 = dv(doc, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = dv(doc, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d1 === Number(doc[9]) && d2 === Number(doc[10]);
  }
  if (doc.length === 14) {
    const d1 = dv(doc, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = dv(doc, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d1 === Number(doc[12]) && d2 === Number(doc[13]);
  }
  return false;
}

const texto = (max: number, msg: string) => z.string().trim().min(1, msg).max(max);

export const contaSchema = z
  .object({
    tipo: z.enum(["cnpj", "cpf"]),
    cpf_cnpj: z.preprocess(digitos, z.string().refine(documentoValido, "Confira o CNPJ ou CPF.")),
    nome: texto(120, "Informe o nome ou a razão social."),
    email: z.email("E-mail inválido."),
    celular: z.preprocess(digitos, z.string().regex(/^\d{10,11}$/, "Celular com DDD.")),
    nascimento: z.preprocess((v) => (v === "" ? undefined : v), z.iso.date("Data inválida.").optional()),
    tipo_empresa: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"]).optional()),
    faturamento: z.string().transform((v, ctx) => {
      const c = reaisParaCentavos(v);
      if (c === null || c <= 0) {
        ctx.addIssue({ code: "custom", message: "Informe o faturamento médio por mês." });
        return z.NEVER;
      }
      return c;
    }),
    cep: z.preprocess(digitos, z.string().regex(/^\d{8}$/, "CEP com 8 dígitos.")),
    endereco: texto(120, "Informe a rua."),
    numero: texto(20, "Informe o número."),
    complemento: z.string().trim().max(60).optional(),
    bairro: texto(60, "Informe o bairro."),
  })
  .superRefine((d, ctx) => {
    if (d.tipo === "cpf" && d.cpf_cnpj.length !== 11) ctx.addIssue({ code: "custom", path: ["cpf_cnpj"], message: "CPF com 11 dígitos." });
    if (d.tipo === "cnpj" && d.cpf_cnpj.length !== 14) ctx.addIssue({ code: "custom", path: ["cpf_cnpj"], message: "CNPJ com 14 dígitos." });
    if (d.tipo === "cpf" && !d.nascimento) ctx.addIssue({ code: "custom", path: ["nascimento"], message: "Informe a data de nascimento." });
    if (d.tipo === "cnpj" && !d.tipo_empresa) ctx.addIssue({ code: "custom", path: ["tipo_empresa"], message: "Escolha o tipo de empresa." });
  })
  .transform(({ faturamento, ...d }) => ({ ...d, faturamento_centavos: faturamento, complemento: d.complemento || undefined }));

export const sinalSchema = z
  .object({
    modo: z.enum(["nunca", "faltas", "todos"]),
    tipo: z.enum(["percentual", "fixo"]),
    percentual: z.string().optional(),
    fixo: z.string().optional(),
  })
  .transform((d, ctx) => {
    if (d.modo === "nunca") return { modo: d.modo, tipo: d.tipo, percentual: null, fixoCentavos: null };
    if (d.tipo === "percentual") {
      const p = Number(String(d.percentual ?? "").replace(",", ".").trim());
      if (!Number.isFinite(p) || p < 1 || p > 100) {
        ctx.addIssue({ code: "custom", path: ["percentual"], message: "De 1% a 100%." });
        return z.NEVER;
      }
      return { modo: d.modo, tipo: d.tipo, percentual: Math.round(p * 100) / 100, fixoCentavos: null };
    }
    const c = reaisParaCentavos(d.fixo ?? "");
    if (c === null || c < 100) {
      ctx.addIssue({ code: "custom", path: ["fixo"], message: "Informe o valor por pet (a partir de R$ 1,00)." });
      return z.NEVER;
    }
    return { modo: d.modo, tipo: d.tipo, percentual: null, fixoCentavos: c };
  });
