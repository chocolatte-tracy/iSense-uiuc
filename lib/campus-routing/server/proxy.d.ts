import type { IncomingMessage, ServerResponse } from 'node:http';
export type RouteRequest = IncomingMessage & { body?: unknown };
export type ClientOptions = { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number };
export function sendJson(res: ServerResponse, status: number, body: unknown): void;
export function createRouteHandler(options?: {
  authorize?: (req: RouteRequest) => boolean | Promise<boolean>;
  allowedOrigins?: string[];
  clientOptions?: ClientOptions;
  maxPerMinute?: number; maxTotalRequests?: number; maxConcurrent?: number;
  reserveBudget?: () => Promise<() => Promise<void>>;
}): (req: RouteRequest, res: ServerResponse) => Promise<void>;
