# Lab Visualizer — Backend (Express + SQLite)
# VERSION kommt aus dem Repo-Root (Build-Arg). Beeinflusst: Image-Tags (Release-Workflow),
# APP_VERSION -> GET /api/health, OCI-Label. docker-compose reicht VERSION durch.
ARG VERSION=0.0.0

FROM node:22-slim

ARG VERSION=0.0.0

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000 \
    APP_VERSION=${VERSION}

LABEL org.opencontainers.image.title="Lab Visualizer Backend" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/leofleischmann/Lab-Visualizer"

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

RUN mkdir -p /data
VOLUME /data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
