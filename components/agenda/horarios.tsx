"use client";

export type OpcaoHorario = { inicio: string; hora: string };

function minutos(hora: string) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Horários do dia agrupados em Manhã e Tarde. A grade vai do primeiro ao último horário livre, de `passo` em `passo`
 * minutos; os ocupados aparecem acinzentados (não somem), como no fluxo de referência.
 */
export function Horarios({
  disponiveis,
  passo,
  selecionado,
  onEscolher,
}: {
  disponiveis: OpcaoHorario[];
  passo: number;
  selecionado?: string;
  onEscolher: (h: OpcaoHorario) => void;
}) {
  if (disponiveis.length === 0) return null;
  const porHora = new Map(disponiveis.map((d) => [d.hora, d]));
  const inicio = minutos(disponiveis[0].hora);
  const fim = minutos(disponiveis[disponiveis.length - 1].hora);
  const grade: string[] = [];
  for (let m = inicio; m <= fim; m += passo) grade.push(hhmm(m));
  const grupos = [
    ["Manhã", grade.filter((h) => minutos(h) < 12 * 60)],
    ["Tarde", grade.filter((h) => minutos(h) >= 12 * 60)],
  ] as const;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      {grupos.map(([nome, horas]) =>
        horas.length === 0 ? null : (
          <div key={nome} role="group" aria-label={nome}>
            <p className="mb-2 text-sm font-medium">{nome}</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {horas.map((h) => {
                const opcao = porHora.get(h);
                const ativo = opcao?.inicio === selecionado;
                return (
                  <button
                    key={h}
                    type="button"
                    disabled={!opcao}
                    onClick={() => opcao && onEscolher(opcao)}
                    aria-pressed={ativo}
                    className={`min-h-10 rounded-full border text-sm transition ${
                      ativo
                        ? "border-marca-700 bg-marca-700 text-white"
                        : opcao
                          ? "border-neutral-400 hover:border-marca-700 dark:border-neutral-600"
                          : "border-neutral-200 text-neutral-300 dark:border-neutral-800 dark:text-neutral-700"
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
