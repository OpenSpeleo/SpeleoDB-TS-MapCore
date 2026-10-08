/**
 * Landmark collection grouping (read-only, derived entirely from the cached
 * landmarks GeoJSON FeatureCollection).
 *
 * The backend `/api/v2/landmarks/geojson/` endpoint embeds collection metadata
 * on every feature (`collection`, `collection_name`, `collection_color`,
 * `collection_type`, `is_personal_collection`). Because all of that travels
 * with the cached payload, the app can build the full collection grouping for
 * the Landmark panel offline without any extra endpoint, cache key, or sync.
 *
 * Mirrors the web map viewer's `LandmarkUI.getLandmarkCollectionGroups`:
 * personal collections first, then alphabetical; landmarks alphabetical within
 * each group; safe color fallback.
 */

import type * as GeoJSON from "geojson";
import { safeHexColor } from "./colors.js";

const PERSONAL_COLLECTION_ID = "__personal__";
const PERSONAL_COLLECTION_NAME = "Personal Landmarks";
const UNNAMED_COLLECTION_NAME = "Unnamed Collection";
const UNNAMED_LANDMARK_NAME = "Unnamed Landmark";

export interface LandmarkListItem {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  collectionId: string;
  collectionName: string;
  collectionColor: string;
  isPersonalCollection: boolean;
}

export interface LandmarkCollectionGroup {
  id: string;
  name: string;
  color: string;
  isPersonal: boolean;
  count: number;
  landmarks: LandmarkListItem[];
}

function toStringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function readFeatureItem(
  feature: unknown,
  fallbackColor: string,
): LandmarkListItem | null {
  if (!feature || typeof feature !== "object") return null;
  const f = feature as {
    id?: unknown;
    properties?: Record<string, unknown> | null;
    geometry?: { type?: unknown; coordinates?: unknown } | null;
  };

  const properties = f.properties ?? {};
  const geometry = f.geometry ?? null;
  if (
    !geometry ||
    geometry.type !== "Point" ||
    !Array.isArray(geometry.coordinates)
  ) {
    return null;
  }
  const coords = geometry.coordinates as unknown[];
  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  const id = toStringValue(properties.id) || toStringValue(f.id);
  if (!id) return null;

  const isPersonal =
    properties.is_personal_collection === true ||
    properties.collection_type === "PERSONAL";
  const collectionId =
    toStringValue(properties.collection) || PERSONAL_COLLECTION_ID;
  const collectionName =
    toStringValue(properties.collection_name) ||
    (isPersonal ? PERSONAL_COLLECTION_NAME : UNNAMED_COLLECTION_NAME);

  return {
    id,
    name: toStringValue(properties.name) || UNNAMED_LANDMARK_NAME,
    description: toStringValue(properties.description),
    latitude,
    longitude,
    collectionId,
    collectionName,
    collectionColor: safeHexColor(properties.collection_color, fallbackColor),
    isPersonalCollection: isPersonal,
  };
}

/**
 * Group the landmark features of a FeatureCollection by their collection.
 *
 * @param featureCollection Cached landmarks GeoJSON (or null/undefined).
 * @returns Collection groups, personal-first then alphabetical by name, with
 *          landmarks sorted alphabetically inside each group.
 */
export function buildLandmarkCollectionGroups(
  featureCollection: GeoJSON.FeatureCollection | null | undefined,
  fallbackColor = "#94a3b8",
): LandmarkCollectionGroup[] {
  const features = Array.isArray(featureCollection?.features)
    ? featureCollection.features
    : [];

  const items = features
    .map((feature) => readFeatureItem(feature, fallbackColor))
    .filter((item): item is LandmarkListItem => item !== null);
  return groupLandmarks(items, {
    key: (item) => item.collectionId,
    create: (item) => ({
      id: item.collectionId,
      name: item.collectionName,
      color: item.collectionColor,
      isPersonal: item.isPersonalCollection,
      count: 0,
      landmarks: [],
    }),
    update: (group) => {
      group.count += 1;
    },
    compareItems: (a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    compareGroups: (a, b) =>
      a.isPersonal !== b.isPersonal
        ? a.isPersonal
          ? -1
          : 1
        : a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  });
}

/** Group immutable input; callers own labels, permissions, and ordering policy. */
export function groupLandmarks<Item, Group extends { landmarks: Item[] }>(
  items: readonly Item[],
  policy: {
    key: (item: Item) => string;
    create: (item: Item, key: string) => Group;
    update?: (group: Group, item: Item) => void;
    compareItems: (left: Item, right: Item) => number;
    compareGroups: (left: Group, right: Group) => number;
  },
): Group[] {
  const groups = new Map<string, Group>();
  for (const item of items) {
    const key = policy.key(item);
    let group = groups.get(key);
    if (!group) {
      group = policy.create(item, key);
      groups.set(key, group);
    }
    policy.update?.(group, item);
    group.landmarks.push(item);
  }
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      landmarks: group.landmarks.sort(policy.compareItems),
    }))
    .sort(policy.compareGroups);
}
