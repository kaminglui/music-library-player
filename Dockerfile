FROM node:20-alpine AS build-client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine AS build-server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=build-server /app/server/dist ./dist
COPY --from=build-server /app/server/node_modules ./node_modules
COPY --from=build-server /app/server/package.json ./package.json
COPY --from=build-client /app/client/dist /app/client/dist
EXPOSE 3000
CMD ["node", "dist/index.js"]