# Lightweight Node.js image (Logic only, no Chrome)
FROM node:18-alpine

# Work directory
WORKDIR /usr/src/app

# Install dependencies first (caching)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (railway/render dynamic port env)
EXPOSE 3001

# Start command
CMD ["node", "dist/server.js"]
