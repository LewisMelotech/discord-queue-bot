FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache su-exec

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

RUN addgroup -S bot && adduser -S bot -G bot \
    && mkdir -p /app/data && chown -R bot:bot /app

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

VOLUME ["/app/data"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
