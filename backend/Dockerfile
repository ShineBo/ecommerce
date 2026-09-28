FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p /app/storage/slips && chown -R node:node /app/storage
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
