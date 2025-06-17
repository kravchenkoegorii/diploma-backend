FROM node:22.13.1-slim AS build
WORKDIR /app
COPY package*.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY ./ ./
RUN yarn run build
RUN yarn install --frozen-lockfile --production

FROM node:22.13.1-slim AS run
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/entrypoint.sh ./
COPY --from=build --chown=node:node /app/package.json ./

RUN chmod +x entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]