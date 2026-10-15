"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TAMANHO_MAXIMO = 2 * 1024 * 1024;

/** Logo da loja: vai direto para o Storage (o RLS do bucket só aceita a pasta da própria loja). */
export function CampoLogo({ lojaId, inicial }: { lojaId: string; inicial?: string | null }) {
  const [url, setUrl] = useState(inicial ?? "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(arquivo: File) {
    setErro("");
    if (!["image/jpeg", "image/png"].includes(arquivo.type)) return setErro("Use uma imagem JPG ou PNG.");
    if (arquivo.size > TAMANHO_MAXIMO) return setErro("O logo deve ter no máximo 2 MB.");
    setEnviando(true);
    const supabase = createClient();
    const caminho = `${lojaId}/logo/${crypto.randomUUID()}.${arquivo.type.split("/")[1]}`;
    const { error } = await supabase.storage.from("fotos").upload(caminho, arquivo, { contentType: arquivo.type });
    setEnviando(false);
    if (error) return setErro("Não foi possível enviar o logo.");
    setUrl(supabase.storage.from("fotos").getPublicUrl(caminho).data.publicUrl);
  }

  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name="logo_url" value={url} />
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-white text-xs text-neutral-400 dark:border-neutral-800">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo do Storage, tamanho pequeno */}
        {url ? <img src={url} alt="Logo da loja" className="size-full object-contain" /> : "Sem logo"}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label className="cursor-pointer font-medium text-marca-700 dark:text-marca-400">
          {enviando ? "Enviando…" : url ? "Trocar logo" : "Enviar logo"}
          <input
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            disabled={enviando}
            onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])}
          />
        </label>
        {url && (
          <button type="button" className="text-left text-neutral-500" onClick={() => setUrl("")}>
            Remover logo
          </button>
        )}
        <span className="text-xs text-neutral-500">Aparece na página da loja e no ícone do app no celular do cliente. Prefira uma imagem quadrada.</span>
        {erro && <span className="text-xs text-red-600">{erro}</span>}
      </div>
    </div>
  );
}
