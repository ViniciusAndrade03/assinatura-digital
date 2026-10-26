# 1) Build do Next.js (export estático)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# No Docker a API é acessada pelo mesmo domínio (proxy reverso do NGINX em /api)
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 2) Certificado TLS autoassinado para HTTPS local (em produção o GitHub Pages fornece o certificado)
FROM alpine:3.20 AS cert
RUN apk add --no-cache openssl && \
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
      -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
      -keyout /tls.key -out /tls.crt && chmod 444 /tls.key /tls.crt

# 3) NGINX sem privilégios de root servindo os arquivos estáticos
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=cert /tls.crt /tls.key /etc/nginx/tls/
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 8080 8443
