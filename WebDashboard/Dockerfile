FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the Vite frontend
RUN npm run build

# Second stage: production environment
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy the server.js proxy
COPY server.js .

EXPOSE 9000

CMD ["node", "server.js"]
