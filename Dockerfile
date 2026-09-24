FROM node:22-alpine AS backend-build

WORKDIR /backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/src/ ./src/


FROM nginx:1.31.5-alpine3.24

RUN apk add --no-cache nodejs

RUN rm -rf /etc/nginx

COPY nginx/ /etc/nginx/
COPY tmp/www/ /srv/www/
COPY --from=backend-build /backend /backend
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8080

CMD ["/docker-entrypoint.sh"]
