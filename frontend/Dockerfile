FROM node:18-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
# Empty REACT_APP_API_URL → uses current origin, proxy routes /api/ to backend
ENV REACT_APP_API_URL=
# No source maps (the most memory-hungry part of the build, and they expose the source)
# and a bounded Node heap, so the build fits on a small server
ENV GENERATE_SOURCEMAP=false
ENV NODE_OPTIONS=--max-old-space-size=1024
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
