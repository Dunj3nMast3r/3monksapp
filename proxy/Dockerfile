FROM nginx:alpine
ARG NGINX_CONF=nginx.conf
RUN apk add --no-cache openssl
RUN rm /etc/nginx/conf.d/default.conf
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80 443
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
