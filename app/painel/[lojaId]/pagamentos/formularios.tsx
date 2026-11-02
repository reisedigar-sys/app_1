"use client";

import { useState } from "react";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { Aviso, Campo, Selecao } from "@/components/ui";
import { abrirContaPagamento, atualizarSituacaoConta, salvarSinal } from "./acoes";

type Inicial = Partial<Record<string, string | number>>;
const valor = (v: string | number | undefined) => (v === undefined ? "" : String(v));

export function FormConta({ lojaId, inicial, erro }: { lojaId: string; inicial: Inicial; erro: string | null }) {
  const [tipo, setTipo] = useState(valor(inicial.tipo) || "cnpj");
  const faturamento = typeof inicial.faturamento_centavos === "number" ? (inicial.faturamento_centavos / 100).toFixed(2).replace(".", ",") : "";
  return (
    <FormAcao acao={abrirContaPagamento} rotuloEnviar="Abrir conta">
      {(erros, enviados) => (
        // Depois de um erro, os campos voltam com o que foi digitado (a chave recria os campos com esses valores).
        <div key={JSON.stringify(enviados)} className="contents">
          <input type="hidden" name="loja_id" value={lojaId} />
          {erro && <Aviso tipo="erro">Última tentativa: {erro}</Aviso>}
          <fieldset className="flex gap-4 text-sm">
            <legend className="mb-1 text-sm font-medium">A conta fica no nome de</legend>
            {[
              ["cnpj", "Empresa (CNPJ)"],
              ["cpf", "Pessoa física (CPF)"],
            ].map(([v, rotulo]) => (
              <label key={v} className="flex min-h-11 items-center gap-2">
                <input type="radio" name="tipo" value={v} checked={tipo === v} onChange={() => setTipo(v)} className="size-4 accent-marca-700" />
                {rotulo}
              </label>
            ))}
          </fieldset>
          <Campo rotulo={tipo === "cnpj" ? "CNPJ" : "CPF"} nome="cpf_cnpj" inputMode="numeric" defaultValue={enviados.cpf_cnpj ?? valor(inicial.cpf_cnpj)} erro={erros.cpf_cnpj} />
          <Campo rotulo={tipo === "cnpj" ? "Razão social" : "Nome completo"} nome="nome" defaultValue={enviados.nome ?? valor(inicial.nome)} erro={erros.nome} />
          {tipo === "cnpj" ? (
            <Selecao rotulo="Tipo de empresa" nome="tipo_empresa" defaultValue={enviados.tipo_empresa ?? valor(inicial.tipo_empresa)} erro={erros.tipo_empresa}>
              <option value="">Escolha</option>
              <option value="MEI">MEI</option>
              <option value="LIMITED">Limitada (Ltda) ou sociedade</option>
              <option value="INDIVIDUAL">Empresário individual</option>
              <option value="ASSOCIATION">Associação</option>
            </Selecao>
          ) : (
            <Campo rotulo="Data de nascimento" nome="nascimento" type="date" defaultValue={enviados.nascimento ?? valor(inicial.nascimento)} erro={erros.nascimento} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="E-mail" nome="email" type="email" defaultValue={enviados.email ?? valor(inicial.email)} erro={erros.email} className="col-span-2" />
            <Campo rotulo="Celular" nome="celular" type="tel" inputMode="tel" defaultValue={enviados.celular ?? valor(inicial.celular)} erro={erros.celular} />
            <Campo
              rotulo="Faturamento por mês (R$)"
              nome="faturamento"
              inputMode="decimal"
              defaultValue={enviados.faturamento ?? faturamento}
              erro={erros.faturamento}
              ajuda="Média aproximada; o Asaas pede."
            />
            <Campo rotulo="CEP" nome="cep" inputMode="numeric" defaultValue={enviados.cep ?? valor(inicial.cep)} erro={erros.cep} />
            <Campo rotulo="Bairro" nome="bairro" defaultValue={enviados.bairro ?? valor(inicial.bairro)} erro={erros.bairro} />
            <Campo rotulo="Rua" nome="endereco" defaultValue={enviados.endereco ?? valor(inicial.endereco)} erro={erros.endereco} className="col-span-2" />
            <Campo rotulo="Número" nome="numero" defaultValue={enviados.numero ?? valor(inicial.numero)} erro={erros.numero} />
            <Campo rotulo="Complemento" nome="complemento" defaultValue={enviados.complemento ?? valor(inicial.complemento)} erro={erros.complemento} />
          </div>
        </div>
      )}
    </FormAcao>
  );
}

export function FormSituacao({ lojaId }: { lojaId: string }) {
  return (
    <FormAcao acao={atualizarSituacaoConta} semBotao className="flex flex-col gap-2">
      <input type="hidden" name="loja_id" value={lojaId} />
      <BotaoEnviar variante="secundario">Atualizar situação</BotaoEnviar>
    </FormAcao>
  );
}

export function FormSinal({
  lojaId,
  limiteFaltas,
  inicial,
}: {
  lojaId: string;
  limiteFaltas: number;
  inicial: { modo: "nunca" | "faltas" | "todos"; tipo: "percentual" | "fixo"; percentual: string; fixo: string };
}) {
  const [modo, setModo] = useState(inicial.modo);
  const [tipo, setTipo] = useState(inicial.tipo);
  const opcoes = [
    ["nunca", "Não cobrar sinal"],
    ["faltas", `Só de quem faltou mais de ${limiteFaltas} ${limiteFaltas === 1 ? "vez" : "vezes"}`],
    ["todos", "De todos os agendamentos pelo app"],
  ] as const;
  return (
    <FormAcao acao={salvarSinal} rotuloEnviar="Salvar sinal">
      {(erros) => (
        <>
          <input type="hidden" name="loja_id" value={lojaId} />
          <fieldset className="flex flex-col text-sm">
            <legend className="mb-1 text-sm font-medium">Quando cobrar</legend>
            {opcoes.map(([v, rotulo]) => (
              <label key={v} className="flex min-h-11 items-center gap-2">
                <input type="radio" name="modo" value={v} checked={modo === v} onChange={() => setModo(v)} className="size-4 accent-marca-700" />
                {rotulo}
              </label>
            ))}
          </fieldset>
          {modo !== "nunca" && (
            <>
              <fieldset className="flex flex-col text-sm">
                <legend className="mb-1 text-sm font-medium">Quanto</legend>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="tipo" value="percentual" checked={tipo === "percentual"} onChange={() => setTipo("percentual")} className="size-4 accent-marca-700" />
                  Porcentagem do pedido
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="tipo" value="fixo" checked={tipo === "fixo"} onChange={() => setTipo("fixo")} className="size-4 accent-marca-700" />
                  Valor fixo por pet
                </label>
              </fieldset>
              {tipo === "percentual" ? (
                <Campo rotulo="Porcentagem (%)" nome="percentual" inputMode="decimal" defaultValue={inicial.percentual} erro={erros.percentual} />
              ) : (
                <Campo rotulo="Valor por pet (R$)" nome="fixo" inputMode="decimal" defaultValue={inicial.fixo} erro={erros.fixo} placeholder="Ex.: 20,00" />
              )}
            </>
          )}
          {modo === "nunca" && <input type="hidden" name="tipo" value={tipo} />}
        </>
      )}
    </FormAcao>
  );
}
