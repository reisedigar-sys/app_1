// Textos do sinal por Pix (semana 8b). A regra (devolver, reter ou abater) é do banco: app.agendamento_sinal,
// migração 018. Aqui só o que a loja e o tutor leem.
import { formatarReais } from "@/lib/painel/formatos";

export type SituacaoSinal = "aguardando" | "pago" | "cancelado" | "devolver" | "devolvido" | "retido" | "abatido";

/** Selo curto na agenda da loja (null = nada a mostrar). */
export function seloSinal(situacao: SituacaoSinal | null | undefined): { texto: string; classe: string } | null {
  switch (situacao) {
    case "aguardando":
      return { texto: "aguardando Pix", classe: "bg-amber-500 text-white" };
    case "pago":
      return { texto: "sinal pago", classe: "bg-emerald-700 text-white" };
    case "retido":
      return { texto: "sinal retido", classe: "bg-black/10" };
    case "devolver":
    case "devolvido":
      return { texto: "sinal devolvido", classe: "bg-black/10" };
    default:
      return null;
  }
}

/** Uma frase com o valor e o que aconteceu com o sinal, para a ficha e para o tutor. */
export function fraseSinal(situacao: SituacaoSinal, centavos: number, para: "loja" | "tutor"): string | null {
  const valor = formatarReais(centavos);
  switch (situacao) {
    case "aguardando":
      return para === "loja" ? `Sinal de ${valor} aguardando o Pix.` : null;
    case "pago":
      return para === "loja" ? `Sinal de ${valor} pago por Pix. Desconte do valor na loja.` : `Sinal de ${valor} pago por Pix.`;
    case "devolver":
      return `Sinal de ${valor} sendo devolvido por Pix.`;
    case "devolvido":
      return `Sinal de ${valor} devolvido por Pix.`;
    case "retido":
      return para === "loja" ? `Sinal de ${valor} retido (ficou com a loja).` : `Sinal de ${valor} ficou com a loja.`;
    case "abatido":
      return `Sinal de ${valor} descontado do valor do atendimento.`;
    default:
      return null;
  }
}

/** O que o tutor lê antes de confirmar o cancelamento. */
export function politicaCancelamento(p: { gratuito: boolean; ate: string; sinalCentavos?: number | null }): string {
  const sinal = p.sinalCentavos ? formatarReais(p.sinalCentavos) : null;
  if (p.gratuito) return `Cancelamento gratuito até ${p.ate}.${sinal ? ` Cancelando agora, o sinal de ${sinal} volta para você por Pix.` : ""}`;
  return sinal
    ? `O prazo de cancelamento gratuito da loja já passou: cancelando agora, o sinal de ${sinal} fica com a loja.`
    : "O prazo de cancelamento gratuito da loja já passou.";
}
