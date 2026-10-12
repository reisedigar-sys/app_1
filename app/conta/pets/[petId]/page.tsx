import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotaoEnviar } from "@/components/form-acao";
import { Cartao, Carregando } from "@/components/ui";
import type { Pet } from "@/lib/conta/pet";
import { exigirTutor } from "@/lib/conta/sessao";
import { createClient } from "@/lib/supabase/server";
import { removerPet } from "../acoes";
import { FormularioPet } from "../formulario";

export const metadata: Metadata = { title: "Pet" };

export default function PetPage({ params }: PageProps<"/conta/pets/[petId]">) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const tutor = await exigirTutor(`/conta/pets/${petId}`);
  const supabase = await createClient();
  const { data: pet } = await supabase
    .from("pet")
    .select("id, nome, especie, raca, porte, pelagem, nascimento, alergias, temperamento, vacinas, foto_url")
    .eq("id", petId)
    .eq("tutor_id", tutor.id)
    .eq("ativo", true)
    .maybeSingle();
  if (!pet) notFound();
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{pet.nome}</h1>
      <Cartao>
        <FormularioPet tutorId={tutor.id} pet={pet as Pet} />
      </Cartao>
      <form action={removerPet} className="mt-4 flex justify-center">
        <input type="hidden" name="id" value={pet.id} />
        <BotaoEnviar variante="perigo">Remover pet</BotaoEnviar>
      </form>
    </>
  );
}
