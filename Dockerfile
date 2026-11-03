FROM node:22-alpine AS backend-build

WORKDIR /backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/src/ ./src/


FROM nginx:1.31.5-alpine3.24 AS runtime

RUN apk add --no-cache nodejs

RUN rm -rf /etc/nginx

COPY nginx/ /etc/nginx/
COPY tmp/www/ /srv/www/
COPY --from=backend-build /backend /backend
RUN --mount=type=secret,id=speedlimit_password,required=true \
    mkdir -p /backend/secrets && \
    cp /run/secrets/speedlimit_password /backend/secrets/speedlimitpassword.txt
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8080

CMD ["/docker-entrypoint.sh"]
