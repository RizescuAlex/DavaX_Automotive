FROM node:22.14.0-alpine3.21

WORKDIR /app

# Copy dependency files first so Docker can reuse this layer when source files change.
COPY package.json package-lock.json ./

# npm ci installs exactly the versions recorded in package-lock.json.
RUN npm ci

COPY . .

EXPOSE 5173

# --host exposes Vite outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
