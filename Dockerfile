FROM node:18-alpine AS builder

WORKDIR /app

COPY vexpenses-dashboard/package*.json ./vexpenses-dashboard/
RUN cd vexpenses-dashboard && npm ci --only=production=false

COPY vexpenses-dashboard ./vexpenses-dashboard
RUN cd vexpenses-dashboard && npm run build

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV production

COPY --from=builder /app/vexpenses-dashboard/package*.json ./vexpenses-dashboard/
RUN cd vexpenses-dashboard && npm ci --only=production

COPY --from=builder /app/vexpenses-dashboard/.next ./vexpenses-dashboard/.next
COPY --from=builder /app/vexpenses-dashboard/public ./vexpenses-dashboard/public
COPY --from=builder /app/vexpenses-dashboard/node_modules/.prisma ./vexpenses-dashboard/node_modules/.prisma

EXPOSE 3000

CMD ["npm", "run", "start"]
