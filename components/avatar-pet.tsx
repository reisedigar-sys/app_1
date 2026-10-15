/** Foto do pet ou, sem foto, a inicial do nome em coral (sem nome, uma pata). */
export function AvatarPet({ nome, foto, className = "size-12 text-lg" }: { nome?: string; foto?: string | null; className?: string }) {
  const inicial = nome?.trim().charAt(0).toLocaleUpperCase("pt-BR");
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-marca-100 font-titulo font-bold text-marca-800 dark:bg-marca-950 dark:text-marca-300 ${className}`}
    >
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto do Storage
        <img src={foto} alt="" className="size-full object-cover" />
      ) : inicial ? (
        <span aria-hidden>{inicial}</span>
      ) : (
        <svg aria-hidden viewBox="0 0 24 24" className="size-1/2" fill="currentColor">
          <circle cx="6.5" cy="9.5" r="2" />
          <circle cx="10.5" cy="5.5" r="2" />
          <circle cx="15.5" cy="6" r="2" />
          <circle cx="18.5" cy="10.5" r="1.8" />
          <path d="M8 16.5c0-2.6 2-4.8 4.5-4.8s5 2.6 5 5.1c0 2-1.4 3.2-3.2 3.2-1.1 0-1.6-.6-2.7-.6s-1.6.6-2.7.6C9.2 20 8 18.6 8 16.5z" />
        </svg>
      )}
    </span>
  );
}
