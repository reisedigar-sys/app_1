"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { caminhoSeguro, comVoltar } from "@/lib/conta/voltar";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, dadosDoForm, errosDeValidacao } from "@/lib/painel/estado";
import { telefoneParaE164 } from "@/lib/painel/formatos";
import { mensagemDeLogin } from "@/lib/conta/erro-login";
import { createClient } from "@/lib/supabase/server";

const credenciais = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.")),
  senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

export async function entrarTutor(_: Estado, form: FormData): Promise<Estado> {
  const dados = credenciais.safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: dados.data.email, password: dados.data.senha });
  if (error) return { ok: false, mensagem: mensagemDeLogin(error) };
  // Carga completa: telas visitadas antes do login (que mandavam para o login) não podem ser reaproveitadas.
  return { ok: true, destino: caminhoSeguro(form.get("voltar")) };
}

export async function cadastrarTutor(_: Estado, form: FormData): Promise<Estado> {
  const dados = credenciais.safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email: dados.data.email, password: dados.data.senha });
  if (error) {
    if (error.code === "user_already_exists") return { ok: false, mensagem: "Já existe uma conta com esse e-mail. Entre com ela." };
    return { ok: false, mensagem: "Não foi possível criar a conta. Tente de novo." };
  }
  if (!data.session) return { ok: true, mensagem: "Conta criada. Confirme o e-mail que enviamos e depois entre." };
  return { ok: true, destino: comVoltar("/conta/perfil", caminhoSeguro(form.get("voltar"))) };
}

export async function salvarPerfil(_: Estado, form: FormData): Promise<Estado> {
  const dados = z
    .object({
      nome: z.string().trim().min(2, "Informe seu nome."),
      telefone: z
        .string()
        .transform((t) => telefoneParaE164(t))
        .refine((t) => t !== null, "Celular inválido. Ex.: (11) 98888-7777."),
    })
    .safeParse(dadosDoForm(form));
  if (!dados.success) return errosDeValidacao(dados.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_perfil_tutor", { p_nome: dados.data.nome, p_telefone: dados.data.telefone! });
  if (error) {
    const duplicado = "Esse celular já está em outra conta. Use outro número ou entre com a outra conta.";
    return { ok: false, mensagem: mensagemDeErro(error, { duplicado }), erros: error.code === "23505" ? { telefone: duplicado } : undefined };
  }
  return { ok: true, destino: caminhoSeguro(form.get("voltar")) };
}

export async function sairTutor() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/conta/entrar");
}
