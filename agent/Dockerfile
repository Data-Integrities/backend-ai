FROM node:18-alpine

# Install required packages
RUN apk add --no-cache bash curl

# Create app directory
WORKDIR /app

# Copy package files
COPY agent/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built files
COPY agent/dist ./dist
COPY shared /app/shared

# Create startup script
RUN echo '#!/bin/bash\nnode /app/dist/api/index.js' > /app/start.sh && \
    chmod +x /app/start.sh

# Expose port
EXPOSE 3080

CMD ["/app/start.sh"]