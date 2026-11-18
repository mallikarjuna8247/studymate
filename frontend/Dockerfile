# Stage 1: Build React application
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy frontend source
COPY . .

# API requests will go through Nginx
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

# Generate production build
RUN npm run build


# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy production frontend files
COPY --from=build /app/dist /usr/share/nginx/html

# Configure reverse proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
