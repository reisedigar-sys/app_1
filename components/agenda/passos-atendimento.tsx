const PASSOS = ["agendado", "confirmado", "em_atendimento", "pronto"] as const;

/**
 * Caminho do atendimento visto pelo tutor, com os mesmos status da agenda da loja. Mostra onde o pet está e o que
 * vem depois (o link de confirmação, o início e o aviso de "pronto").
 */
export function PassosAtendimento({ status, inicio, pronto }: { status: string; inicio: string; pronto: string }) {
  const atual = Math.max(0, PASSOS.indexOf(status as (typeof PASSOS)[number]));
  const concluido = status === "concluido";
  const itens: [string, string][] = [
    ["Agendado", "horário reservado"],
    ["Confirmado", "você recebe o link de confirmação no WhatsApp"],
    ["Em atendimento", `começa às ${inicio}`],
    ["Pronto para buscar", `avisamos por volta das ${pronto}`],
  ];
  return (
    <ol className="flex flex-col" aria-label="Andamento do atendimento">
      {itens.map(([titulo, detalhe], i) => {
        const feito = concluido || i <= atual;
        return (
          <li key={titulo} className="relative grid grid-cols-[1.25rem_1fr] gap-3 pb-3 last:pb-0" aria-current={!concluido && i === atual ? "step" : undefined}>
            {i < itens.length - 1 && (
              <span aria-hidden className={`absolute top-4 bottom-0 left-[9px] w-0.5 ${concluido || i < atual ? "bg-emerald-600" : "bg-neutral-200 dark:bg-neutral-800"}`} />
            )}
            <span
              aria-hidden
              className={`z-0 mt-0.5 flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-bold text-white ${feito ? "border-emerald-600 bg-emerald-600" : "border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950"}`}
            >
              {feito ? "✓" : ""}
            </span>
            <span className="text-sm">
              <span className={feito ? "font-semibold" : "text-neutral-600 dark:text-neutral-300"}>{titulo}</span>
              <span className="block text-xs text-neutral-500">{detalhe}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
