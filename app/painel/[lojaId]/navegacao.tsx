"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  ["", "Início"],
  ["/agenda", "Agenda"],
  ["/mensagens", "Mensagens"],
  ["/lista-espera", "Lista de espera"],
  ["/loja", "Loja"],
  ["/profissionais", "Profissionais"],
  ["/servicos", "Serviços"],
  ["/precos", "Preços"],
  ["/habilitacao", "Quem faz o quê"],
  ["/horarios", "Horários"],
  ["/bloqueios", "Bloqueios"],
  ["/equipe", "Equipe"],
] as const;

export function Navegacao({ lojaId }: { lojaId: string }) {
  const atual = usePathname();
  const base = `/painel/${lojaId}`;
  return (
    <nav aria-label="Configuração da loja" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 pb-2">
        {ITENS.map(([sufixo, rotulo]) => {
          const href = base + sufixo;
          const ativo = sufixo === "" ? atual === base : atual.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={ativo ? "page" : undefined}
                className="flex min-h-10 items-center whitespace-nowrap rounded-full px-3 text-sm text-neutral-600 hover:bg-neutral-100 aria-[current=page]:bg-marca-700 aria-[current=page]:text-white dark:text-neutral-300 dark:hover:bg-neutral-900"
              >
                {rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
