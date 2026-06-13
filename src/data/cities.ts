// City presets for the /admin Travel form, so editing the globe never requires
// memorizing latitude/longitude/timezone. The form falls back to a "custom"
// option that reveals the raw fields for anything not on this list.

export type City = {
  key: string;
  label: string;
  lat: number;
  lon: number;
  timezone: string;
};

export const CITIES: City[] = [
  { key: "boston",       label: "Boston",          lat: 42.3601,  lon:  -71.0589, timezone: "America/New_York" },
  { key: "cambridge-ma", label: "Cambridge, MA",   lat: 42.3736,  lon:  -71.1097, timezone: "America/New_York" },
  { key: "new-york",     label: "New York",        lat: 40.7128,  lon:  -74.0060, timezone: "America/New_York" },
  { key: "toronto",      label: "Toronto",         lat: 43.6532,  lon:  -79.3832, timezone: "America/Toronto" },
  { key: "mexico-city",  label: "Mexico City",     lat: 19.4326,  lon:  -99.1332, timezone: "America/Mexico_City" },
  { key: "san-francisco",label: "San Francisco",   lat: 37.7749,  lon: -122.4194, timezone: "America/Los_Angeles" },
  { key: "los-angeles",  label: "Los Angeles",     lat: 34.0522,  lon: -118.2437, timezone: "America/Los_Angeles" },
  { key: "london",       label: "London",          lat: 51.5074,  lon:   -0.1278, timezone: "Europe/London" },
  { key: "paris",        label: "Paris",           lat: 48.8566,  lon:    2.3522, timezone: "Europe/Paris" },
  { key: "berlin",       label: "Berlin",          lat: 52.5200,  lon:   13.4050, timezone: "Europe/Berlin" },
  { key: "dubai",        label: "Dubai",           lat: 25.2048,  lon:   55.2708, timezone: "Asia/Dubai" },
  { key: "mumbai",       label: "Mumbai",          lat: 19.0760,  lon:   72.8777, timezone: "Asia/Kolkata" },
  { key: "bangalore",    label: "Bangalore",       lat: 12.9716,  lon:   77.5946, timezone: "Asia/Kolkata" },
  { key: "singapore",    label: "Singapore",       lat:  1.3521,  lon:  103.8198, timezone: "Asia/Singapore" },
  { key: "hangzhou",     label: "Hangzhou, China", lat: 30.2741,  lon:  120.1551, timezone: "Asia/Shanghai" },
  { key: "shanghai",     label: "Shanghai",        lat: 31.2304,  lon:  121.4737, timezone: "Asia/Shanghai" },
  { key: "beijing",      label: "Beijing",         lat: 39.9042,  lon:  116.4074, timezone: "Asia/Shanghai" },
  { key: "seoul",        label: "Seoul",           lat: 37.5665,  lon:  126.9780, timezone: "Asia/Seoul" },
  { key: "tokyo",        label: "Tokyo",           lat: 35.6762,  lon:  139.6503, timezone: "Asia/Tokyo" },
  { key: "sydney",       label: "Sydney",          lat: -33.8688, lon:  151.2093, timezone: "Australia/Sydney" },
];

const COORD_EPSILON = 0.01; // ~1km — tight enough not to misidentify neighbors

/** Best-effort match: given lat/lon, return a preset key, or "custom" if none fits. */
export function matchCity(lat: number, lon: number): string {
  for (const c of CITIES) {
    if (Math.abs(c.lat - lat) < COORD_EPSILON && Math.abs(c.lon - lon) < COORD_EPSILON) {
      return c.key;
    }
  }
  return "custom";
}
