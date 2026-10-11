export type Point = { lat: number; lng: number };
export type Endpoint = string | Point;
export type WalkingRoute = {
  id: string; distanceMeters: number; durationSeconds: number; durationMinutes: number;
  encodedPolyline: string; path: Point[]; labels: string[];
};
export const UIUC_EXAMPLE: Readonly<{ origin: string; destination: string }>;
export const WALKING_WARNING: string;
export const HANDOFF_WARNING: string;
export class RoutingError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status?: number);
}
export function validatePoint(point: unknown): Point;
export function normalizeEndpoint(value: unknown): Endpoint;
export function decodePolyline(encoded: string): Point[];
export function parseRoutesResponse(data: unknown): { routes: WalkingRoute[]; alternativesReturned: boolean; routeCount: number };
export function buildGoogleMapsUrl(input: { origin: Endpoint; destination: Endpoint; waypoints?: Point[] }): string;
