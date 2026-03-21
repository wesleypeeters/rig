ARG CADDY_VERSION="2"
ARG CLOUDFLARE_DNS_REF=1bc23c92a08e0c38937c6cc28b461722471e78b9
FROM caddy:${CADDY_VERSION}-builder-alpine AS builder
ARG CLOUDFLARE_DNS_REF
RUN xcaddy build \
	--with github.com/caddy-dns/cloudflare=github.com/ogerman/cloudflare@${CLOUDFLARE_DNS_REF} \
	--with github.com/WeidiDeng/caddy-cloudflare-ip
FROM caddy:${CADDY_VERSION}-alpine
RUN apk add --no-cache curl
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
