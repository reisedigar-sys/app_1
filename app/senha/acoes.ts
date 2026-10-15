"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { type Estado, dadosDoForm, errosDeValidacao } from "@/lib/painel/estado";
import { createClient } from "@/lib/supabase/server";

const para = z.enum(["tutor", "equipe"]).catch("tutor");

/** Endereço do app nesta requisição (Vercel e local), para o link do e-mail voltar para o mesmo ambiente. */
async function origem() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocolo = h.get("x-forwarded-proto") ?? (host?.startsWith("127.0.0.1") || host?.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

export async function pedirNovaSenha(_: Estado, form: FormData): Promise<Estado> {
  const dados = z
    .object({ email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.")), para })
    .safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const supabase = await createClient();
  const destino = `/senha/nova?para=${dados.data.para}`;
  const { error } = await supabase.auth.resetPasswordForEmail(dados.data.email, {
    redirectTo: `${await origem()}/auth/confirmar?next=${encodeURIComponent(destino)}`,
  });
  if (error?.code === "over_email_send_rate_limit") return { ok: false, mensagem: "Já enviamos um link há pouco. Espere alguns minutos e tente de novo." };
  if (error) return { ok: false, mensagem: "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos." };
  // A mesma resposta com ou sem conta: a tela não revela quais e-mails estão cadastrados.
  return { ok: true, mensagem: "Se houver uma conta com esse e-mail, você vai receber um link para criar a nova senha. Confira também o spam." };
}

export async function salvarNovaSenha(_: Estado, form: FormData): Promise<Estado> {
  const dados = z
    .object({
      senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
      confirmacao: z.string(),
      para,
    })
    .refine((d) => d.senha === d.confirmacao, { path: ["confirmacao"], message: "As duas senhas precisam ser iguais." })
    .safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: dados.data.senha });
  if (error?.code === "same_password") return { ok: false, erros: { senha: "Use uma senha diferente da anterior." } };
  if (error?.code === "weak_password") return { ok: false, erros: { senha: "Essa senha é fácil de adivinhar. Escolha outra." } };
  if (error) return { ok: false, mensagem: "O link expirou ou já foi usado. Peça um novo em “Esqueci a senha”." };
  return { ok: true, destino: dados.data.para === "equipe" ? "/painel" : "/conta" };
}
