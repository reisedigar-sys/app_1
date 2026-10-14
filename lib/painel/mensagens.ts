import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export const NOME_TIPO_MENSAGEM: Record<Enums["tipo_notificacao"], string> = {
  confirmacao_imediata: "Confirmação do agendamento",
  lembrete_d1: "Lembrete da véspera",
  pedido_confirmacao: "Pedido de confirmação",
  lembrete_antes: "Lembrete antes do horário",
  pet_pronto: "Pet pronto",
  vaga_lista_espera: "Vaga da lista de espera",
  aviso_loja_sem_confirmacao: "Aviso à loja: sem confirmação",
  cancelamento: "Cancelamento",
};

export const NOME_STATUS_MENSAGEM: Record<Enums["status_notificacao"], [string, string]> = {
  pendente: ["Agendada", "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200"],
  processando: ["Enviando", "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"],
  enviada: ["Enviada", "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"],
  falhou: ["Falhou", "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200"],
  cancelada: ["Não enviada", "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"],
};

export const NOME_PERIODO: Record<Enums["periodo_dia"], string> = { manha: "Manhã", tarde: "Tarde", qualquer: "Qualquer horário" };

export const NOME_STATUS_ESPERA: Record<Enums["status_lista_espera"], string> = {
  aguardando: "Aguardando",
  notificado: "Avisado de vaga",
  atendido: "Agendou",
  expirado: "Expirou",
  cancelado: "Saiu da fila",
};

/** Colunas da fila que o painel mostra. */
export const COLUNAS_MENSAGEM = "id, tipo, status, enviar_em, enviada_em, tentativas, ultimo_erro, conteudo, tutor(nome)" as const;

export type LinhaMensagem = {
  id: string;
  tipo: Enums["tipo_notificacao"];
  status: Enums["status_notificacao"];
  enviar_em: string;
  enviada_em: string | null;
  tentativas: number;
  ultimo_erro: string | null;
  conteudo: unknown;
  tutor: { nome: string } | null;
};
