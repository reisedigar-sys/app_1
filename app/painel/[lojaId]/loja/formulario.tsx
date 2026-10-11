"use client";

import { FormAcao } from "@/components/form-acao";
import { Caixa, Campo, Cartao, Selecao } from "@/components/ui";
import type { Loja } from "@/lib/painel/sessao";
import { salvarLoja } from "./acoes";

const FUSOS = [
  ["America/Sao_Paulo", "Brasília (SP, RJ, MG, Sul, Nordeste…)"],
  ["America/Manaus", "Amazonas, MT, MS, RO, RR (−1h)"],
  ["America/Rio_Branco", "Acre (−2h)"],
  ["America/Noronha", "Fernando de Noronha (+1h)"],
] as const;

export function FormularioLoja({ loja, editavel }: { loja: Loja; editavel: boolean }) {
  return (
    <FormAcao acao={salvarLoja} semBotao={!editavel}>
      {(erros) => (
        <fieldset disabled={!editavel} className="flex flex-col gap-4">
          <input type="hidden" name="loja_id" value={loja.id} />
          <Cartao className="flex flex-col gap-4">
            <h2 className="font-medium">Identificação</h2>
            <Campo rotulo="Nome da loja" nome="nome" defaultValue={loja.nome} erro={erros.nome} />
            <Campo rotulo="Endereço da página (slug)" nome="slug" defaultValue={loja.slug} erro={erros.slug} autoCapitalize="none" />
            <Campo rotulo="Telefone / WhatsApp" nome="telefone" type="tel" defaultValue={loja.telefone_e164 ?? ""} erro={erros.telefone} placeholder="(11) 3333-4444" />
            <Caixa rotulo="Loja ativa (aparece para os clientes)" nome="ativo" defaultChecked={loja.ativo} />
          </Cartao>

          <Cartao className="flex flex-col gap-4">
            <h2 className="font-medium">Endereço</h2>
            <div className="grid grid-cols-3 gap-3">
              <Campo className="col-span-2" rotulo="Rua" nome="logradouro" defaultValue={loja.logradouro ?? ""} erro={erros.logradouro} />
              <Campo rotulo="Número" nome="numero" defaultValue={loja.numero ?? ""} erro={erros.numero} />
            </div>
            <Campo rotulo="Bairro" nome="bairro" defaultValue={loja.bairro ?? ""} erro={erros.bairro} />
            <div className="grid grid-cols-3 gap-3">
              <Campo className="col-span-2" rotulo="Cidade" nome="cidade" defaultValue={loja.cidade ?? ""} erro={erros.cidade} />
              <Campo rotulo="UF" nome="uf" maxLength={2} defaultValue={loja.uf ?? ""} erro={erros.uf} />
            </div>
            <Campo rotulo="CEP" nome="cep" inputMode="numeric" defaultValue={loja.cep ?? ""} erro={erros.cep} />
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Latitude" nome="latitude" inputMode="decimal" defaultValue={loja.latitude ?? ""} erro={erros.latitude} />
              <Campo rotulo="Longitude" nome="longitude" inputMode="decimal" defaultValue={loja.longitude ?? ""} erro={erros.longitude} />
            </div>
            <p className="text-xs text-neutral-500">A localização ordena as unidades por distância para o cliente. Copie do Google Maps (clique com o botão direito no mapa).</p>
          </Cartao>

          <Cartao className="flex flex-col gap-4">
            <h2 className="font-medium">Agenda</h2>
            <Selecao rotulo="Fuso horário" nome="fuso" defaultValue={loja.fuso}>
              {FUSOS.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Selecao>
            <div className="grid grid-cols-2 gap-3">
              <Selecao rotulo="Intervalo da grade" nome="slot_minutos" defaultValue={String(loja.slot_minutos)}>
                {[5, 10, 15, 20, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Selecao>
              <Campo rotulo="Limpeza entre atendimentos (min)" nome="buffer_minutos" type="number" inputMode="numeric" defaultValue={loja.buffer_minutos} erro={erros.buffer_minutos} />
              <Campo rotulo="Antecedência mínima (min)" nome="antecedencia_minima_minutos" type="number" inputMode="numeric" defaultValue={loja.antecedencia_minima_minutos} erro={erros.antecedencia_minima_minutos} />
              <Campo rotulo="Agenda aberta por (dias)" nome="janela_maxima_dias" type="number" inputMode="numeric" defaultValue={loja.janela_maxima_dias} erro={erros.janela_maxima_dias} />
            </div>
          </Cartao>

          <Cartao className="flex flex-col gap-4">
            <h2 className="font-medium">Cancelamento e faltas</h2>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Cancelamento grátis até (horas antes)" nome="cancelamento_gratuito_horas" type="number" inputMode="numeric" defaultValue={loja.cancelamento_gratuito_horas} erro={erros.cancelamento_gratuito_horas} />
              <Campo rotulo="Sinal (% do valor)" nome="sinal_percentual" type="number" inputMode="decimal" defaultValue={Number(loja.sinal_percentual)} erro={erros.sinal_percentual} ajuda="0 = sem sinal" />
              <Campo rotulo="Faltas antes de exigir sinal" nome="limite_faltas" type="number" inputMode="numeric" defaultValue={loja.limite_faltas} erro={erros.limite_faltas} />
            </div>
          </Cartao>
        </fieldset>
      )}
    </FormAcao>
  );
}
