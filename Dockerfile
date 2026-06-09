FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose dashboard (8090) and API gateway proxy (8095)
EXPOSE 8090
EXPOSE 8095

# Start the application
CMD ["node", "server.js"]
