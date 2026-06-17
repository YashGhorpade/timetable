#syntax=docker/dockerfile:1

# === Build stage: Compile React application ===
FROM dhi.io/node:20-alpine-dev AS builder

ARG VITE_API_URL=http://localhost:8000
ARG VITE_WS_URL=ws://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

# === Final stage: Create minimal runtime image ===
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
