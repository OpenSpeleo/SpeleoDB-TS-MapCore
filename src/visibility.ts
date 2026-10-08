/** Individual intent survives a closed country gate; readiness is app-owned. */
export function isEffectivelyVisible({
  individual,
  country,
  eligible = true,
}: {
  individual: boolean;
  country: boolean;
  eligible?: boolean;
}): boolean {
  return individual && country && eligible;
}
