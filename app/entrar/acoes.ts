"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { type Estado, dadosDoForm, errosDeValidacao } from "@/lib/painel/estado";
import { createClient } from "@/lib/supabase/server";

const credenciais = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.")),
  senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

export async function entrar(_: Estado, form: FormData): Promise<Estado> {
  const dados = credenciais.safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: dados.data.email, password: dados.data.senha });
  if (error) return { ok: false, mensagem: "E-mail ou senha incorretos." };
  redirect("/painel");
}

export async function cadastrar(_: Estado, form: FormData): Promise<Estado> {
  const dados = credenciais
    .extend({ nome: z.string().trim().min(2, "Informe seu nome.") })
    .safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: dados.data.email,
    password: dados.data.senha,
    options: { data: { nome: dados.data.nome } },
  });
  if (error) {
    if (error.code === "user_already_exists") return { ok: false, mensagem: "Já existe uma conta com esse e-mail. Entre com ela." };
    return { ok: false, mensagem: "Não foi possível criar a conta. Tente de novo." };
  }
  if (!data.session) return { ok: true, mensagem: "Conta criada. Confirme o e-mail que enviamos e depois entre." };
  redirect("/painel");
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
