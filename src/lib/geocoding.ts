// Server-only — the API key must never reach a client bundle, so this is
// imported only from "use server" action files (src/lib/actions/
// care-recipients.ts), never from a component.
//
// Best-effort by design, matching every other external-API integration in
// this app (see sendEmail): never throws, just returns null and logs a
// warning. A CareRecipient's address always saves whether or not this
// succeeds — geocoding only feeds the optional "near/far" distance check
// on clock-in, it's never a requirement for the record itself.

export type Coordinates = { latitude: number; longitude: number };

export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[geocoding] GOOGLE_MAPS_API_KEY not set — skipping, address saved without coordinates");
    return null;
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", trimmed);
    url.searchParams.set("key", apiKey);

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[geocoding] request failed (${res.status}) for "${trimmed}"`);
      return null;
    }

    const body = (await res.json()) as {
      status: string;
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };

    if (body.status !== "OK" || !body.results?.length) {
      console.warn(`[geocoding] no result for "${trimmed}" (status: ${body.status})`);
      return null;
    }

    const location = body.results[0].geometry?.location;
    if (!location) return null;

    return { latitude: location.lat, longitude: location.lng };
  } catch (error) {
    console.warn(`[geocoding] failed for "${trimmed}":`, error);
    return null;
  }
}
