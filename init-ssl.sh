#!/usr/bin/env bash
# ==========================================================
# 3Monks — SSL Certificate Setup (Let's Encrypt)
# ==========================================================
# Run this ONCE on the server before the first production
# deployment to obtain SSL certificates from Let's Encrypt.
#
# Prerequisites:
#   - DNS for 3monks.co.in and www.3monks.co.in must point
#     to this server's IP address
#   - Ports 80 and 443 must be open in firewall
#
# Usage:
#   chmod +x init-ssl.sh && sudo ./init-ssl.sh
# ==========================================================

set -euo pipefail

DOMAIN="3monks.co.in"
EMAIL="${SSL_EMAIL:-admin@3monks.co.in}"
COMPOSE_FILE="docker-compose.prod.yml"

echo "========================================="
echo " 3Monks — SSL Certificate Setup"
echo "========================================="
echo " Domain:  $DOMAIN"
echo " Email:   $EMAIL"
echo "========================================="
echo ""

# ---- Step 1: Create a temporary nginx config for ACME challenge ----
echo "[1/4] Creating temporary proxy config for certificate issuance..."

# Back up the real proxy prod config
cp proxy/nginx.prod.conf proxy/nginx.prod.conf.bak

# Write a minimal HTTP-only config as the prod config for the ACME challenge
cat > proxy/nginx.prod.conf <<'TMPCONF'
server {
    listen 80;
    server_name 3monks.co.in www.3monks.co.in;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'SSL setup in progress...';
        add_header Content-Type text/plain;
    }
}
TMPCONF

# ---- Step 2: Start proxy with temporary config ----
echo "[2/4] Starting proxy container with temporary HTTP config..."
docker compose -f "$COMPOSE_FILE" up -d --build proxy
echo "  Waiting for proxy to start..."
sleep 5

# ---- Step 3: Request certificates from Let's Encrypt ----
echo "[3/4] Requesting SSL certificate from Let's Encrypt..."
docker compose -f "$COMPOSE_FILE" run --rm certbot \
    certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

# ---- Step 4: Restore real config & restart ----
echo "[4/4] Restoring full HTTPS proxy config..."
mv proxy/nginx.prod.conf.bak proxy/nginx.prod.conf

echo ""
echo "========================================="
echo " SSL Certificate obtained successfully!"
echo "========================================="
echo ""
echo "Now start the full stack:"
echo "  docker compose -f $COMPOSE_FILE up -d --build"
echo ""
echo "Certificate auto-renewal is handled by the certbot"
echo "container (checks every 12 hours)."
echo ""
echo "To test renewal:"
echo "  docker compose -f $COMPOSE_FILE run --rm certbot certbot renew --dry-run"
echo ""
