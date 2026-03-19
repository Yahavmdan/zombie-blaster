export interface Environment {
  production: boolean;
  wsUrl: string;
}

export const environment: Environment = {
  production: false,
  wsUrl: 'ws://localhost:3001',
};
