"use client";

const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-10" + n meses → "2026-11". */
export function somarMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Calendário mensal: só os dias com vaga ficam clicáveis; os demais aparecem acinzentados. */
export function Calendario({
  mes,
  hoje,
  diasComVaga,
  selecionado,
  carregando,
  onMes,
  onDia,
}: {
  mes: string; // "2026-10"
  hoje: string; // "2026-10-12" no fuso da loja
  diasComVaga: string[];
  selecionado?: string;
  carregando?: boolean;
  onMes: (mes: string) => void;
  onDia: (dia: string) => void;
}) {
  const [ano, m] = mes.split("-").map(Number);
  const primeiro = new Date(Date.UTC(ano, m - 1, 1));
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const vazios = primeiro.getUTCDay();
  const vagas = new Set(diasComVaga);
  const podeVoltar = mes > hoje.slice(0, 7);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950" aria-busy={carregando}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMes(somarMes(mes, -1))}
          disabled={!podeVoltar}
          className="flex size-11 items-center justify-center rounded-full text-xl text-teal-700 disabled:opacity-30 dark:text-teal-400"
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <p className="font-medium capitalize" aria-live="polite">
          {MESES[m - 1]} de {ano}
        </p>
        <button
          type="button"
          onClick={() => onMes(somarMes(mes, 1))}
          className="flex size-11 items-center justify-center rounded-full text-xl text-teal-700 dark:text-teal-400"
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center" role="grid" aria-label={`Dias de ${MESES[m - 1]}`}>
        {DIAS.map((d) => (
          <div key={d} className="py-1 text-[11px] font-medium text-neutral-500" aria-hidden>
            {d}
          </div>
        ))}
        {Array.from({ length: vazios }, (_, i) => (
          <div key={`v${i}`} />
        ))}
        {Array.from({ length: diasNoMes }, (_, i) => {
          const dia = `${mes}-${String(i + 1).padStart(2, "0")}`;
          const livre = vagas.has(dia) && !carregando;
          const ativo = dia === selecionado;
          return (
            <div key={dia} className="flex justify-center">
              <button
                type="button"
                disabled={!livre}
                onClick={() => onDia(dia)}
                aria-pressed={ativo}
                aria-label={`${i + 1} de ${MESES[m - 1]}${livre ? "" : ", sem horários"}`}
                className={`flex size-10 items-center justify-center rounded-full text-sm font-medium transition ${
                  ativo
                    ? "bg-teal-700 text-white"
                    : livre
                      ? "text-neutral-900 hover:bg-teal-50 dark:text-neutral-100 dark:hover:bg-teal-950"
                      : "text-neutral-300 dark:text-neutral-700"
                } ${dia === hoje && !ativo ? "ring-1 ring-teal-700" : ""}`}
              >
                {i + 1}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
