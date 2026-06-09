FROM node:20-alpine

# Set directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose SRE dashboard (8060) and UDP DNS Server (8053)
EXPOSE 8060
EXPOSE 8053/udp

# Command to run
CMD ["node", "server.js"]
