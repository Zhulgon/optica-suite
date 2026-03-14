FROM node:20-alpine AS builder

RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile --filter web...

COPY apps/web apps/web

ARG VITE_API_URL=http://localhost:3000
ARG VITE_BUSINESS_NAME=Optica-Suite
ARG VITE_BUSINESS_NIT=NIT-900000000-0
ARG VITE_BUSINESS_PHONE=+57-300-000-0000
ARG VITE_BUSINESS_ADDRESS=Direccion-comercial-no-configurada
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_BUSINESS_NAME=${VITE_BUSINESS_NAME}
ENV VITE_BUSINESS_NIT=${VITE_BUSINESS_NIT}
ENV VITE_BUSINESS_PHONE=${VITE_BUSINESS_PHONE}
ENV VITE_BUSINESS_ADDRESS=${VITE_BUSINESS_ADDRESS}

RUN pnpm --filter web build

FROM nginx:1.27-alpine AS runner

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
