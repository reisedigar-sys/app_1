import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

const botao = "flex min-h-11 items-center justify-center rounded-md px-4 font-medium";

const VANTAGENS = [
  ["Horário livre na hora", "Você vê só os horários que cabem no serviço do seu pet."],
  ["Lembrete no WhatsApp", "Confirme, remarque ou cancele pelo link, sem ligar."],
  ["Aviso de pet pronto", "A loja avisa quando é hora de buscar."],
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-12">
      <Suspense fallback={null}>
        <IrParaOQueUsa />
      </Suspense>
      <h1 className="text-3xl font-semibold text-marca-700 dark:text-marca-400">Hora do Pet</h1>
      <p className="text-lg">Banho e tosa agendados em poucos toques.</p>
      <ul className="flex flex-col gap-3">
        {VANTAGENS.map(([titulo, texto]) => (
          <li key={titulo} className="flex gap-3">
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-marca-500" />
            <p>
              <strong className="font-semibold">{titulo}.</strong> <span className="text-neutral-600 dark:text-neutral-400">{texto}</span>
            </p>
          </li>
        ))}
      </ul>
      <nav aria-label="Acesso" className="mt-4 flex flex-col gap-3">
        <Link href="/conta" className={`${botao} bg-marca-700 text-white hover:bg-marca-800`}>
          Sou tutor: meus pets e agendamentos
        </Link>
        <Link
          href="/entrar"
          className={`${botao} border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900`}
        >
          Sou petshop: entrar no painel
        </Link>
      </nav>
    </main>
  );
}

/** Quem já entrou vai direto para o que usa: a equipe para o painel, o tutor para os agendamentos. */
async function IrParaOQueUsa() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const [membro, rede] = await Promise.all([
    supabase.from("petshop_membro").select("petshop_id", { count: "exact", head: true }).eq("user_id", id),
    supabase.from("rede_membro").select("rede_id", { count: "exact", head: true }).eq("user_id", id),
  ]);
  redirect(membro.count || rede.count ? "/painel" : "/conta");
}
