FROM nginx:alpine
ARG NGINX_CONF=nginx.conf
RUN rm /etc/nginx/conf.d/default.conf
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
