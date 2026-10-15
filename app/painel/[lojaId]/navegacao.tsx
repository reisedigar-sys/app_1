"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Telas de configuração: ficam juntas em "Configurar", com um menu próprio.
const CONFIGURACAO = [
  ["/configurar", "Resumo"],
  ["/loja", "Loja"],
  ["/profissionais", "Profissionais"],
  ["/servicos", "Serviços"],
  ["/precos", "Preços"],
  ["/habilitacao", "Quem faz o quê"],
  ["/horarios", "Horários"],
  ["/bloqueios", "Bloqueios"],
  ["/equipe", "Equipe"],
] as const;

const icone = (d: ReactNode) => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-6 md:hidden" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

// [sufixo, rótulo, só para quem opera a recepção, ícone]
const OPERACAO = [
  ["", "Hoje", false, icone(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>)],
  ["/agenda", "Agenda", false, icone(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>)],
  ["/lista-espera", "Espera", true, icone(<><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>)],
  ["/mensagens", "Mensagens", true, icone(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />)],
  ["/configurar", "Configurar", false, icone(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>)],
] as const;

const ehConfiguracao = (caminho: string, base: string) => CONFIGURACAO.some(([s]) => caminho.startsWith(base + s));

/**
 * Menu do dia a dia: barra fixa embaixo no celular (ao alcance do polegar) e abas no computador.
 * A ficha do pet e do atendimento contam como Agenda.
 */
export function NavegacaoOperacao({ lojaId, operacao }: { lojaId: string; operacao: boolean }) {
  const atual = usePathname();
  const base = `/painel/${lojaId}`;
  const ativo = (sufixo: string) => {
    if (sufixo === "") return atual === base;
    if (sufixo === "/configurar") return ehConfiguracao(atual, base);
    if (sufixo === "/agenda") return atual.startsWith(`${base}/agenda`) || atual.startsWith(`${base}/pets`);
    return atual.startsWith(base + sufixo);
  };
  return (
    <nav
      aria-label="Painel da loja"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:pb-0 md:backdrop-blur-none dark:border-neutral-800 dark:bg-neutral-950/95 md:dark:bg-transparent"
    >
      <ul className="mx-auto flex max-w-4xl md:gap-1">
        {OPERACAO.filter(([, , soRecepcao]) => operacao || !soRecepcao).map(([sufixo, rotulo, , svg]) => (
          <li key={sufixo} className="flex-1 md:flex-none">
            <Link
              href={base + sufixo}
              aria-current={ativo(sufixo) ? "page" : undefined}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-neutral-500 aria-[current=page]:text-marca-700 md:min-h-10 md:flex-row md:rounded-full md:px-4 md:text-sm md:text-neutral-600 md:hover:bg-neutral-100 md:aria-[current=page]:bg-marca-700 md:aria-[current=page]:text-white dark:text-neutral-400 dark:aria-[current=page]:text-marca-400 md:dark:text-neutral-300 md:dark:hover:bg-neutral-900 md:dark:aria-[current=page]:text-white"
            >
              {svg}
              {rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Menu das telas de configuração; só aparece dentro de "Configurar". */
export function NavegacaoConfiguracao({ lojaId }: { lojaId: string }) {
  const atual = usePathname();
  const base = `/painel/${lojaId}`;
  if (!ehConfiguracao(atual, base)) return null;
  return (
    <nav aria-label="Configuração da loja" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 pb-2">
        {CONFIGURACAO.map(([sufixo, rotulo]) => {
          const href = base + sufixo;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={atual.startsWith(href) ? "page" : undefined}
                className="flex min-h-10 items-center whitespace-nowrap rounded-full border border-neutral-200 px-3 text-sm text-neutral-600 hover:bg-neutral-100 aria-[current=page]:border-marca-700 aria-[current=page]:bg-marca-50 aria-[current=page]:text-marca-800 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:aria-[current=page]:bg-marca-950 dark:aria-[current=page]:text-marca-300"
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
