// XPF price per court session. Single source — used by activation mutation and the UI.
const PRICE = { 30: 250, 60: 500 } as const;

export function cost(durationMin: number): number {
  if (durationMin !== 30 && durationMin !== 60) {
    throw new Error("Durée invalide (30 ou 60 minutes uniquement)");
  }
  return PRICE[durationMin];
}
