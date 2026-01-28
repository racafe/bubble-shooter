# Multi-stage Dockerfile for Bubble Shooter

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production - WebSocket Server
FROM node:20-alpine AS websocket-server

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies (ws is needed for server)
RUN npm ci --omit=dev

# Copy server files (including healthcheck)
COPY server ./server

# Expose WebSocket port
EXPOSE 3000

# Start WebSocket server
CMD ["node", "server/index.js"]

# Stage 3: Production - Web Server
FROM node:20-alpine AS web-server

WORKDIR /app

# Install serve for static file serving
RUN npm install -g serve

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose web server port
EXPOSE 5173

# Start static file server
CMD ["serve", "-s", "dist", "-l", "5173"]
