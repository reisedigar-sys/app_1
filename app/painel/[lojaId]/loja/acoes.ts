"use server";

import { z } from "zod";
import { prefixoDasFotos } from "@/lib/app-da-loja";
import { supabaseUrl } from "@/lib/supabase/env";
import { SEM_PERMISSAO, checkbox, iniciarAcao, opcional, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, dadosDoForm, errosDeValidacao } from "@/lib/painel/estado";
import { telefoneParaE164 } from "@/lib/painel/formatos";

const inteiro = (min: number, max: number, msg: string) => z.coerce.number().int(msg).min(min, msg).max(max, msg);

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da loja."),
  logo_url: opcional(z.url("Logo inválido.").refine((u) => u.startsWith(prefixoDasFotos(supabaseUrl())), "Envie o logo pelo botão.")),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífens."),
  telefone: opcional(
    z
      .string()
      .transform((t) => telefoneParaE164(t))
      .refine((t) => t !== null, "Telefone inválido. Ex.: (11) 3333-4444."),
  ),
  logradouro: opcional(z.string().trim()),
  numero: opcional(z.string().trim()),
  bairro: opcional(z.string().trim()),
  cidade: opcional(z.string().trim()),
  uf: opcional(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "UF com 2 letras.")),
  cep: opcional(z.string().transform((c) => c.replace(/\D/g, "")).pipe(z.string().length(8, "CEP com 8 dígitos."))),
  latitude: opcional(z.coerce.number().min(-90, "Latitude inválida.").max(90, "Latitude inválida.")),
  longitude: opcional(z.coerce.number().min(-180, "Longitude inválida.").max(180, "Longitude inválida.")),
  fuso: z.string().min(1),
  slot_minutos: z.coerce.number().refine((v) => [5, 10, 15, 20, 30, 60].includes(v), "Intervalo inválido."),
  buffer_minutos: inteiro(0, 120, "Entre 0 e 120 minutos."),
  antecedencia_minima_minutos: inteiro(0, 10080, "Entre 0 e 10080 minutos."),
  janela_maxima_dias: inteiro(1, 365, "Entre 1 e 365 dias."),
  cancelamento_gratuito_horas: inteiro(0, 720, "Entre 0 e 720 horas."),
  sinal_percentual: z.coerce.number().min(0, "Entre 0 e 100.").max(100, "Entre 0 e 100."),
  limite_faltas: inteiro(0, 50, "Entre 0 e 50."),
  lembrete_d1_hora: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Informe a hora.")
    .refine((h) => h >= "08:00" && h <= "21:00", "Entre 08:00 e 21:00 (nada de madrugada)."),
  lembrete_antes_horas: inteiro(0, 24, "Entre 0 e 24 horas."),
  confirmar_ate_horas: inteiro(0, 72, "Entre 0 e 72 horas."),
  acao_sem_confirmacao: z.enum(["avisar_loja", "liberar_horario"]),
  ativo: checkbox,
});

export async function salvarLoja(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = schema.safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const { telefone, ...resto } = dados.data;

  const { data, error } = await supabase
    .from("petshop")
    .update({ ...resto, telefone_e164: telefone })
    .eq("id", lojaId)
    .select("id");
  if (error) {
    const duplicado = "Esse endereço (slug) já está em uso por outra loja.";
    return { ok: false, mensagem: mensagemDeErro(error, { duplicado }), erros: error.code === "23505" ? { slug: duplicado } : undefined };
  }
  if (!data?.length) return SEM_PERMISSAO;
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Dados da loja salvos." };
}
