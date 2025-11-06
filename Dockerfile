# Use the official Node.js 24 LTS image
FROM node:24-slim

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker caching
# This step installs dependencies.
COPY package*.json ./
RUN npm install --omit=dev

# Copy the entire source directory
# The application code (config.js, index.js, logger.js, oci-service.js) 
# is now available in /app/src
COPY src/ ./src/ 

# Set the environment variable for Node.js (good practice)
ENV NODE_ENV=production

# The port Express listens on
EXPOSE 3000

# Run the application
# The start script uses "node src/index.js"
CMD ["npm", "start"]