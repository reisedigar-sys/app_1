"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { Aviso, Botao, classeInput } from "@/components/ui";
import { NOME_PELAGEM, NOME_PORTE, PELAGENS, PORTES } from "@/lib/painel/formatos";
import type { Estado } from "@/lib/painel/estado";
import {
  type Grade,
  CHAVES,
  ehPrecoUnico,
  mesmaGrade,
  normalizarPreco,
  preencherTodas,
  primeiraPreenchida,
} from "@/lib/painel/precos";
import { salvarPrecos } from "./acoes";

type Porte = (typeof PORTES)[number];
type Servico = { id: string; nome: string; tipo: "principal" | "adicional" };

const todasIguais = (preco: string, duracao: string): Grade =>
  Object.fromEntries(CHAVES.map((k) => [k, { preco, duracao }]));
const vazia = (g: Grade) => CHAVES.every((k) => !g[k]?.preco.trim() && !g[k]?.duracao.trim());

export function GradePrecos({
  lojaId,
  servico,
  servicos,
  inicial,
  outros,
  editavel,
}: {
  lojaId: string;
  servico: Servico;
  servicos: { id: string; nome: string; semPreco: boolean }[];
  inicial: Grade;
  /** Outros serviços da loja que já têm preço (origem para copiar). */
  outros: { id: string; nome: string; grade: Grade }[];
  editavel: boolean;
}) {
  const router = useRouter();
  const [grade, setGrade] = useState<Grade>(inicial);
  const [salvo, setSalvo] = useState<Grade>(inicial);
  // Adicionais (hidratação, unha) costumam ter um preço só: abrem nesse modo quando ainda não têm tabela.
  const [unico, setUnico] = useState(() => ehPrecoUnico(inicial) || (servico.tipo === "adicional" && vazia(inicial)));
  const [copiando, setCopiando] = useState<Porte | null>(null);
  const [destinos, setDestinos] = useState<Porte[]>([]);
  const [base, setBase] = useState({ preco: "", duracao: "" });
  const [origem, setOrigem] = useState(outros[0]?.id ?? "");
  const [indo, setIndo] = useState<{ href: string; nome: string } | null>(null);

  const alterado = editavel && !mesmaGrade(grade, salvo);

  // Fechar ou recarregar a página com alterações pendentes pede confirmação do navegador.
  useEffect(() => {
    if (!alterado) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [alterado]);

  const celula = (porte: string, pelagem: string) => grade[`${porte}.${pelagem}`] ?? { preco: "", duracao: "" };
  const alterar = (porte: string, pelagem: string, campo: "preco" | "duracao", valor: string) =>
    setGrade((g) => ({ ...g, [`${porte}.${pelagem}`]: { ...celula(porte, pelagem), [campo]: valor } }));
  const primeira = primeiraPreenchida(grade);

  function aplicarCopia() {
    if (!copiando) return;
    setGrade((g) => {
      const nova = { ...g };
      for (const destino of destinos)
        for (const pel of PELAGENS) nova[`${destino}.${pel}`] = { ...celula(copiando, pel) };
      return nova;
    });
    setCopiando(null);
    setDestinos([]);
  }

  async function salvar(estado: Estado, form: FormData): Promise<Estado> {
    const resultado = await salvarPrecos(estado, form);
    if (resultado.ok) setSalvo(JSON.parse(String(form.get("grade"))));
    return resultado;
  }

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Serviço" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2 pb-1">
          {servicos.map((s) => {
            const href = `/painel/${lojaId}/precos?servico=${s.id}`;
            return (
              <li key={s.id}>
                <Link
                  href={href}
                  aria-current={s.id === servico.id ? "page" : undefined}
                  onClick={(e) => {
                    if (!alterado || s.id === servico.id) return;
                    e.preventDefault();
                    setIndo({ href, nome: s.nome });
                  }}
                  className="flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full border border-neutral-300 px-3 text-sm aria-[current=page]:border-marca-700 aria-[current=page]:bg-marca-50 aria-[current=page]:text-marca-800 dark:border-neutral-700 dark:aria-[current=page]:bg-marca-950 dark:aria-[current=page]:text-marca-200"
                >
                  {s.nome}
                  {s.semPreco && <span className="size-2 rounded-full bg-amber-500" aria-label="sem preço" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {indo && (
        <Aviso tipo="alerta">
          <span className="block">Os preços de {servico.nome} ainda não foram salvos.</span>
          <span className="mt-2 flex flex-wrap gap-2">
            <Botao type="button" variante="secundario" onClick={() => setIndo(null)}>
              Continuar editando
            </Botao>
            <Botao type="button" variante="perigo" onClick={() => router.push(indo.href)}>
              Descartar e abrir {indo.nome}
            </Botao>
          </span>
        </Aviso>
      )}

      <FormAcao acao={salvar} rotuloEnviar="Salvar preços" semBotao={!editavel}>
        {(erros) => (
          <fieldset disabled={!editavel} className="flex flex-col gap-3">
            <input type="hidden" name="loja_id" value={lojaId} />
            <input type="hidden" name="servico_id" value={servico.id} />
            <input
              type="hidden"
              name="grade"
              value={JSON.stringify(unico ? todasIguais(primeira.preco, primeira.duracao) : grade)}
            />

            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-marca-700"
                checked={unico}
                onChange={(e) => {
                  setUnico(e.target.checked);
                  if (e.target.checked) setGrade(todasIguais(primeira.preco, primeira.duracao));
                }}
              />
              Mesmo preço e tempo para todos os portes e pelagens
            </label>

            {unico ? (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
                <label className="flex flex-col gap-1 text-sm">
                  Preço (R$)
                  <input
                    aria-invalid={Object.keys(erros).length ? true : undefined}
                    inputMode="decimal"
                    placeholder="Ex.: 25,00"
                    className={classeInput}
                    value={primeira.preco}
                    onChange={(e) => setGrade(todasIguais(e.target.value, primeira.duracao))}
                    onBlur={(e) => setGrade(todasIguais(normalizarPreco(e.target.value), primeira.duracao))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Duração (min)
                  <input
                    aria-invalid={Object.keys(erros).length ? true : undefined}
                    inputMode="numeric"
                    placeholder="Ex.: 15"
                    className={classeInput}
                    value={primeira.duracao}
                    onChange={(e) => setGrade(todasIguais(primeira.preco, e.target.value.replace(/\D/g, "")))}
                  />
                </label>
              </div>
            ) : (
              <>
                <p className="text-xs text-neutral-500">
                  Preço em reais e duração em minutos. Deixe em branco o que a loja não atende.
                </p>

                {editavel && (
                  <div className="flex flex-col gap-3 rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
                    <div
                      role="group"
                      aria-label="Preencher todas as combinações"
                      className="flex flex-wrap items-end gap-2"
                    >
                      <label className="flex w-28 flex-col gap-1 text-xs text-neutral-500">
                        Preço para todas
                        <input
                          inputMode="decimal"
                          placeholder="R$"
                          className={classeInput}
                          value={base.preco}
                          onChange={(e) => setBase((b) => ({ ...b, preco: e.target.value }))}
                          onBlur={(e) => setBase((b) => ({ ...b, preco: normalizarPreco(e.target.value) }))}
                        />
                      </label>
                      <label className="flex w-28 flex-col gap-1 text-xs text-neutral-500">
                        Duração para todas
                        <input
                          inputMode="numeric"
                          placeholder="min"
                          className={classeInput}
                          value={base.duracao}
                          onChange={(e) => setBase((b) => ({ ...b, duracao: e.target.value.replace(/\D/g, "") }))}
                        />
                      </label>
                      <Botao
                        type="button"
                        variante="secundario"
                        disabled={!base.preco.trim() && !base.duracao.trim()}
                        onClick={() => setGrade((g) => preencherTodas(g, base.preco, base.duracao))}
                      >
                        Aplicar a todas
                      </Botao>
                    </div>
                    <p className="text-xs text-neutral-500">
                      Preencha o valor mais comum e depois ajuste só as exceções.
                    </p>

                    {outros.length > 0 && (
                      <div role="group" aria-label="Copiar de outro serviço" className="flex flex-wrap items-end gap-2">
                        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-neutral-500">
                          Copiar a tabela de
                          <select
                            aria-label="Copiar a tabela de"
                            className={classeInput}
                            value={origem}
                            onChange={(e) => setOrigem(e.target.value)}
                          >
                            {outros.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Botao
                          type="button"
                          variante="secundario"
                          onClick={() => {
                            const o = outros.find((x) => x.id === origem);
                            if (o) setGrade({ ...o.grade });
                          }}
                        >
                          Copiar
                        </Botao>
                      </div>
                    )}
                  </div>
                )}

                {PORTES.map((porte) => (
                  <div
                    key={porte}
                    className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-medium">{NOME_PORTE[porte]}</h3>
                      {editavel && (
                        <button
                          type="button"
                          className="min-h-10 px-2 text-sm text-marca-700 dark:text-marca-400"
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
                      <div
                        className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 p-2 text-sm dark:bg-neutral-900"
                        role="group"
                        aria-label={`Copiar ${NOME_PORTE[porte]} para`}
                      >
                        {PORTES.filter((p) => p !== porte).map((p) => (
                          <label key={p} className="flex min-h-10 items-center gap-2 px-1">
                            <input
                              type="checkbox"
                              className="size-5 accent-marca-700"
                              checked={destinos.includes(p)}
                              onChange={(e) =>
                                setDestinos((d) => (e.target.checked ? [...d, p] : d.filter((x) => x !== p)))
                              }
                            />
                            {NOME_PORTE[p]}
                          </label>
                        ))}
                        <Botao
                          type="button"
                          variante="secundario"
                          disabled={destinos.length === 0}
                          onClick={aplicarCopia}
                        >
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
                            <span className="text-xs text-neutral-500">
                              Pelagem {NOME_PELAGEM[pelagem].toLowerCase()}
                            </span>
                            <input
                              aria-label={`Preço ${rotulo}`}
                              aria-invalid={erro ? true : undefined}
                              inputMode="decimal"
                              placeholder="R$"
                              className={classeInput}
                              value={c.preco}
                              onChange={(e) => alterar(porte, pelagem, "preco", e.target.value)}
                              onBlur={(e) => alterar(porte, pelagem, "preco", normalizarPreco(e.target.value))}
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
              </>
            )}
            {alterado && <p className="text-sm text-amber-700 dark:text-amber-400">Alterações ainda não salvas.</p>}
          </fieldset>
        )}
      </FormAcao>
    </div>
  );
}
