import type { Point } from './routing.js';
export function selectWaypoints(chosenPath: Point[], alternativePaths?: Point[][], options?: {
  maxWaypoints?: number; divergenceMeters?: number; spacingMeters?: number; endpointBufferMeters?: number;
}): Point[];
