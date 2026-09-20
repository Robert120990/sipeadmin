FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

RUN pnpm install

COPY . .

# Build frontend
RUN pnpm --filter frontend run build

EXPOSE 5001
ENV NODE_ENV=production
ENV PORT=5001

CMD ["node", "backend/server.js"]
