# VeeJay Wizard behind a secret sub-path, HTTPS only (deploy/README.md). Build from the repo root:
#   docker build -f deploy/Dockerfile --build-arg SLUG=<secret> -t vjw .
FROM node:20-slim AS build
ARG SLUG
# The slug is the only lock (no login).
RUN echo "$SLUG" | grep -Eq '^[A-Za-z0-9_-]{16,}$' || { echo 'set --build-arg SLUG to 16+ of [A-Za-z0-9_-]' >&2; exit 1; }
WORKDIR /web
COPY web/package.json web/package-lock.json ./
COPY web/scripts ./scripts
RUN npm ci
# web/ brings web/scene-marks.json (git-ignored) when it exists: the build bakes it in as the default marks and stars
COPY web/ ./
RUN VJW_BASE=/$SLUG/ npm run build

FROM nginx:1.30-alpine
ARG SLUG
RUN apk add --no-cache openssl && rm -rf /usr/share/nginx/html/*
COPY --chmod=755 deploy/selfsigned.sh /docker-entrypoint.d/40-selfsigned.sh
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
RUN sed -i "s|__SLUG__|$SLUG|g" /etc/nginx/conf.d/default.conf
COPY --from=build /web/dist /usr/share/nginx/html/$SLUG
EXPOSE 80 443
