# --- Stage 1: Build Stage ---
# Use a lean base image
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# --- Stage 2: Final Stage ---
# Start from the same lean base
FROM node:22-alpine

WORKDIR /app

# Copy dependencies from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy your application code
COPY ./src ./src

# Expose the port your server runs on
EXPOSE 3000

# The command to run your app
CMD ["node", "src/index.js"]