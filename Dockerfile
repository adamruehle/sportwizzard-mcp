# sportwizzard-mcp — hosted remote MCP server (Streamable HTTP) at mcp.sportwizzard.com.
# Multi-stage: build with devDependencies (tsc), ship a slim runtime image with
# only production dependencies. This is the SAME codebase as the stdio server
# (dist/index.js) — the container just runs the HTTP entry point instead.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the "prepare" script (npm run build) can't run yet — src/
# isn't copied in until after this cached layer. We build explicitly below.
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist

EXPOSE 8091
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MCP_HTTP_PORT||8091)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/httpServer.js"]
