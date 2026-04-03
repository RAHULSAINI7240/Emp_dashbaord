#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT_DIR/certs"
DEFAULT_IP="192.168.3.8"
LAN_IP="${1:-}"

if [[ -z "$LAN_IP" ]] && command -v hostname >/dev/null 2>&1; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi

LAN_IP="${LAN_IP:-$DEFAULT_IP}"

mkdir -p "$CERT_DIR"

cat > "$CERT_DIR/lan-dev.openssl.cnf" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
C = IN
ST = Dev
L = Local
O = Autovyn
OU = Engineering
CN = $LAN_IP

[v3_req]
subjectAltName = @alt_names
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = $LAN_IP
EOF

openssl req \
  -x509 \
  -nodes \
  -newkey rsa:2048 \
  -sha256 \
  -days 365 \
  -keyout "$CERT_DIR/lan-dev.key" \
  -out "$CERT_DIR/lan-dev.crt" \
  -config "$CERT_DIR/lan-dev.openssl.cnf" \
  -extensions v3_req

chmod 600 "$CERT_DIR/lan-dev.key"

printf 'Generated LAN HTTPS certificate for %s\n' "$LAN_IP"
