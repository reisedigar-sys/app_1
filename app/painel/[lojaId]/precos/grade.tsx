"use client";

import { useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { Botao, classeInput } from "@/components/ui";
import { NOME_PELAGEM, NOME_PORTE, PELAGENS, PORTES } from "@/lib/painel/formatos";
import { type Grade, salvarPrecos } from "./acoes";

type Porte = (typeof PORTES)[number];

export function GradePrecos({ lojaId, servicoId, inicial, editavel }: { lojaId: string; servicoId: string; inicial: Grade; editavel: boolean }) {
  const [grade, setGrade] = useState<Grade>(inicial);
  const [copiando, setCopiando] = useState<Porte | null>(null);
  const [destinos, setDestinos] = useState<Porte[]>([]);

  const celula = (porte: string, pelagem: string) => grade[`${porte}.${pelagem}`] ?? { preco: "", duracao: "" };
  const alterar = (porte: string, pelagem: string, campo: "preco" | "duracao", valor: string) =>
    setGrade((g) => ({ ...g, [`${porte}.${pelagem}`]: { ...celula(porte, pelagem), [campo]: valor } }));

  function aplicarCopia() {
    if (!copiando) return;
    setGrade((g) => {
      const nova = { ...g };
      for (const destino of destinos) for (const pel of PELAGENS) nova[`${destino}.${pel}`] = { ...celula(copiando, pel) };
      return nova;
    });
    setCopiando(null);
    setDestinos([]);
  }

  return (
    <FormAcao acao={salvarPrecos} rotuloEnviar="Salvar preços" semBotao={!editavel}>
      {(erros) => (
        <fieldset disabled={!editavel} className="flex flex-col gap-3">
          <input type="hidden" name="loja_id" value={lojaId} />
          <input type="hidden" name="servico_id" value={servicoId} />
          <input type="hidden" name="grade" value={JSON.stringify(grade)} />
          <p className="text-xs text-neutral-500">Preço em reais e duração em minutos. Deixe em branco o que a loja não atende.</p>

          {PORTES.map((porte) => (
            <div key={porte} className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium">{NOME_PORTE[porte]}</h3>
                {editavel && (
                  <button
                    type="button"
                    className="min-h-10 px-2 text-sm text-teal-700 dark:text-teal-400"
                    onClick={() => {
                      setCopiando(copiando === porte ? null : porte);
                      setDestinos([]);
                    }}
                  >
                    Copiar para…
                  </button>
                )}
              </div>

              {copiando === porte && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 p-2 text-sm dark:bg-neutral-900" role="group" aria-label={`Copiar ${NOME_PORTE[porte]} para`}>
                  {PORTES.filter((p) => p !== porte).map((p) => (
                    <label key={p} className="flex min-h-10 items-center gap-2 px-1">
                      <input
                        type="checkbox"
                        className="size-5 accent-teal-700"
                        checked={destinos.includes(p)}
                        onChange={(e) => setDestinos((d) => (e.target.checked ? [...d, p] : d.filter((x) => x !== p)))}
                      />
                      {NOME_PORTE[p]}
                    </label>
                  ))}
                  <Botao type="button" variante="secundario" disabled={destinos.length === 0} onClick={aplicarCopia}>
                    Aplicar
                  </Botao>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {PELAGENS.map((pelagem) => {
                  const c = celula(porte, pelagem);
                  const erro = erros[`${porte}.${pelagem}`];
                  const rotulo = `${NOME_PORTE[porte]}, pelagem ${NOME_PELAGEM[pelagem].toLowerCase()}`;
                  return (
                    <div key={pelagem} className="flex flex-col gap-1">
                      <span className="text-xs text-neutral-500">Pelagem {NOME_PELAGEM[pelagem].toLowerCase()}</span>
                      <input
                        aria-label={`Preço ${rotulo}`}
                        aria-invalid={erro ? true : undefined}
                        inputMode="decimal"
                        placeholder="R$"
                        className={classeInput}
                        value={c.preco}
                        onChange={(e) => alterar(porte, pelagem, "preco", e.target.value)}
                      />
                      <input
                        aria-label={`Duração em minutos ${rotulo}`}
                        aria-invalid={erro ? true : undefined}
                        inputMode="numeric"
                        placeholder="min"
                        className={classeInput}
                        value={c.duracao}
                        onChange={(e) => alterar(porte, pelagem, "duracao", e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </fieldset>
      )}
    </FormAcao>
  );
}
