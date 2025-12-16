FROM node:18-alpine

# Install Intel GPU Top utility and dependencies
RUN apk add --no-cache \
    intel-gpu-tools \
    libdrm \
    libpciaccess

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application files
COPY server.js ./

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 8847

# Run the application
CMD ["node", "server.js"]
