FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /work
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml /work/
COPY sdk/ /work/sdk/
COPY agent/ /work/agent/
COPY compose-init/wait-for-deploy.sh /usr/local/bin/wait-for-deploy
RUN chmod +x /usr/local/bin/wait-for-deploy && pnpm install --frozen-lockfile
RUN pnpm --filter @arc-pick/sdk build && pnpm --filter @arc-pick/agent build
ENTRYPOINT ["sh", "-c", "wait-for-deploy && node /work/agent/dist/index.js"]
