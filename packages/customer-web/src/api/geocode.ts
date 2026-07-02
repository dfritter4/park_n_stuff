export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Resolves a free-text search query to a coordinate via the public Nominatim
 * (OpenStreetMap) geocoder. Callers are responsible for not invoking this on
 * every keystroke — Nominatim's usage policy rate-limits by client, so this
 * should only run on explicit submit (Enter / search button).
 */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (trimmed === '') {
    return null;
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  const results = (await response.json()) as NominatimResult[];
  const first = results[0];
  if (!first) {
    return null;
  }

  return {
    lat: parseFloat(first.lat),
    lng: parseFloat(first.lon),
    label: first.display_name,
  };
}
