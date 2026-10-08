export interface DepthDomain {
  min: number;
  max: number;
}
export const FEET_TO_METERS = 0.3048;
export function convertFeetToMeters(feet: number): number {
  return feet * FEET_TO_METERS;
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValidDepthLimit(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value > 0)
  );
}

/** Apply a fixed scale without changing the measured project domain. */
export function applyDepthLimit(
  domain: DepthDomain | null,
  limitFeet: unknown,
) {
  if (!domain) return null;
  return limitFeet !== null && isValidDepthLimit(limitFeet)
    ? { min: 0, max: limitFeet }
    : domain;
}

/**
 * Merge multiple depth domains into one (O(projects)).
 */
export function mergeDepthDomains(
  domains: readonly (DepthDomain | null | undefined)[] | null | undefined,
): DepthDomain | null {
  let max = 0;
  let hasDepth = false;

  (domains || []).forEach((domain) => {
    if (!domain || !isFiniteNumber(domain.max)) return;
    hasDepth = true;
    if (domain.max > max) max = domain.max;
  });

  if (!hasDepth) return null;
  return { min: 0, max: Math.max(0, max) };
}

export type DepthParser = (value: unknown) => number | null | undefined;
export type FeatureDepthResolver = (
  feature: Feature,
) => number | null | undefined;

/** Alias ordering and numeric parsing remain explicit caller policy. */
export function firstPropertyDepth<Properties extends object>(
  properties: Properties | null | undefined,
  keys: readonly (keyof Properties)[],
  parse: DepthParser,
): number | null {
  if (!properties) return null;
  for (const key of keys) {
    const depth = parse(properties[key]);
    if (depth != null) return depth;
  }
  return null;
}

/** Coordinate elevation is optional depth input; consumers opt in explicitly. */
export function meanGeometryDepth(
  geometry: Geometry | null | undefined,
  parse: DepthParser,
): number | null {
  let sum = 0;
  let count = 0;
  for (const position of geometryPositionSteps(geometry)) {
    if (!position || position.length < 3) continue;
    const depth = parse(position[2]);
    if (depth == null) continue;
    sum += depth;
    count++;
  }
  return count ? sum / count : null;
}

/** Preserve feature/source identity whenever the derived property is already current. */
export function annotateFeatureDepths(
  collection: FeatureCollection,
  {
    resolveDepth,
    property,
    parseStoredDepth,
  }: {
    resolveDepth: FeatureDepthResolver;
    property: string;
    parseStoredDepth?: DepthParser;
  },
): FeatureCollection {
  let changed = false;
  const features = collection.features.map((feature) => {
    const depth = resolveDepth(feature);
    if (depth == null) return feature;
    const properties = feature.properties ?? {};
    const stored = parseStoredDepth
      ? parseStoredDepth(properties[property])
      : properties[property];
    if (stored === depth) return feature;
    changed = true;
    return { ...feature, properties: { ...properties, [property]: depth } };
  });
  return changed ? { ...collection, features } : collection;
}

export function depthDomainFromValues(
  values: Iterable<number | null | undefined>,
): DepthDomain | null {
  let max = 0;
  let hasDepth = false;
  for (const depth of values) {
    if (depth == null) continue;
    hasDepth = true;
    max = Math.max(max, Number.isFinite(depth) ? depth : 0);
  }
  return hasDepth ? { min: 0, max } : null;
}

export function computeCollectionDepthDomain(
  collections: readonly FeatureCollection[],
  resolveDepth: FeatureDepthResolver,
): DepthDomain | null {
  function* values() {
    for (const collection of collections) {
      for (const feature of collection.features) yield resolveDepth(feature);
    }
  }
  return depthDomainFromValues(values());
}
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { geometryPositionSteps } from "./preparation.js";
