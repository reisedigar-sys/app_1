"use client";

import { useState } from "react";
import { reduzirFoto } from "@/lib/imagem";
import { createClient } from "@/lib/supabase/client";

/** Envia a foto direto para o Storage (o RLS do bucket só aceita a pasta da própria loja). */
export function CampoFoto({ lojaId, inicial }: { lojaId: string; inicial?: string | null }) {
  const [url, setUrl] = useState(inicial ?? "");
  const [estado, setEstado] = useState<"" | "enviando" | "erro">("");
  const [erro, setErro] = useState("");

  async function enviar(arquivo: File) {
    setEstado("enviando");
    const foto = await reduzirFoto(arquivo);
    if (!foto) {
      setEstado("erro");
      setErro("Não foi possível ler essa imagem. Use uma foto JPG ou PNG.");
      return;
    }
    const supabase = createClient();
    const caminho = `${lojaId}/profissionais/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("fotos").upload(caminho, foto, { contentType: "image/jpeg" });
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
        <label className="cursor-pointer font-medium text-marca-700 dark:text-marca-400">
          {estado === "enviando" ? "Enviando…" : url ? "Trocar foto" : "Adicionar foto"}
          <input
            type="file"
            accept="image/*"
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
