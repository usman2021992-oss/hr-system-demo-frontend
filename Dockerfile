# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Pass backend URL at build time for docker-compose local testing
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ── Production stage (nginx serves the SPA) ───────────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config: SPA routing + bot proxy + no-cache on index.html
RUN printf 'map $http_user_agent $is_bot {\n\
  default 0;\n\
  "~*Indeedbot" 1;\n\
  "~*Googlebot" 1;\n\
  "~*Bingbot" 1;\n\
  "~*facebookexternalhit" 1;\n\
  "~*Twitterbot" 1;\n\
}\n\
server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  # Proxy /uploads/ to the backend container so avatar images load in Docker\n\
  location /uploads/ {\n\
    proxy_pass http://backend:3001/uploads/;\n\
    proxy_http_version 1.1;\n\
    proxy_set_header Host $host;\n\
  }\n\
  # Proxy /api/ to the backend container\n\
  location /api/ {\n\
    proxy_pass http://backend:3001/api/;\n\
    proxy_http_version 1.1;\n\
    proxy_set_header Host $host;\n\
    proxy_set_header X-Real-IP $remote_addr;\n\
  }\n\
  # Proxy /sitemap.xml to the backend container\n\
  location = /sitemap.xml {\n\
    proxy_pass http://backend:3001/sitemap.xml;\n\
    proxy_http_version 1.1;\n\
    proxy_set_header Host $host;\n\
    proxy_set_header X-Real-IP $remote_addr;\n\
  }\n\
  # Hashed assets and static files: serve directly\n\
  location ~* \\.(?:js|css|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf)$ {\n\
    try_files $uri =404;\n\
    expires 1y;\n\
    add_header Cache-Control "public, max-age=31536000, immutable" always;\n\
  }\n\
  # index.html: never cache so new deploys take effect immediately\n\
  location = /index.html {\n\
    try_files /index.html =404;\n\
    expires -1;\n\
    add_header Cache-Control "no-store, no-cache, must-revalidate" always;\n\
  }\n\
  location / {\n\
    if ($is_bot) {\n\
      proxy_pass http://backend:3001;\n\
      break;\n\
    }\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
