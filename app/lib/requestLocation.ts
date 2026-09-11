export type RequestLocationAuthority = 'gps' | 'manual' | 'manual_geocoded' | 'saved';

export type RequestCoordinates = {
  lat: number;
  lng: number;
};

export function authoritativeRequestCoordinates(
  authority: RequestLocationAuthority | null,
  coordinates: RequestCoordinates | null,
) {
  if (!coordinates) return null;
  return authority === 'gps' || authority === 'manual_geocoded' || authority === 'saved'
    ? coordinates
    : null;
}
