import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({}));
vi.mock("./sessao", () => ({}));

describe("opcional", () => {
  it("aceita campo ausente ou vazio como null", async () => {
    const { opcional } = await import("./acao");
    const s = z.object({ id: opcional(z.guid()), nome: z.string() });
    expect(s.parse({ nome: "Rex" })).toEqual({ id: null, nome: "Rex" });
    expect(s.parse({ nome: "Rex", id: " " })).toEqual({ id: null, nome: "Rex" });
    expect(() => s.parse({ nome: "Rex", id: "x" })).toThrow();
  });
});
