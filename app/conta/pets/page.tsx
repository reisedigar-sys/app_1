import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AvatarPet } from "@/components/avatar-pet";
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
  const [{ data: pets }, { data: historico }, { data: lojas }] = await Promise.all([
    supabase.from("pet").select("id, nome, raca, porte, pelagem, nascimento, foto_url").eq("tutor_id", tutor.id).eq("ativo", true).order("nome"),
    supabase
      .from("agendamento")
      .select("pet_id, inicio, status, petshop_id")
      .eq("tutor_id", tutor.id)
      .neq("status", "cancelado")
      .order("inicio", { ascending: false })
      .limit(200),
    supabase.rpc("minhas_lojas"),
  ]);
  if (!pets?.length) return <Vazio>Nenhum pet ainda. Cadastre o primeiro para agendar.</Vazio>;
  const porte = Object.fromEntries(PORTES_PET.map(([v, n]) => [v, n]));
  const pelagem = Object.fromEntries(PELAGENS_PET.map(([v, n]) => [v, n]));
  const agora = instanteAtual();

  // Último atendimento de cada pet (para "último banho") e a loja dele (para "Agendar para…").
  const ultimo = new Map<string, { inicio: string; slug: string; fuso: string; concluido: boolean }>();
  const lojaPorId = new Map((lojas ?? []).map((l) => [l.petshop_id, l]));
  for (const a of historico ?? []) {
    const loja = lojaPorId.get(a.petshop_id);
    if (!loja || new Date(a.inicio).getTime() > agora) continue;
    if (!ultimo.has(a.pet_id)) ultimo.set(a.pet_id, { inicio: a.inicio, slug: loja.slug, fuso: loja.fuso, concluido: a.status === "concluido" });
  }
  const lojaUnica = lojas?.length === 1 ? lojas[0].slug : null;
  const agendarPara = (petId: string) => {
    const slug = ultimo.get(petId)?.slug ?? lojaUnica;
    return slug ? `/${slug}/agendar?pet=${petId}` : lojas?.length ? "/conta/lojas" : null;
  };

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {pets.map((p) => {
        const visita = ultimo.get(p.id);
        const link = agendarPara(p.id);
        return (
          <li key={p.id} className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <Link href={`/conta/pets/${p.id}`} className="group flex items-center gap-3">
              <AvatarPet nome={p.nome} foto={p.foto_url} className="size-14 text-xl" />
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold group-hover:underline">{p.nome}</span>
                <span className="text-xs text-neutral-500">
                  {[p.raca, porte[p.porte], `pelagem ${pelagem[p.pelagem].toLowerCase()}`, idade(p.nascimento, agora)].filter(Boolean).join(" · ")}
                </span>
                <span className="text-xs text-neutral-500">
                  {visita ? `${visita.concluido ? "Último atendimento" : "Última visita"}: ${diasAtras(visita.inicio, visita.fuso, agora)}` : "Ainda sem atendimentos"}
                </span>
              </span>
            </Link>
            <div className="flex flex-wrap gap-2">
              {link && (
                <BotaoLink href={link} prefetch={false}>
                  Agendar para {p.nome}
                </BotaoLink>
              )}
              <BotaoLink href={`/conta/pets/${p.id}`} variante="secundario">
                {p.foto_url ? "Editar" : "Pôr foto e editar"}
              </BotaoLink>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Data/hora da requisição (a página é sempre renderizada no pedido; ver connection() em lib/supabase/server.ts).
const instanteAtual = () => Date.now();

function idade(nascimento: string | null, agora: number) {
  if (!nascimento) return null;
  const [ano, mes] = nascimento.split("-").map(Number);
  const hoje = new Date(agora);
  const meses = (hoje.getFullYear() - ano) * 12 + (hoje.getMonth() + 1 - mes);
  if (meses < 1) return "recém-nascido";
  if (meses < 12) return meses === 1 ? "1 mês" : `${meses} meses`;
  const anos = Math.floor(meses / 12);
  return anos === 1 ? "1 ano" : `${anos} anos`;
}

function diasAtras(iso: string, fuso: string, agora: number) {
  const dia = (t: number) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(t));
  const dias = Math.round((dia(agora) - dia(new Date(iso).getTime())) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 60) return `há ${dias} dias`;
  const meses = Math.round(dias / 30);
  return `há ${meses} meses`;
}
