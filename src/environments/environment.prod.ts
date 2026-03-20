export interface Environment {
  production: boolean;
  wsUrl: string;
}

export const environment: Environment = {
  production: true,
  wsUrl: 'wss://zombie-blaster-production.up.railway.app',
};
