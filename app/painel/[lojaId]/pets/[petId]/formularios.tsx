"use client";

import { FormAcao } from "@/components/form-acao";
import { AreaTexto } from "@/components/ui";
import { salvarObservacoesPet, salvarObservacoesTutor } from "./acoes";

export function ObservacoesPet({ lojaId, petId, valor }: { lojaId: string; petId: string; valor: string }) {
  return (
    <FormAcao acao={salvarObservacoesPet} rotuloEnviar="Salvar observações do pet">
      <input type="hidden" name="loja_id" value={lojaId} />
      <input type="hidden" name="pet_id" value={petId} />
      <AreaTexto rotulo="Observações do pet" nome="observacoes" defaultValue={valor} maxLength={2000} placeholder="Ex.: não gosta de secador; usar shampoo hipoalergênico" />
    </FormAcao>
  );
}

export function ObservacoesTutor({ lojaId, tutorId, valor }: { lojaId: string; tutorId: string; valor: string }) {
  return (
    <FormAcao acao={salvarObservacoesTutor} rotuloEnviar="Salvar observações do tutor">
      <input type="hidden" name="loja_id" value={lojaId} />
      <input type="hidden" name="tutor_id" value={tutorId} />
      <AreaTexto rotulo="Observações do tutor" nome="observacoes" defaultValue={valor} maxLength={2000} placeholder="Ex.: prefere WhatsApp à tarde" />
    </FormAcao>
  );
}
