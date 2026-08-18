FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

RUN addgroup -S bot && adduser -S bot -G bot \
    && mkdir -p /app/data && chown -R bot:bot /app
USER bot

VOLUME ["/app/data"]

CMD ["node", "src/index.js"]
