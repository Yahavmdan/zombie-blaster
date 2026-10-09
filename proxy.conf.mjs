// Dev server proxy. In development the frontend opens its WebSocket on its own origin (`/ws`) and
// `ng serve` forwards it to the API, so each worktree slot pairs its own frontend with its own API:
// API_PORT picks the API (default 3001, the API's own default PORT).
const apiPort = process.env['API_PORT'] ?? '3001';

export default {
  '/ws': {
    target: `http://localhost:${apiPort}`,
    ws: true,
  },
};
