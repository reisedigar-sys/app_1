import { type Situacao, textoSituacao } from "@/lib/funcionamento";

/**
 * "Aberto agora · fecha às 18:00" (coral) ou "Fechado · abre amanhã às 09:00" (cinza).
 * Verde fica só para confirmado/pronto. `escuro` = sobre o cabeçalho azul-tinta da página da loja.
 */
export function SeloFuncionamento({ situacao, fuso, escuro = false }: { situacao: Situacao; fuso: string; escuro?: boolean }) {
  return <SeloTexto aberto={situacao.aberto} {...textoSituacao(situacao, fuso)} escuro={escuro} />;
}

/** O mesmo selo a partir do texto já montado (componentes de cliente recebem o texto pronto do servidor). */
export function SeloTexto({ aberto, titulo, detalhe, escuro = false }: { aberto: boolean; titulo: string; detalhe: string | null; escuro?: boolean }) {
  const cor = aberto
    ? escuro
      ? "bg-marca-500/20 text-marca-100"
      : "bg-marca-50 text-marca-800 dark:bg-marca-950 dark:text-marca-200"
    : escuro
      ? "bg-white/10 text-white/80"
      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300";
  return (
    <span data-selo-funcionamento={aberto ? "aberto" : "fechado"} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${cor}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${aberto ? "bg-marca-500" : escuro ? "bg-white/50" : "bg-neutral-400"}`} />
      <span>
        <strong className="font-semibold">{titulo}</strong>
        {detalhe && ` · ${detalhe}`}
      </span>
    </span>
  );
}
