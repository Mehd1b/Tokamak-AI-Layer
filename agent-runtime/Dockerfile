FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (Railway sets PORT env var)
EXPOSE 3001

# Start the server
CMD ["node", "dist/server.js"]
