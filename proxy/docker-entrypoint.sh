#!/bin/sh
# ==========================================================
# 3Monks Proxy — Entrypoint
# ==========================================================
# Generates self-signed SSL certificates as a fallback when
# Let's Encrypt certificates don't exist yet. This allows
# nginx to start immediately. Certbot will later replace
# these with real certificates.
#
# Also starts a daily reload loop so renewed certificates are
# actually picked up — see the comment above the loop below.
# ==========================================================

set -e

DOMAIN="3monks.co.in"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
CERT_FILE="$CERT_DIR/fullchain.pem"
KEY_FILE="$CERT_DIR/privkey.pem"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "=== SSL certificates not found. Generating self-signed fallback certs ==="
    mkdir -p "$CERT_DIR"
    apk add --no-cache openssl > /dev/null 2>&1 || true
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -subj "/CN=$DOMAIN" \
        > /dev/null 2>&1
    echo "=== Self-signed certificates generated. Replace with Let's Encrypt certs via init-ssl.sh ==="
else
    echo "=== SSL certificates found. Starting nginx ==="
fi

# ==========================================================
# Daily certificate reload
# ==========================================================
# nginx reads ssl_certificate files once at startup and keeps
# them in memory — it never re-reads them. The certbot
# container renews into the shared certbot-conf volume but has
# no way to signal this container, so a renewed certificate
# would sit unused on disk until the proxy happened to restart.
# That is what took the site down: a certificate renewed on
# 23 Jun was never served, and the stale one expired 24 May.
#
# Reloading on a timer needs nothing from certbot and has no
# failure mode of its own. "nginx -s reload" is graceful:
# in-flight requests finish on the old workers. A renewal
# happens 30 days before expiry, so a worst case of one day
# leaves ~29 days of margin.
# ==========================================================
(
    while :; do
        sleep 86400          # 24 hours
        nginx -s reload 2>/dev/null || true
    done
) &

exec "$@"
