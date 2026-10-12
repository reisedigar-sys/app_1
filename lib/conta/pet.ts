export const PORTES_PET = [
  ["mini", "Mini", "até 5 kg"],
  ["pequeno", "Pequeno", "5 a 10 kg"],
  ["medio", "Médio", "10 a 25 kg"],
  ["grande", "Grande", "25 a 45 kg"],
  ["gigante", "Gigante", "mais de 45 kg"],
] as const;

export const PELAGENS_PET = [
  ["curta", "Curta"],
  ["media", "Média"],
  ["longa", "Longa"],
] as const;

export type Pet = {
  id: string;
  nome: string;
  especie: string;
  raca: string | null;
  porte: (typeof PORTES_PET)[number][0];
  pelagem: (typeof PELAGENS_PET)[number][0];
  nascimento: string | null;
  alergias: string | null;
  temperamento: string | null;
  vacinas: string | null;
  foto_url: string | null;
};
