import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Cartao, Carregando, Titulo } from "@/components/ui";
import { NOME_PAPEL } from "@/lib/painel/formatos";
import { exigirLoja, exigirUsuario, podeConfigurar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { removerMembro } from "./acoes";
import { NovoMembro } from "./formulario";

export const metadata: Metadata = { title: "Equipe" };

export default function EquipePage({ params }: PageProps<"/painel/[lojaId]/equipe">) {
  return (
    <>
      <Titulo>Equipe</Titulo>
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </>
  );
}

async function Conteudo({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  const [{ papel }, eu] = await Promise.all([exigirLoja(lojaId), exigirUsuario()]);
  if (!podeConfigurar(papel)) return <Aviso>Só o dono ou o gerente vê a equipe.</Aviso>;

  const supabase = await createClient();
  const [equipe, profs] = await Promise.all([
    supabase.rpc("listar_equipe", { p_petshop_id: lojaId }),
    supabase.from("profissional").select("id, nome").eq("petshop_id", lojaId).eq("ativo", true).order("nome"),
  ]);
  if (equipe.error || profs.error) return <Aviso tipo="erro">Não foi possível carregar a equipe.</Aviso>;
  const nomeProf = new Map(profs.data.map((p) => [p.id, p.nome]));
  const ehDono = papel === "dono";

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2" aria-label="Membros da equipe">
        {equipe.data.map((m) => (
          <li key={m.user_id} className="flex min-h-14 items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.email}</p>
              <p className="text-sm text-neutral-500">
                {NOME_PAPEL[m.papel]}
                {m.profissional_id && ` · ${nomeProf.get(m.profissional_id) ?? "profissional inativo"}`}
                {m.user_id === eu.id && " · você"}
              </p>
            </div>
            {ehDono && m.user_id !== eu.id && (
              <form action={removerMembro}>
                <input type="hidden" name="loja_id" value={lojaId} />
                <input type="hidden" name="user_id" value={m.user_id} />
                <button type="submit" className="min-h-11 px-2 text-sm text-red-700 dark:text-red-400">
                  Remover
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {ehDono ? (
        <Cartao>
          <h2 className="mb-3 font-medium">Adicionar pessoa</h2>
          <NovoMembro lojaId={lojaId} profissionais={profs.data} />
        </Cartao>
      ) : (
        <Aviso>Só o dono adiciona ou remove pessoas da equipe.</Aviso>
      )}
    </div>
  );
}
