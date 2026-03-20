FROM node:22-alpine

WORKDIR /app

COPY shared/ ./shared/
COPY zombie-blaster-api/ ./zombie-blaster-api/

WORKDIR /app/zombie-blaster-api

RUN npm install --include=dev && npm run build && npm prune --production

EXPOSE ${PORT:-8080}

CMD ["node", "dist/zombie-blaster-api/src/index.js"]
