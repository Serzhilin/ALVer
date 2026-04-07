# ═══════════════════════════════════════════════════════════════════════════════
# ALVer — single-container production build
#
# Directory layout inside the image:
#   /app/
#     dist/       compiled API (TypeScript → JS)
#     client/     built React app — served as static files by Express
#     node_modules/
#     package.json
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /build/app

COPY app/package*.json ./
RUN npm ci

COPY app/ ./

# VITE_FACILITATOR_ENAME is baked into the bundle at build time.
# Pass it as a Docker build arg:
#   docker build --build-arg VITE_FACILITATOR_ENAME=@your-ename .
ARG VITE_FACILITATOR_ENAME
ENV VITE_FACILITATOR_ENAME=$VITE_FACILITATOR_ENAME

RUN npm run build

# ── Stage 2: Build API ────────────────────────────────────────────────────────
FROM node:20-alpine AS api-build
WORKDIR /build/api

COPY api/package*.json ./
COPY api/vendor/ ./vendor/
RUN npm ci

COPY api/tsconfig.json ./
COPY api/src/ ./src/
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# API runtime files
COPY --from=api-build /build/api/package*.json ./
COPY --from=api-build /build/api/node_modules  ./node_modules
COPY --from=api-build /build/api/vendor        ./vendor
COPY --from=api-build /build/api/dist          ./dist
COPY api/mappings/                             ./mappings

# Built React app — Express serves this as static files in production
COPY --from=frontend-build /build/app/dist ./client

ENV NODE_ENV=production
ENV PORT=3001
ENV ALVER_MAPPING_DB_PATH=/app/data/mapping.db

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "dist/index.js"]
