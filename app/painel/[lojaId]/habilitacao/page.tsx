import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Cartao, Carregando, Titulo, Vazio } from "@/components/ui";
import { exigirLoja, podeConfigurar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { FormularioHabilitacao } from "./formulario";

export const metadata: Metadata = { title: "Quem faz o quê" };

export default function HabilitacaoPage({ params }: PageProps<"/painel/[lojaId]/habilitacao">) {
  return (
    <>
      <Titulo>Quem faz o quê</Titulo>
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </>
  );
}

async function Conteudo({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  const { papel } = await exigirLoja(lojaId);
  const supabase = await createClient();
  const [profs, servs, habs] = await Promise.all([
    supabase.from("profissional").select("id, nome").eq("petshop_id", lojaId).eq("ativo", true).order("ordem").order("nome"),
    supabase.from("servico").select("id, nome, tipo").eq("petshop_id", lojaId).eq("ativo", true).order("tipo").order("ordem").order("nome"),
    supabase.from("profissional_servico").select("profissional_id, servico_id, fator_duracao").eq("petshop_id", lojaId),
  ]);
  if (profs.error || servs.error || habs.error) return <Aviso tipo="erro">Não foi possível carregar os dados.</Aviso>;
  if (!profs.data.length || !servs.data.length)
    return <Vazio>Cadastre profissionais e serviços ativos para definir quem faz cada serviço.</Vazio>;

  const editavel = podeConfigurar(papel);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-500">
        No agendamento, só aparecem os profissionais que fazem <strong>todos</strong> os serviços escolhidos pelo cliente. O tempo
        ajusta a duração do atendimento para cada profissional.
      </p>
      {!editavel && <Aviso>Só o dono ou o gerente altera esta configuração.</Aviso>}
      {profs.data.map((p) => {
        const habilitados = Object.fromEntries(
          habs.data.filter((h) => h.profissional_id === p.id).map((h) => [h.servico_id, Number(h.fator_duracao)]),
        );
        return (
          <Cartao key={p.id}>
            <h2 className="mb-2 font-medium">{p.nome}</h2>
            <FormularioHabilitacao lojaId={lojaId} profissional={p} servicos={servs.data} habilitados={habilitados} editavel={editavel} />
          </Cartao>
        );
      })}
    </div>
  );
}
