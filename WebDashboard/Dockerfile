FROM node:22-slim AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install build dependencies (to compile better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install

# Copy source code
COPY . .

# Build the Vite frontend
RUN npm run build

# Second stage: production environment
FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies, then remove build tools to keep image small
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && npm install --production \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy the server.js and memory.js proxy
COPY server.js .
COPY memory.js .

VOLUME /app/data

EXPOSE 9000

CMD ["node", "server.js"]
