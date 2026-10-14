"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Botao } from "./ui";

type Escopo = "tutor" | "equipe";
type Situacao = "carregando" | "indisponivel" | "sem-suporte" | "instalar-iphone" | "bloqueado" | "desligado" | "ligado";

const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function bytesDaChave(base64: string) {
  const b = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

const ehIphone = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalado = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function inscricaoAtual() {
  const registro = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return { registro, inscricao: await registro.pushManager.getSubscription() };
}

/** Liga ou desliga os avisos (push) neste celular. Cada celular é ligado separadamente. */
export function AvisosPush({ escopo, texto }: { escopo: Escopo; texto: string }) {
  const [situacao, setSituacao] = useState<Situacao>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    (async () => {
      let s: Situacao;
      if (!CHAVE_PUBLICA) s = "indisponivel";
      else if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // No iPhone, o push só existe no app adicionado à tela de início (iOS 16.4 ou mais novo).
        s = ehIphone() && !instalado() ? "instalar-iphone" : "sem-suporte";
      } else if (Notification.permission === "denied") s = "bloqueado";
      else {
        const { inscricao } = await inscricaoAtual();
        // A inscrição existe no celular, mas pode ser de outro escopo ou de outra conta: grava de novo ao ligar.
        s = inscricao && Notification.permission === "granted" && localStorage.getItem(`avisos-${escopo}`) === inscricao.endpoint ? "ligado" : "desligado";
      }
      if (ativo) setSituacao(s);
    })().catch(() => ativo && setSituacao("sem-suporte"));
    return () => {
      ativo = false;
    };
  }, [escopo]);

  async function ligar() {
    setOcupado(true);
    setErro("");
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setSituacao("bloqueado");
        return;
      }
      const { registro, inscricao: existente } = await inscricaoAtual();
      const inscricao = existente ?? (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDaChave(CHAVE_PUBLICA) }));
      const json = inscricao.toJSON();
      const { error } = await createClient().rpc("registrar_push", {
        p_escopo: escopo,
        p_endpoint: inscricao.endpoint,
        p_p256dh: json.keys?.p256dh ?? "",
        p_auth: json.keys?.auth ?? "",
      });
      if (error) throw error;
      localStorage.setItem(`avisos-${escopo}`, inscricao.endpoint);
      setSituacao("ligado");
    } catch {
      setErro("Não foi possível ligar os avisos. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    setErro("");
    try {
      const { inscricao } = await inscricaoAtual();
      if (inscricao) {
        const { error } = await createClient().rpc("remover_push", { p_escopo: escopo, p_endpoint: inscricao.endpoint });
        if (error) throw error;
        // A mesma inscrição do navegador pode servir ao outro escopo (tutor e equipe no mesmo celular).
        const outro = escopo === "tutor" ? "equipe" : "tutor";
        if (localStorage.getItem(`avisos-${outro}`) !== inscricao.endpoint) await inscricao.unsubscribe();
      }
      localStorage.removeItem(`avisos-${escopo}`);
      setSituacao("desligado");
    } catch {
      setErro("Não foi possível desligar os avisos. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  if (situacao === "carregando") return null;
  return (
    <div className="flex flex-col gap-2 text-sm" data-avisos={situacao}>
      <p className="text-neutral-600 dark:text-neutral-300">{texto}</p>
      {situacao === "ligado" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-emerald-700 dark:text-emerald-400">Avisos ligados neste celular.</span>
          <Botao variante="secundario" onClick={desligar} disabled={ocupado}>
            Desligar
          </Botao>
        </div>
      )}
      {situacao === "desligado" && (
        <Botao onClick={ligar} disabled={ocupado} className="self-start">
          {ocupado ? "Ligando…" : "Receber avisos neste celular"}
        </Botao>
      )}
      {situacao === "bloqueado" && (
        <p className="text-amber-800 dark:text-amber-300">Os avisos estão bloqueados para este site. Libere as notificações nas configurações do navegador e volte aqui.</p>
      )}
      {situacao === "instalar-iphone" && (
        <p className="text-neutral-600 dark:text-neutral-300">
          No iPhone, os avisos só funcionam com o app na tela de início: toque em <strong>Compartilhar</strong> e depois em{" "}
          <strong>Adicionar à Tela de Início</strong>. Abra o app por lá e volte a esta tela.
        </p>
      )}
      {situacao === "indisponivel" && <p className="text-neutral-500">Os avisos no celular ainda não estão disponíveis.</p>}
      {situacao === "sem-suporte" && <p className="text-neutral-500">Este navegador não recebe avisos no celular.</p>}
      {erro && <p className="text-red-600">{erro}</p>}
    </div>
  );
}
