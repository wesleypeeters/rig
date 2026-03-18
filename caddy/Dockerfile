# Custom Caddy build with:
# - Cloudflare DNS plugin for DNS-01 challenges
# - Cloudflare IP module for trusted proxy headers
ARG CADDY_VERSION="2"
FROM caddy:${CADDY_VERSION}-builder-alpine AS builder
RUN xcaddy build \
	--with github.com/caddy-dns/cloudflare \
	--with github.com/WeidiDeng/caddy-cloudflare-ip
FROM caddy:${CADDY_VERSION}-alpine
RUN apk add --no-cache curl
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
