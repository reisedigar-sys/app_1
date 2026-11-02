"use client";

import { useEffect, useState } from "react";
import { consultarPix, simularPix } from "@/app/conta/pix/acoes";
import type { Pix } from "@/lib/pagamentos/servico";
import { formatarReais } from "@/lib/painel/formatos";
import { Aviso, Botao } from "./ui";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Pagar o sinal: QR Code, "copiar código" e contagem do prazo. A tela consulta a situação a cada 3 segundos e segue
 * sozinha quando o Pix cai; o tutor não precisa apertar nada.
 */
export function PagarPix({ inicial, onPago, onVencido }: { inicial: Pix; onPago: (pix: Pix) => void; onVencido?: () => void }) {
  const [pix, setPix] = useState(inicial);
  const [agora, setAgora] = useState(() => Date.now());
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [simulando, setSimulando] = useState(false);
  const restante = new Date(pix.expiraEm).getTime() - agora;
  const vencido = pix.status === "expirado" || pix.status === "cancelado" || (pix.status === "aguardando" && restante <= 0);

  useEffect(() => {
    if (pix.status !== "aguardando") return;
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    const consulta = setInterval(async () => {
      const r = await consultarPix(pix.id);
      if (r.ok) setPix(r.dados);
    }, 3000);
    return () => {
      clearInterval(relogio);
      clearInterval(consulta);
    };
  }, [pix.id, pix.status]);

  useEffect(() => {
    if (pix.status === "pago") onPago(pix);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avisa uma vez, quando o Pix cai
  }, [pix.status]);

  async function copiar() {
    if (!pix.payload) return;
    await navigator.clipboard.writeText(pix.payload).catch(() => undefined);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  async function simular() {
    setSimulando(true);
    const r = await simularPix(pix.id);
    setSimulando(false);
    if (r.ok) setPix(r.dados);
    else setErro(r.erro);
  }

  if (vencido)
    return (
      <div className="flex flex-col gap-3" role="status">
        <Aviso tipo="alerta">O tempo para pagar acabou e o horário foi liberado. Nada foi cobrado.</Aviso>
        {onVencido && (
          <Botao type="button" onClick={onVencido}>
            Escolher outro horário
          </Botao>
        )}
      </div>
    );

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div>
        <p className="text-sm text-neutral-500">Sinal por Pix</p>
        <p className="font-titulo text-3xl font-bold tabular-nums">{formatarReais(pix.valorCentavos)}</p>
      </div>
      {pix.imagem ? (
        // eslint-disable-next-line @next/next/no-img-element -- QR Code em data URI, gerado pelo banco do Pix
        <img src={pix.imagem} alt="QR Code do Pix" className="size-56 rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-800" />
      ) : (
        <Aviso tipo="erro">Não foi possível gerar o QR Code. Tente de novo em instantes.</Aviso>
      )}
      <p className="text-sm" aria-live="polite">
        Pague em até <strong className="tabular-nums">{mmss(restante)}</strong> para garantir o horário.
      </p>
      {pix.payload && (
        <Botao type="button" variante="secundario" onClick={copiar} className="w-full">
          {copiado ? "Código copiado!" : "Copiar código Pix"}
        </Botao>
      )}
      <p className="text-xs text-neutral-500">Abra o app do seu banco, escolha Pix copia e cola (ou leia o QR Code) e pague. Esta tela atualiza sozinha.</p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {pix.teste && (
        <Botao type="button" variante="secundario" onClick={simular} disabled={simulando} className="w-full border-dashed">
          {simulando ? "Simulando…" : "Simular pagamento (teste)"}
        </Botao>
      )}
    </div>
  );
}
