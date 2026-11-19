#!/bin/sh
# Run by the nginx image's entrypoint at start. No cert mounted at /etc/nginx/certs: make a self-signed one, so
# HTTPS (the secure context AudioWorklet and getUserMedia need) works at once, behind a browser warning.
set -e
d=/etc/nginx/certs
[ -s "$d/fullchain.pem" ] && [ -s "$d/privkey.pem" ] && exit 0
mkdir -p "$d"
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj /CN=vjw -keyout "$d/privkey.pem" -out "$d/fullchain.pem" 2>/dev/null
echo "$0: no cert mounted, made a self-signed one"
