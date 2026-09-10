// Browser-only capture, used solely by TimeClockWidget for a Caregiver's
// clock-in/out — see src/lib/actions/time-entries.ts for how the result
// lands on TimeEntry. Deliberately never rejects: a denied permission,
// missing API, or a slow GPS fix all resolve to a `locationError` instead
// of throwing, because the actual clock-in/out call must never be blocked
// on this (record-only, per the geo-location-login plan).
export type CapturedLocation = {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  locationError?: string;
};

const GEO_TIMEOUT_MS = 8000;

export function captureLocation(): Promise<CapturedLocation> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ locationError: "unavailable" });
      return;
    }

    let settled = false;
    const settle = (result: CapturedLocation) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timeoutId = setTimeout(() => settle({ locationError: "timeout" }), GEO_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        settle({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        clearTimeout(timeoutId);
        settle({ locationError: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable" });
      },
      { timeout: GEO_TIMEOUT_MS, maximumAge: 0 }
    );
  });
}

// A plain deep link, not the Maps JavaScript/Geocoding API — no key, no new
// dependency. Good enough for a manager to eyeball "was this near the
// recipient's address" without building any distance math.
export function mapsLinkForCoordinates(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export function mapsLinkForAddress(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// Straight-line ("as the crow flies") distance — no routing/driving-distance
// API involved, just spherical geometry. Good enough for "is this caregiver
// roughly at the house" without another paid dependency.
const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Within this, a caregiver reads as "at the house" — loose enough to cover
// normal GPS drift and standing anywhere on the property, tight enough that
// "across the street" still flags as far. Never used to block anything
// (see TimeClockWidget) — purely what turns a raw distance into "near"/"far".
export const NEAR_THRESHOLD_METERS = 300;

// US-audience formatting (miles), matching the rest of this app's locale
// conventions (currency, dates). Meters shown directly under ~300m since
// "0.2 mi" reads worse than "180 m" at that scale.
export function formatDistance(meters: number): string {
  if (meters < 300) return `${Math.round(meters)} m`;
  const miles = meters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}
