import { describe, expect, it } from "vitest";
import { mensagemDeLogin } from "./erro-login";

describe("mensagem do login", () => {
  it("diz quando falta confirmar o e-mail", () => {
    expect(mensagemDeLogin({ code: "email_not_confirmed", status: 400 })).toMatch(/^Confirme seu e-mail/);
  });
  it("muitas tentativas", () => {
    expect(mensagemDeLogin({ code: "over_request_rate_limit", status: 429 })).toMatch(/^Muitas tentativas/);
  });
  it("credenciais inválidas e outros erros", () => {
    expect(mensagemDeLogin({ code: "invalid_credentials", status: 400 })).toBe("E-mail ou senha incorretos.");
    expect(mensagemDeLogin({})).toBe("E-mail ou senha incorretos.");
  });
});
