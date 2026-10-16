/** Wire values are shared by forms, GeoJSON, rendering, and offline operations. */
export const LANDMARK_ICON_OPTIONS = [
  { value: "DEFAULT", label: "Default" },
  { value: "CAVE", label: "Cave" },
  { value: "UNKNOWN", label: "Unknown" },
  { value: "ATTENTION", label: "Attention" },
  { value: "NOGO", label: "No go" },
] as const;

export type LandmarkIcon = (typeof LANDMARK_ICON_OPTIONS)[number]["value"];

export function isLandmarkIcon(value: unknown): value is LandmarkIcon {
  return LANDMARK_ICON_OPTIONS.some((option) => option.value === value);
}

/** Display fallback only. Mutation inputs must use isLandmarkIcon instead. */
export function normalizeLandmarkIcon(value: unknown): LandmarkIcon {
  return isLandmarkIcon(value) ? value : "DEFAULT";
}
