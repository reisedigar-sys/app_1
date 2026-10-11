"use client";

import { useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { Caixa, Campo, Selecao } from "@/components/ui";
import { criarBloqueio } from "./acoes";

export function NovoBloqueio({ lojaId, profissionais, hoje }: { lojaId: string; profissionais: { id: string; nome: string }[]; hoje: string }) {
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(hoje);

  return (
    <FormAcao acao={criarBloqueio} rotuloEnviar="Criar bloqueio">
      {(erros) => (
        <>
          <input type="hidden" name="loja_id" value={lojaId} />
          <div className="grid grid-cols-2 gap-3">
            <Selecao rotulo="Quem" nome="profissional_id" defaultValue="">
              <option value="">Loja inteira</option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
            <Selecao rotulo="Tipo" nome="tipo" defaultValue="folga">
              <option value="folga">Folga</option>
              <option value="almoco">Almoço</option>
              <option value="feriado">Feriado</option>
              <option value="outro">Outro</option>
            </Selecao>
          </div>
          <Caixa rotulo="Dia inteiro" nome="dia_inteiro" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} />
          <div className="grid grid-cols-2 gap-3">
            <Campo
              rotulo="De"
              nome="data_inicio"
              type="date"
              value={inicio}
              min={hoje}
              onChange={(e) => {
                setInicio(e.target.value);
                if (fim < e.target.value) setFim(e.target.value);
              }}
              erro={erros.data_inicio}
            />
            {!diaInteiro && <Campo rotulo="Às" nome="hora_inicio" type="time" step={300} defaultValue="12:00" erro={erros.hora_inicio} />}
            <Campo rotulo="Até" nome="data_fim" type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} erro={erros.data_fim} />
            {!diaInteiro && <Campo rotulo="Às" nome="hora_fim" type="time" step={300} defaultValue="13:00" erro={erros.hora_fim} />}
          </div>
          <Campo rotulo="Motivo (opcional)" nome="motivo" maxLength={200} />
        </>
      )}
    </FormAcao>
  );
}
