type Coordinate = { lat: number; lng: number };
type WalkingRouteInput = { origin: string | Coordinate; destination: string | Coordinate };

// Intentionally restricted to the same UIUC service area as the existing location picker.
const area = { south: 40.08, north: 40.135, west: -88.255, east: -88.205 };
export function isPublicCampusTrip(input: WalkingRouteInput): boolean {
  const a = input.origin, b = input.destination;
  if (typeof a === "string" || typeof b === "string") return false;
  const inside = (p: Coordinate) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && p.lat >= area.south && p.lat <= area.north && p.lng >= area.west && p.lng <= area.east;
  return inside(a) && inside(b) && !(Math.abs(a.lat - b.lat) < 0.00001 && Math.abs(a.lng - b.lng) < 0.00001);
}

// Use the transport peer, never an untrusted X-Forwarded-For header. Behind an
// unknown proxy topology this conservatively groups visitors, rather than lets
// them evade limits by choosing an IP. Persistent global accounting still applies.
export function createPublicPeerLimiter(now = Date.now, max = 3, maxPeers = 1024) {
  const peers = new Map<string, { start: number; count: number }>();
  return (peer: string): boolean => {
    const time = now();
    for (const [key, value] of peers) if (time - value.start >= 60000) peers.delete(key);
    const value = peers.get(peer);
    if (value) {
      if (value.count >= max) return false;
      value.count++;
      return true;
    }
    if (peers.size >= maxPeers) return false; // Bounded memory, fail closed.
    peers.set(peer, { start: time, count: 1 });
    return true;
  };
}
