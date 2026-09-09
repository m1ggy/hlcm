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
