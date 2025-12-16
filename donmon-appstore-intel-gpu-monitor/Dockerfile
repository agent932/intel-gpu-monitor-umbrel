FROM node:18-slim

# Install Intel GPU Top utility and dependencies
# intel-gpu-tools package contains intel_gpu_top command
RUN apt-get update && apt-get install -y \
    intel-gpu-tools \
    libdrm2 \
    libpciaccess0 \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --omit=dev

# Copy application files
COPY server.js ./

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 8847

# Run the application
CMD ["node", "server.js"]
