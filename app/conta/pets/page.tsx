import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotaoLink, Carregando, Titulo, Vazio } from "@/components/ui";
import { PELAGENS_PET, PORTES_PET } from "@/lib/conta/pet";
import { exigirTutor } from "@/lib/conta/sessao";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Meus pets" };

export default function PetsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Titulo acao={<BotaoLink href="/conta/pets/novo" variante="secundario">Cadastrar pet</BotaoLink>}>Meus pets</Titulo>
      <Suspense fallback={<Carregando />}>
        <Lista />
      </Suspense>
    </main>
  );
}

async function Lista() {
  const tutor = await exigirTutor("/conta/pets");
  const supabase = await createClient();
  const { data: pets } = await supabase
    .from("pet")
    .select("id, nome, raca, porte, pelagem, foto_url")
    .eq("tutor_id", tutor.id)
    .eq("ativo", true)
    .order("nome");
  if (!pets?.length) return <Vazio>Nenhum pet ainda. Cadastre o primeiro para agendar.</Vazio>;
  const porte = Object.fromEntries(PORTES_PET.map(([v, n]) => [v, n]));
  const pelagem = Object.fromEntries(PELAGENS_PET.map(([v, n]) => [v, n]));
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {pets.map((p) => (
        <li key={p.id}>
          <Link
            href={`/conta/pets/${p.id}`}
            className="flex min-h-16 items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-2 hover:border-teal-600 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-50 dark:bg-teal-950">
              {/* eslint-disable-next-line @next/next/no-img-element -- foto do Storage */}
              {p.foto_url ? <img src={p.foto_url} alt="" className="size-full object-cover" /> : <span aria-hidden>🐾</span>}
            </span>
            <span className="flex flex-col">
              <span className="font-medium">{p.nome}</span>
              <span className="text-xs text-neutral-500">
                {[p.raca, porte[p.porte], `pelagem ${pelagem[p.pelagem].toLowerCase()}`].filter(Boolean).join(" · ")}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
