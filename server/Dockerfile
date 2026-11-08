FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-fund --no-audit
COPY worker ./worker
COPY server/index.mjs ./server/index.mjs
USER node
EXPOSE 8788
CMD ["node", "server/index.mjs"]
