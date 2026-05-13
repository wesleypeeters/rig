ARG CADDY_VERSION="2"
ARG CLOUDFLARE_DNS_REF=1bc23c92a08e0c38937c6cc28b461722471e78b9
ARG SOUIN_REF=v1.7.5
ARG OTTER_REF=v0.0.7
FROM caddy:${CADDY_VERSION}-builder-alpine AS builder
ARG CLOUDFLARE_DNS_REF
ARG SOUIN_REF
ARG OTTER_REF
RUN xcaddy build \
	--with github.com/caddy-dns/cloudflare=github.com/ogerman/cloudflare@${CLOUDFLARE_DNS_REF} \
	--with github.com/WeidiDeng/caddy-cloudflare-ip \
	--with github.com/darkweak/souin/plugins/caddy@${SOUIN_REF} \
	--with github.com/darkweak/storages/otter/caddy@${OTTER_REF}
FROM caddy:${CADDY_VERSION}-alpine
RUN apk add --no-cache curl
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
