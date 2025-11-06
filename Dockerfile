# Start from the official Node.js 24 LTS image
FROM node:24-alpine

# Install bun
RUN npm install -g bun

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and the bun lockfile
COPY package.json bun.lock ./

# Install *only* production dependencies using bun
RUN bun install --production

# Copy the application source code
COPY src/ ./src/

# Expose the port the app runs on
EXPOSE 3000

# The command to run the application using node
CMD [ "node", "src/index.js" ]