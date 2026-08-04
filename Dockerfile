FROM node:24.15.0-bookworm-slim

ENV CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false \
    KIRJOLAB_BROWSER_SHELL_MODE=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    WRANGLER_SEND_METRICS=false

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm cache clean --force

COPY --chown=node:node . .
RUN mkdir -p /app/.wrangler /app/node_modules/.mf /data && chown node:node /app /app/.wrangler /app/node_modules/.mf /data

USER node
RUN npm run build

EXPOSE 8787

CMD ["./node_modules/.bin/wrangler", "dev", "--config", "wrangler.self-host.jsonc", "--local", "--ip", "0.0.0.0", "--port", "8787", "--persist-to", "/data", "--inspector-ip", "127.0.0.1", "--log-level", "info", "--show-interactive-dev-session=false"]
