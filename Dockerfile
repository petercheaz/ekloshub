# Production image: API + built client (single origin on PORT, default 3000).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY client ./client
RUN npx tsc && npx vite build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/*.json ./dist/db/
COPY --from=build /app/src/db/seed-photos ./dist/db/seed-photos
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/me').then(r=>process.exit(r.status===200||r.status===401?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/server.js"]
