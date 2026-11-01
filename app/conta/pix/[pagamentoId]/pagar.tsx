"use client";

import { useState } from "react";
import { PagarPix } from "@/components/pix";
import { Aviso, BotaoLink } from "@/components/ui";
import type { Pix } from "@/lib/pagamentos/servico";

export function PagarDeNovo({ inicial }: { inicial: Pix }) {
  const [pago, setPago] = useState(inicial.status === "pago");
  if (pago)
    return (
      <div className="flex flex-col gap-3" role="status">
        <Aviso tipo="ok">Sinal pago. Seu horário está garantido.</Aviso>
        <BotaoLink href="/conta/agendamentos">Ver meus agendamentos</BotaoLink>
      </div>
    );
  return <PagarPix inicial={inicial} onPago={() => setPago(true)} />;
}
