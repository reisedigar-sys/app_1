"use client";

import { useId, useRef, useState } from "react";
import { AvatarPet } from "@/components/avatar-pet";
import { FormAcao } from "@/components/form-acao";
import { AreaTexto, Campo, Selecao } from "@/components/ui";
import { mascaraData, nascimentoDeIso } from "@/lib/conta/data-nascimento";
import { reduzirFoto } from "@/lib/imagem";
import { PELAGENS_PET, PORTES_PET, RACAS_SUGERIDAS, type Pet } from "@/lib/conta/pet";
import { createClient } from "@/lib/supabase/client";
import { salvarPet } from "./acoes";

function FotoPet({ tutorId, inicial, nome }: { tutorId: string; inicial?: string | null; nome?: string }) {
  const [url, setUrl] = useState(inicial ?? "");
  const [estado, setEstado] = useState("");

  async function enviar(arquivo: File) {
    setEstado("Enviando…");
    const foto = await reduzirFoto(arquivo);
    if (!foto) return setEstado("Não foi possível ler essa imagem. Use uma foto JPG ou PNG.");
    const supabase = createClient();
    const caminho = `tutores/${tutorId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("fotos").upload(caminho, foto, { contentType: "image/jpeg" });
    if (error) return setEstado("Não foi possível enviar a foto.");
    setUrl(supabase.storage.from("fotos").getPublicUrl(caminho).data.publicUrl);
    setEstado("");
  }

  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name="foto_url" value={url} />
      <AvatarPet nome={nome} foto={url} className="size-20 text-3xl" />
      <div className="flex flex-col gap-1 text-sm">
        <label className="cursor-pointer font-medium text-marca-700 dark:text-marca-400">
          {url ? "Trocar foto" : "Adicionar foto"}
          {!url && <span className="block text-xs font-normal text-neutral-500">A loja reconhece o pet na hora</span>}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} />
        </label>
        {estado && <span className="text-xs text-neutral-500">{estado}</span>}
      </div>
    </div>
  );
}

export function FormularioPet({ tutorId, pet, voltar }: { tutorId: string; pet?: Pet; voltar?: string }) {
  const [nome, setNome] = useState(pet?.nome ?? "");
  const [sugestao, setSugestao] = useState("");
  const idRacas = useId();
  const portes = useRef<HTMLDivElement>(null);
  const pelagens = useRef<HTMLDivElement>(null);
  const temDetalhes = Boolean(pet?.nascimento || pet?.alergias || pet?.temperamento || pet?.vacinas);

  // Raça conhecida: marca porte e pelagem mais comuns, só se o tutor ainda não escolheu (ele confirma ou troca).
  function sugerir(raca: string) {
    const achada = Object.entries(RACAS_SUGERIDAS).find(([r]) => r.toLocaleLowerCase("pt-BR") === raca.trim().toLocaleLowerCase("pt-BR"));
    if (!achada) return setSugestao("");
    const [porte, pelagem] = achada[1];
    const marcar = (grupo: HTMLDivElement | null, valor: string) => {
      if (!grupo || grupo.querySelector("input:checked")) return false;
      const radio = grupo.querySelector<HTMLInputElement>(`input[value="${valor}"]`);
      if (radio) radio.checked = true;
      return Boolean(radio);
    };
    const marcouPorte = marcar(portes.current, porte);
    const marcouPelagem = marcar(pelagens.current, pelagem);
    if (marcouPorte || marcouPelagem) {
      const nomePorte = PORTES_PET.find(([v]) => v === porte)![1];
      const nomePelagem = PELAGENS_PET.find(([v]) => v === pelagem)![1].toLowerCase();
      setSugestao(`Marcamos ${nomePorte} e pelagem ${nomePelagem}, o mais comum para ${achada[0]}. Confira abaixo.`);
    }
  }

  return (
    <FormAcao acao={salvarPet} rotuloEnviar={pet ? "Salvar" : "Cadastrar pet"}>
      {(erros) => (
        <>
          {pet && <input type="hidden" name="id" value={pet.id} />}
          {voltar && <input type="hidden" name="voltar" value={voltar} />}
          <FotoPet tutorId={tutorId} inicial={pet?.foto_url} nome={nome} />
          <Campo rotulo="Nome" nome="nome" defaultValue={pet?.nome} erro={erros.nome} onChange={(e) => setNome(e.currentTarget.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Selecao rotulo="Espécie" nome="especie" defaultValue={pet?.especie ?? "cao"}>
              <option value="cao">Cão</option>
              <option value="gato">Gato</option>
            </Selecao>
            <Campo rotulo="Raça" nome="raca" defaultValue={pet?.raca ?? ""} placeholder="SRD, Shih Tzu…" list={idRacas} onChange={(e) => sugerir(e.currentTarget.value)} />
            <datalist id={idRacas}>
              {Object.keys(RACAS_SUGERIDAS).map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          {sugestao && (
            <p role="status" className="-mt-1 rounded-lg bg-marca-50 px-3 py-2 text-xs text-marca-900 dark:bg-marca-950 dark:text-marca-200">
              {sugestao}
            </p>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Porte</legend>
            <div ref={portes} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PORTES_PET.map(([valor, nome, peso]) => (
                <label
                  key={valor}
                  className="flex min-h-14 cursor-pointer flex-col justify-center rounded-lg border border-neutral-300 px-3 text-sm has-checked:border-marca-700 has-checked:bg-marca-50 dark:border-neutral-700 dark:has-checked:bg-marca-950"
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
            <div ref={pelagens} className="grid grid-cols-3 gap-2">
              {PELAGENS_PET.map(([valor, nome]) => (
                <label
                  key={valor}
                  className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 text-sm has-checked:border-marca-700 has-checked:bg-marca-50 dark:border-neutral-700 dark:has-checked:bg-marca-950"
                >
                  <input type="radio" name="pelagem" value={valor} defaultChecked={pet?.pelagem === valor} className="sr-only" />
                  {nome}
                </label>
              ))}
            </div>
            {erros.pelagem && <p className="text-xs text-red-600">{erros.pelagem}</p>}
          </fieldset>
          {/* O essencial para o preço e a duração fica acima; o resto ajuda a loja, mas não trava o cadastro. */}
          <details open={temDetalhes || Boolean(erros.nascimento) || undefined} className="group rounded-lg border border-neutral-200 dark:border-neutral-800">
            <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-3 text-sm font-medium">
              <span>
                Saúde e jeito do pet <span className="font-normal text-neutral-500">(opcional)</span>
              </span>
              <span aria-hidden className="text-neutral-400 transition group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="flex flex-col gap-4 px-3 pb-3">
              <Campo
                rotulo="Nascimento (opcional)"
                nome="nascimento"
                inputMode="numeric"
                placeholder="DD/MM/AAAA"
                maxLength={10}
                defaultValue={nascimentoDeIso(pet?.nascimento)}
                onChange={(e) => (e.currentTarget.value = mascaraData(e.currentTarget.value))}
                erro={erros.nascimento}
              />
              <AreaTexto rotulo="Alergias" nome="alergias" defaultValue={pet?.alergias ?? ""} maxLength={300} />
              <AreaTexto rotulo="Temperamento" nome="temperamento" defaultValue={pet?.temperamento ?? ""} maxLength={300} placeholder="Dócil, medroso com secador…" />
              <AreaTexto rotulo="Vacinas" nome="vacinas" defaultValue={pet?.vacinas ?? ""} maxLength={300} placeholder="V10 e antirrábica em dia" />
            </div>
          </details>
        </>
      )}
    </FormAcao>
  );
}
