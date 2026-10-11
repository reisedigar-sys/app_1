import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { LOJA, PET } from "../helpers/ids";

// Passa pela API de verdade (Auth + PostgREST), como o app vai fazer.
function cliente() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
}

describe("API com a chave pública", () => {
  it("visitante lê o catálogo, mas não os pets", async () => {
    const sb = cliente();
    const { data: lojas, error } = await sb.from("petshop").select("slug").order("slug");
    expect(error).toBeNull();
    expect(lojas?.map((l) => l.slug)).toEqual(["banho-e-cia-moema", "pet-feliz-centro", "pet-feliz-zona-sul"]);
    const { data: pets } = await sb.from("pet").select("id");
    expect(pets).toEqual([]);
  });

  it("tutora logada vê só os próprios pets", async () => {
    const sb = cliente();
    const { error } = await sb.auth.signInWithPassword({ email: "ana@tutor.test", password: "senha123" });
    expect(error).toBeNull();
    const { data } = await sb.from("pet").select("id").order("id");
    expect(data?.map((p) => p.id)).toEqual([PET.thor, PET.mel]);
  });

  it("gerente logado vê a agenda da própria loja e nada da Moema", async () => {
    const sb = cliente();
    await sb.auth.signInWithPassword({ email: "gabriel@petfeliz.test", password: "senha123" });
    const { data: centro } = await sb.from("agendamento").select("id").eq("petshop_id", LOJA.centro);
    expect(centro?.length).toBe(2);
    const { data: moema } = await sb.from("agendamento").select("id").eq("petshop_id", LOJA.moema);
    expect(moema).toEqual([]);
  });
});
