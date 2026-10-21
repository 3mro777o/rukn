FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY package.json ./
COPY server server
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
