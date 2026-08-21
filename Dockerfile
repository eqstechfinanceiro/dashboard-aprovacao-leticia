FROM node:18-alpine AS builder

ARG CACHE_BUST=1
WORKDIR /app

# Install build dependencies for native modules (canvas needs python3 + cairo/pango dev headers)
RUN apk add --no-cache python3 make g++ pkgconf cairo-dev pango-dev jpeg-dev giflib-dev pixman-dev

COPY vexpenses-dashboard/package*.json ./vexpenses-dashboard/
RUN cd vexpenses-dashboard && npm ci

COPY vexpenses-dashboard ./vexpenses-dashboard
RUN cd vexpenses-dashboard && npm run build

FROM node:18-alpine AS runner

WORKDIR /app

# Install runtime libraries for canvas (cairo, pango, jpeg, giflib)
RUN apk add --no-cache cairo pango jpeg giflib pixman

ENV NODE_ENV=production

COPY --from=builder /app/vexpenses-dashboard/package*.json ./vexpenses-dashboard/
COPY --from=builder /app/vexpenses-dashboard/node_modules ./vexpenses-dashboard/node_modules
RUN cd vexpenses-dashboard && npm prune --production

COPY --from=builder /app/vexpenses-dashboard/.next ./vexpenses-dashboard/.next

WORKDIR /app/vexpenses-dashboard

EXPOSE 3000

CMD ["npm", "run", "start"]
