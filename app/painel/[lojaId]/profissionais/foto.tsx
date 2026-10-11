"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TAMANHO_MAXIMO = 2 * 1024 * 1024;

/** Envia a foto direto para o Storage (o RLS do bucket só aceita a pasta da própria loja). */
export function CampoFoto({ lojaId, inicial }: { lojaId: string; inicial?: string | null }) {
  const [url, setUrl] = useState(inicial ?? "");
  const [estado, setEstado] = useState<"" | "enviando" | "erro">("");
  const [erro, setErro] = useState("");

  async function enviar(arquivo: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(arquivo.type)) {
      setEstado("erro");
      setErro("Use uma imagem JPG, PNG ou WebP.");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      setEstado("erro");
      setErro("A foto deve ter no máximo 2 MB.");
      return;
    }
    setEstado("enviando");
    const supabase = createClient();
    const extensao = arquivo.type.split("/")[1];
    const caminho = `${lojaId}/profissionais/${crypto.randomUUID()}.${extensao}`;
    const { error } = await supabase.storage.from("fotos").upload(caminho, arquivo, { contentType: arquivo.type });
    if (error) {
      setEstado("erro");
      setErro("Não foi possível enviar a foto.");
      return;
    }
    setUrl(supabase.storage.from("fotos").getPublicUrl(caminho).data.publicUrl);
    setEstado("");
  }

  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name="foto_url" value={url} />
      <div className="size-16 shrink-0 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
        {/* eslint-disable-next-line @next/next/no-img-element -- foto do Storage, tamanho pequeno */}
        {url && <img src={url} alt="Foto do profissional" className="size-full object-cover" />}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label className="cursor-pointer font-medium text-teal-700 dark:text-teal-400">
          {estado === "enviando" ? "Enviando…" : url ? "Trocar foto" : "Adicionar foto"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={estado === "enviando"}
            onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])}
          />
        </label>
        {url && (
          <button type="button" className="text-left text-neutral-500" onClick={() => setUrl("")}>
            Remover foto
          </button>
        )}
        {estado === "erro" && <span className="text-xs text-red-600">{erro}</span>}
      </div>
    </div>
  );
}
