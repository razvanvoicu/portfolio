FROM nginx:1.31.5-alpine3.24

RUN rm -rf /etc/nginx

COPY nginx/ /etc/nginx/
COPY tmp/www/ /srv/www/

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
