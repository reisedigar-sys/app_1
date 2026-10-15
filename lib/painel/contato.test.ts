import { describe, expect, it } from "vitest";
import { linkLigar, linkWhatsApp, textoWhatsApp } from "./contato";

describe("contato com o tutor", () => {
  it("monta os links a partir do telefone E.164", () => {
    expect(linkLigar("+5511988887777")).toBe("tel:+5511988887777");
    expect(linkWhatsApp("+5511988887777")).toBe("https://wa.me/5511988887777");
    expect(linkWhatsApp("+5511988887777", "Olá, Ana!")).toBe("https://wa.me/5511988887777?text=Ol%C3%A1%2C%20Ana!");
    expect(linkLigar(null)).toBeNull();
    expect(linkWhatsApp("")).toBeNull();
  });

  it("sugere o texto pelo status, com o primeiro nome do tutor", () => {
    const base = { loja: "Pet Feliz", tutor: "Ana Souza", pet: "Paçoca", quando: "hoje às 10:00" };
    expect(textoWhatsApp({ ...base, status: "pronto" })).toBe("Olá, Ana! Aqui é da Pet Feliz. O atendimento de Paçoca terminou: já pode vir buscar.");
    expect(textoWhatsApp({ ...base, status: "agendado" })).toBe("Olá, Ana! Aqui é da Pet Feliz. Podemos confirmar o horário de Paçoca hoje às 10:00?");
    expect(textoWhatsApp({ ...base, tutor: null, status: "confirmado" })).toMatch(/^Olá! Aqui é da Pet Feliz, sobre o atendimento de Paçoca hoje às 10:00\.$/);
  });
});
