import type { z } from "zod";

/** Resultado de uma Server Action de formulário. */
export type Estado = {
  ok?: boolean;
  mensagem?: string;
  erros?: Record<string, string>;
  /** Carga completa da página (não navegação do roteador); usado depois de login/cadastro. */
  destino?: string;
  /** Próximo passo sugerido junto da mensagem (ex.: cadastrar os preços do serviço recém-criado). */
  proximo?: { href: string; rotulo: string };
};

export const estadoInicial: Estado = {};

export function errosDeValidacao(erro: z.ZodError): Estado {
  const erros: Record<string, string> = {};
  for (const issue of erro.issues) {
    const campo = String(issue.path[0] ?? "");
    if (!erros[campo]) erros[campo] = issue.message;
  }
  return { ok: false, mensagem: "Confira os campos destacados.", erros };
}

/** FormData → objeto simples (checkbox ausente = campo ausente). */
export function dadosDoForm(form: FormData): Record<string, string> {
  const dados: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") dados[k] = v;
  return dados;
}
