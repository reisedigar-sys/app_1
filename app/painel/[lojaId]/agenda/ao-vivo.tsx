"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Recarrega a agenda quando um atendimento da loja muda (Supabase Realtime). O Realtime aplica o RLS:
 * a profissional só recebe as mudanças da própria agenda.
 */
export function AoVivo({ lojaId }: { lojaId: string }) {
  const router = useRouter();
  const [conectado, setConectado] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase.channel(`agenda-${lojaId}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "agendamento", filter: `petshop_id=eq.${lojaId}` },
      () => {
        // Várias mudanças juntas (um pedido com vários pets) viram uma única atualização.
        clearTimeout(espera.current);
        espera.current = setTimeout(() => router.refresh(), 300);
      },
    );
    let ativo = true;
    // A sessão vem dos cookies: sem passar o token antes de entrar no canal, o Realtime aplicaria o RLS como anônimo
    // e nenhuma mudança chegaria.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      canal.subscribe((status) => setConectado(status === "SUBSCRIBED"));
    });
    return () => {
      ativo = false;
      clearTimeout(espera.current);
      supabase.removeChannel(canal);
    };
  }, [lojaId, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500" role="status">
      <span aria-hidden className={`size-2 rounded-full ${conectado ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"}`} />
      {conectado ? "Ao vivo" : "Conectando…"}
    </span>
  );
}
