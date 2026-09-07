# Lab Visualizer — Frontend (React + Vite, ausgeliefert über nginx)
# VERSION aus Repo-Root (Build-Arg). Beeinflusst: Image-Tags (Release-Workflow), OCI-Label.
# docker-compose reicht VERSION durch.
ARG VERSION=0.0.0

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

ARG VERSION=0.0.0

LABEL org.opencontainers.image.title="Lab Visualizer Frontend" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/leofleischmann/Lab-Visualizer"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
