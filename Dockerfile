# syntax=docker/dockerfile:1.7
#
# TasteGate AI: provider-neutral, multi-stage image of the standalone production server.
# Prepared, NOT deployed: nothing here pushes an image, contacts a registry other than the base-image pull, or provisions anything.
#
#   docker build -t tastegate-ai:local .
#   docker run --rm -p 127.0.0.1:3000:3000 --read-only --tmpfs /tmp --tmpfs /app/.next/cache tastegate-ai:local
#
# The image runs the PRODUCTION-SAFE profile: synthetic and custom plans only. Private recordings, a live grant and every credential
# are absent from the build context (see .dockerignore) and refused at start-up if present in the environment. To change the base image,
# pin it by digest at release time: a tag can move, a digest cannot.
ARG NODE_VERSION=24
ARG NODE_IMAGE_DIGEST=sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53

FROM node:${NODE_VERSION}-alpine@${NODE_IMAGE_DIGEST} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM node:${NODE_VERSION}-alpine@${NODE_IMAGE_DIGEST} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 TASTEGATE_STANDALONE=1 NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && npm run build

FROM node:${NODE_VERSION}-alpine@${NODE_IMAGE_DIGEST} AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    TASTEGATE_PROFILE=production-safe TASTEGATE_DISABLE_LIVE=1
WORKDIR /app
# An unprivileged user with no shell login; the root filesystem can be mounted read-only (Next writes only under .next/cache).
RUN addgroup -S -g 10001 tastegate && adduser -S -u 10001 -G tastegate -H -s /sbin/nologin tastegate && mkdir -p .next/cache && chown -R tastegate:tastegate /app
COPY --from=build --chown=tastegate:tastegate /app/.next/standalone ./
COPY --from=build --chown=tastegate:tastegate /app/.next/static ./.next/static
COPY --from=build --chown=tastegate:tastegate /app/public ./public
COPY --chown=tastegate:tastegate scripts/start-production.mjs ./scripts/start-production.mjs
USER tastegate
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(function(r){process.exit(r.ok?0:1)}).catch(function(){process.exit(1)})"
# Validates the environment first and refuses to start on an invalid configuration (exit 78).
CMD ["node", "scripts/start-production.mjs"]
