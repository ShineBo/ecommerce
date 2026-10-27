# Build from the project root so both services package the same .proto contract.
FROM node:24-bookworm-slim AS dependencies
WORKDIR /plugin
COPY plugins/study-kit/package*.json ./
RUN npm ci && npm cache clean --force

FROM dependencies AS development
COPY --chown=node:node plugins/study-kit/src ./src
COPY --chown=node:node plugins/study-kit/tests ./tests
COPY --chown=node:node plugins/study-kit/eslint.config.js ./
COPY --chown=node:node backend/src/plugins/studyKit.proto ./contracts/studyKit.proto
ENV STUDY_KIT_PROTO_PATH=/plugin/contracts/studyKit.proto
ARG STUDY_KIT_ALGORITHM=P1
ENV STUDY_KIT_ALGORITHM=${STUDY_KIT_ALGORITHM}
RUN node -e "import('./src/rules.js')"
USER node
EXPOSE 50001
CMD ["node", "src/server.js"]

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev && npm cache clean --force

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /plugin
COPY plugins/study-kit/package*.json ./
COPY --from=production-dependencies /plugin/node_modules ./node_modules
COPY --chown=node:node plugins/study-kit/src ./src
COPY --chown=node:node backend/src/plugins/studyKit.proto ./contracts/studyKit.proto
ENV STUDY_KIT_PROTO_PATH=/plugin/contracts/studyKit.proto
ARG STUDY_KIT_ALGORITHM=P1
ENV STUDY_KIT_ALGORITHM=${STUDY_KIT_ALGORITHM}
RUN node -e "import('./src/rules.js')"
LABEL org.opencontainers.image.title="Study Kit Checker" \
      org.opencontainers.image.version="1.1.0-${STUDY_KIT_ALGORITHM}"
USER node
EXPOSE 50001
CMD ["node", "src/server.js"]
