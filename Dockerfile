FROM node:18-alpine AS builder

ARG CACHE_BUST=1
WORKDIR /app

# Install build dependencies for native modules (canvas needs python3 + cairo/pango dev headers)
RUN apk add --no-cache python3 make g++ pkgconfig cairo-dev pango-dev jpeg-dev giflib-dev pixman-dev

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /app

# Install runtime libraries for canvas (cairo, pango, jpeg, giflib)
RUN apk add --no-cache cairo pango jpeg giflib pixman

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --production

COPY --from=builder /app/.next ./.next

WORKDIR /app

EXPOSE 3000

CMD ["npm", "run", "start"]
