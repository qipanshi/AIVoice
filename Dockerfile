FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=18620 AIVOICE_DATABASE=/app/data/aivoice.sqlite
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-fund && mkdir /app/data && chown node:node /app/data && chmod 700 /app/data
COPY --from=build /app/dist ./dist
COPY assets ./assets
COPY public ./public
COPY downloads ./downloads
COPY installers ./installers
USER node
EXPOSE 18620
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:18620/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/main.js"]
