# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

# Remove npm, yarn, corepack - not needed at runtime
RUN rm -rf /usr/local/lib/node_modules /opt/yarn* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn \
    /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mockjira -u 1001 -G nodejs

# Create data directory for persistence with correct permissions
RUN mkdir -p /data && chown mockjira:nodejs /data

# Set environment
ENV NODE_ENV=production
ENV PORT=8443
ENV MOCK_DATA_DIR=/data

# Copy production files from builder
COPY --from=builder --chown=mockjira:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=mockjira:nodejs /app/dist ./dist

# Switch to non-root user
USER mockjira

# Declare volume for persistence
VOLUME ["/data"]

EXPOSE 8443

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8443/health || exit 1

CMD ["node", "dist/index.js"]
