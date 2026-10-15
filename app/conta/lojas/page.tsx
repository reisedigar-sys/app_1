import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { BotaoLink, Cartao, Carregando, Titulo, Vazio } from "@/components/ui";
import { exigirTutor } from "@/lib/conta/sessao";
import { createClient } from "@/lib/supabase/server";
import { definirAvisosWhatsApp } from "./acoes";

export const metadata: Metadata = { title: "Minhas lojas" };

export default function MinhasLojasPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <Titulo>Minhas lojas</Titulo>
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </main>
  );
}

function quando(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(iso))
    .replace(",", "");
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-Z]/.test(p))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

async function Conteudo() {
  await exigirTutor("/conta/lojas");
  const supabase = await createClient();
  const { data: lojas, error } = await supabase.rpc("minhas_lojas");
  if (error) return <Vazio>Não foi possível carregar suas lojas.</Vazio>;

  return (
    <>
      {lojas.length === 0 ? (
        <Vazio>Você ainda não agendou em nenhuma loja. Use o link que o seu petshop passou.</Vazio>
      ) : (
        <ul className="flex flex-col gap-3">
          {lojas.map((l) => (
            <li key={l.petshop_id}>
              <Cartao className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-marca-700 font-semibold text-white">
                    {/* eslint-disable-next-line @next/next/no-img-element -- logo do Storage, tamanho pequeno */}
                    {l.logo_url ? <img src={l.logo_url} alt="" className="size-full bg-white object-contain" /> : <span aria-hidden>{iniciais(l.nome)}</span>}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <Link href={`/${l.slug}`} className="truncate font-medium hover:underline">
                      {l.nome}
                    </Link>
                    <span className="text-sm text-neutral-500">
                      {l.proximo_inicio ? `Próximo: ${quando(l.proximo_inicio, l.fuso)}` : "Nenhum agendamento futuro"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <BotaoLink href={`/${l.slug}/agendar`} prefetch={false}>
                    Agendar
                  </BotaoLink>
                  <FormAcao acao={definirAvisosWhatsApp} semBotao className="flex flex-col items-end gap-1 text-sm">
                    <input type="hidden" name="loja_id" value={l.petshop_id} />
                    <input type="hidden" name="ligado" value={l.avisos_whatsapp ? "0" : "1"} />
                    <span className="text-neutral-500">{l.avisos_whatsapp ? "Recebe avisos pelo WhatsApp" : "Sem avisos pelo WhatsApp"}</span>
                    <BotaoEnviar variante="secundario">{l.avisos_whatsapp ? "Parar avisos" : "Receber avisos"}</BotaoEnviar>
                  </FormAcao>
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
