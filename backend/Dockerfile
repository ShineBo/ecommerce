FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm cache clean --force

FROM dependencies AS development
COPY --chown=node:node . .
RUN mkdir -p /app/storage/slips && chown -R node:node /app/storage
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev && npm cache clean --force

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/storage/slips && chown -R node:node /app/storage
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
