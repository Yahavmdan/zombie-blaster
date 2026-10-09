export interface Environment {
  production: boolean;
  wsUrl: string;
}

export const environment: Environment = {
  production: false,
  // Same origin as the page: `ng serve` proxies /ws to the API on API_PORT (proxy.conf.mjs).
  wsUrl: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
};
