// Contato manual da equipe com o tutor (ligação e conversa no WhatsApp do próprio celular da loja).
// Não passa pela Meta Cloud API: é a pessoa da loja que abre o app e envia.

/** Link de ligação para um telefone E.164 ("+5511988887777"). */
export function linkLigar(e164: string | null | undefined) {
  return e164 ? `tel:${e164}` : null;
}

/** Conversa no WhatsApp com o texto já escrito (o atendente revisa antes de enviar). */
export function linkWhatsApp(e164: string | null | undefined, texto?: string) {
  const numero = e164?.replace(/\D/g, "");
  if (!numero) return null;
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

/**
 * Texto sugerido conforme o momento do atendimento. Escrito sem gênero ("o atendimento de Paçoca"),
 * porque o cadastro do pet não diz se é macho ou fêmea.
 */
export function textoWhatsApp(p: { status: string; loja: string; tutor: string | null; pet: string | null; quando: string }) {
  const nome = p.tutor?.trim().split(/\s+/)[0];
  const ola = nome ? `Olá, ${nome}!` : "Olá!";
  const pet = p.pet ?? "seu pet";
  if (p.status === "pronto") return `${ola} Aqui é da ${p.loja}. O atendimento de ${pet} terminou: já pode vir buscar.`;
  if (p.status === "agendado") return `${ola} Aqui é da ${p.loja}. Podemos confirmar o horário de ${pet} ${p.quando}?`;
  return `${ola} Aqui é da ${p.loja}, sobre o atendimento de ${pet} ${p.quando}.`;
}
