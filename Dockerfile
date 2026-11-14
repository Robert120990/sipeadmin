FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@12

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile

COPY . .

# Build frontend
RUN pnpm --filter frontend run build && chown -R node:node /app

EXPOSE 5001
ENV NODE_ENV=production
ENV PORT=5001

USER node
CMD ["node", "backend/server.js"]
