# Pinned: rebuilding Caddy (rig update) must not change the version under a
# running cluster, whose autosaved config has to load on the new binary.
ARG CADDY_VERSION=2.11.4
# Fork of caddy-dns/cloudflare that accepts Cloudflare's newer API token format.
ARG CLOUDFLARE_DNS_REF=1bc23c92a08e0c38937c6cc28b461722471e78b9
ARG CLOUDFLARE_IP_REF=f53b62aa13cb
# Souin is built in so a config that references its cache handler still loads;
# `rig caddy init` does not configure one.
ARG SOUIN_REF=v1.7.5
ARG OTTER_REF=v0.0.7
FROM caddy:${CADDY_VERSION}-builder-alpine AS builder
ARG CLOUDFLARE_DNS_REF
ARG CLOUDFLARE_IP_REF
ARG SOUIN_REF
ARG OTTER_REF
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare=github.com/ogerman/cloudflare@${CLOUDFLARE_DNS_REF} \
    --with github.com/WeidiDeng/caddy-cloudflare-ip@${CLOUDFLARE_IP_REF} \
    --with github.com/darkweak/souin/plugins/caddy@${SOUIN_REF} \
    --with github.com/darkweak/storages/otter/caddy@${OTTER_REF}
FROM caddy:${CADDY_VERSION}-alpine
RUN apk add --no-cache curl
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
