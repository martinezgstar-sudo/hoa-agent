// v3 Phase 10b — rule-based pickup-day resolver.
//
// No LLM. No network calls. Rules only:
//   1. If the community's (county, city) matches a CITY_DEFAULTS entry
//      whose schedule text we've committed, return that schedule and
//      tag pickup_source='city-default:<city>'.
//   2. Otherwise, if the community is in Palm Beach County, return the
//      SWA of PBC schedule-lookup URL as pickup_lookup_url with
//      pickup_source='swa-directory'. Day fields stay null so the
//      community page shows "Check your pickup days" instead of a
//      fake schedule.
//   3. Out-of-market rows return all-null; nothing is written.
//
// New CITY_DEFAULTS entries land here only after their day text is
// verified against the city's public schedule page. Never invent
// days from context; leave nulls and let the SWA fallback surface.

export interface PickupResult {
  trash_pickup_days:     string | null;
  recycling_pickup_days: string | null;
  bulk_pickup_days:      string | null;
  trash_authority:       string | null;
  pickup_lookup_url:     string | null;
  pickup_source:         string | null;
}

const SWA_LOOKUP    = 'https://www.swa.org/1176/Collection-Schedules';
const SWA_AUTHORITY = 'Solid Waste Authority of Palm Beach County';

// Keyed on lowercased city name. Empty until a city's schedule is
// verified. Never seed placeholders here — a wrong day is worse than
// no day, because the "Check your pickup days" link stays honest.
const CITY_DEFAULTS: Record<string, {
  authority:  string;
  trash?:     string;
  recycling?: string;
  bulk?:      string;
  lookup?:    string;
}> = {
  // (intentionally empty — see comment above.)
};

export function resolvePickup(
  county: string | null | undefined,
  city:   string | null | undefined,
): PickupResult {
  const c   = (city   ?? '').trim();
  const cty = (county ?? '').trim();

  const hit = CITY_DEFAULTS[c.toLowerCase()];
  if (hit) {
    return {
      trash_pickup_days:     hit.trash     ?? null,
      recycling_pickup_days: hit.recycling ?? null,
      bulk_pickup_days:      hit.bulk      ?? null,
      trash_authority:       hit.authority,
      pickup_lookup_url:     hit.lookup    ?? SWA_LOOKUP,
      pickup_source:         `city-default:${c.toLowerCase()}`,
    };
  }

  if (cty === 'Palm Beach County' || cty === 'Palm Beach') {
    return {
      trash_pickup_days:     null,
      recycling_pickup_days: null,
      bulk_pickup_days:      null,
      trash_authority:       SWA_AUTHORITY,
      pickup_lookup_url:     SWA_LOOKUP,
      pickup_source:         'swa-directory',
    };
  }

  return {
    trash_pickup_days:     null,
    recycling_pickup_days: null,
    bulk_pickup_days:      null,
    trash_authority:       null,
    pickup_lookup_url:     null,
    pickup_source:         null,
  };
}

// Returns the subset of PickupResult fields that differ from the row's
// current values. Used by both the nightly refresh path and the
// backfill path to emit one change_log row per changed field.
export type PickupCurrent = Partial<PickupResult>;

export function pickupDelta(
  next: PickupResult,
  current: PickupCurrent,
): Partial<PickupResult> {
  const out: Partial<PickupResult> = {};
  const keys: (keyof PickupResult)[] = [
    'trash_pickup_days',
    'recycling_pickup_days',
    'bulk_pickup_days',
    'trash_authority',
    'pickup_lookup_url',
    'pickup_source',
  ];
  for (const k of keys) {
    const nv = next[k]    ?? null;
    const cv = current[k] ?? null;
    if (nv !== cv) out[k] = nv;
  }
  return out;
}
