export function routesEnabled(): boolean;
export function publicRoutingEnabled(): boolean;
export function serverRoutesKey(): string | undefined;
export function getPublicMapsConfig(): {
  enabled: boolean; routesEnabled: boolean; publicRoutesEnabled: boolean;
  placesEnabled: boolean; integrationVersion: string;
  mapStatus: string; placesStatus: string; routingStatus: string;
  browserKeyPresent: boolean; routingKeyPresent: boolean;
  clientLimitsConfigured: boolean; budgetConfigured: boolean;
  routingMessage: string; message: string; placesMessage: string; browserApiKey?: string;
};
