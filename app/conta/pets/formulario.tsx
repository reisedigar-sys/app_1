"use client";

import { useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { AreaTexto, Campo, Selecao } from "@/components/ui";
import { PELAGENS_PET, PORTES_PET, type Pet } from "@/lib/conta/pet";
import { createClient } from "@/lib/supabase/client";
import { salvarPet } from "./acoes";

function FotoPet({ tutorId, inicial }: { tutorId: string; inicial?: string | null }) {
  const [url, setUrl] = useState(inicial ?? "");
  const [estado, setEstado] = useState("");

  async function enviar(arquivo: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(arquivo.type) || arquivo.size > 2 * 1024 * 1024) {
      setEstado("Use uma imagem JPG, PNG ou WebP de até 2 MB.");
      return;
    }
    setEstado("Enviando…");
    const supabase = createClient();
    const caminho = `tutores/${tutorId}/${crypto.randomUUID()}.${arquivo.type.split("/")[1]}`;
    const { error } = await supabase.storage.from("fotos").upload(caminho, arquivo, { contentType: arquivo.type });
    if (error) return setEstado("Não foi possível enviar a foto.");
    setUrl(supabase.storage.from("fotos").getPublicUrl(caminho).data.publicUrl);
    setEstado("");
  }

  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name="foto_url" value={url} />
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-50 text-2xl dark:bg-teal-950">
        {/* eslint-disable-next-line @next/next/no-img-element -- foto do Storage */}
        {url ? <img src={url} alt="Foto do pet" className="size-full object-cover" /> : <span aria-hidden>🐾</span>}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label className="cursor-pointer font-medium text-teal-700 dark:text-teal-400">
          {url ? "Trocar foto" : "Adicionar foto"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} />
        </label>
        {estado && <span className="text-xs text-neutral-500">{estado}</span>}
      </div>
    </div>
  );
}

export function FormularioPet({ tutorId, pet, voltar }: { tutorId: string; pet?: Pet; voltar?: string }) {
  return (
    <FormAcao acao={salvarPet} rotuloEnviar={pet ? "Salvar" : "Cadastrar pet"}>
      {(erros) => (
        <>
          {pet && <input type="hidden" name="id" value={pet.id} />}
          {voltar && <input type="hidden" name="voltar" value={voltar} />}
          <FotoPet tutorId={tutorId} inicial={pet?.foto_url} />
          <Campo rotulo="Nome" nome="nome" defaultValue={pet?.nome} erro={erros.nome} />
          <div className="grid grid-cols-2 gap-3">
            <Selecao rotulo="Espécie" nome="especie" defaultValue={pet?.especie ?? "cao"}>
              <option value="cao">Cão</option>
              <option value="gato">Gato</option>
            </Selecao>
            <Campo rotulo="Raça" nome="raca" defaultValue={pet?.raca ?? ""} placeholder="SRD, Shih Tzu…" />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Porte</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PORTES_PET.map(([valor, nome, peso]) => (
                <label
                  key={valor}
                  className="flex min-h-14 cursor-pointer flex-col justify-center rounded-lg border border-neutral-300 px-3 text-sm has-checked:border-teal-700 has-checked:bg-teal-50 dark:border-neutral-700 dark:has-checked:bg-teal-950"
                >
                  <input type="radio" name="porte" value={valor} defaultChecked={pet?.porte === valor} className="sr-only" />
                  <span className="font-medium">{nome}</span>
                  <span className="text-xs text-neutral-500">{peso}</span>
                </label>
              ))}
            </div>
            {erros.porte && <p className="text-xs text-red-600">{erros.porte}</p>}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Pelagem</legend>
            <div className="grid grid-cols-3 gap-2">
              {PELAGENS_PET.map(([valor, nome]) => (
                <label
                  key={valor}
                  className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 text-sm has-checked:border-teal-700 has-checked:bg-teal-50 dark:border-neutral-700 dark:has-checked:bg-teal-950"
                >
                  <input type="radio" name="pelagem" value={valor} defaultChecked={pet?.pelagem === valor} className="sr-only" />
                  {nome}
                </label>
              ))}
            </div>
            {erros.pelagem && <p className="text-xs text-red-600">{erros.pelagem}</p>}
          </fieldset>
          <Campo rotulo="Nascimento (opcional)" nome="nascimento" type="date" defaultValue={pet?.nascimento ?? ""} />
          <AreaTexto rotulo="Alergias" nome="alergias" defaultValue={pet?.alergias ?? ""} maxLength={300} />
          <AreaTexto rotulo="Temperamento" nome="temperamento" defaultValue={pet?.temperamento ?? ""} maxLength={300} placeholder="Dócil, medroso com secador…" />
          <AreaTexto rotulo="Vacinas" nome="vacinas" defaultValue={pet?.vacinas ?? ""} maxLength={300} placeholder="V10 e antirrábica em dia" />
        </>
      )}
    </FormAcao>
  );
}
