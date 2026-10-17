import { calculateDistanceInMeters } from "./geo.js";

export interface GeographicCandidate {
  coordinates: readonly number[];
}

export interface NearestGeographicCandidate<Candidate> {
  candidate: Candidate | null;
  distance: number;
}

/** Stable nearest point selection; callers own candidate eligibility and radius. */
export function findNearestGeographicCandidate<
  Candidate extends GeographicCandidate,
>(
  origin: readonly number[],
  candidates: Iterable<Candidate>,
  distanceInMeters: (
    a: readonly number[],
    b: readonly number[],
  ) => number = calculateDistanceInMeters,
): NearestGeographicCandidate<Candidate> {
  let nearest: Candidate | null = null;
  let nearestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = distanceInMeters(origin, candidate.coordinates);
    if (!Number.isFinite(distance) || distance < 0) continue;
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
    if (nearestDistance === 0) break;
  }
  return { candidate: nearest, distance: nearestDistance };
}
