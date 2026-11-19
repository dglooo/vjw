# Deploy: one nginx container, a secret sub-path, HTTPS

The app is served only at `https://<host>/<slug>/`. Every other path returns 404, `/robots.txt` disallows everything,
and every response carries `X-Robots-Tag: noindex, nofollow`. There is no login: the slug is the lock. Keep it out of
commits, chats and screenshots, and never push the image to a public registry (the slug is inside).

## Build (from the repo root)
    SLUG=$(openssl rand -hex 16)   # the build refuses fewer than 16 of [A-Za-z0-9_-]
    docker build -f deploy/Dockerfile --build-arg SLUG=$SLUG -t vjw .
The build runs `npm ci` (its postinstall fetches the MediaPipe pose model) and `VJW_BASE=/$SLUG/ npm run build`.
On an Apple-silicon Mac, add `--platform linux/amd64` for an x86 server, or build on the server.

## Run
    docker run -d --name vjw --restart unless-stopped -p 80:80 -p 443:443 \
      -v /srv/vjw/certs:/etc/nginx/certs:ro vjw
Open `https://<host>/<slug>/`. Port 80 only redirects to HTTPS.

## HTTPS is required
Chrome gives `AudioWorklet` (the onset detector) and `getUserMedia` (line-in, camera) to a secure context only. On
plain `http://<ip>` the detector and the audio-device input break. With no cert mounted, the container makes a
self-signed one at start: it works after the browser's warning (Advanced, then Proceed).

## A real cert (no warning)
Use a domain, or a free name that resolves to the IP: `203-0-113-7.sslip.io` or `203.0.113.7.nip.io`. Get a
Let's Encrypt cert for it while ports 80 and 443 are free (stop the container first):
    certbot certonly --standalone -d 203-0-113-7.sslip.io
    mkdir -p /srv/vjw/certs
    cp -L /etc/letsencrypt/live/203-0-113-7.sslip.io/{fullchain,privkey}.pem /srv/vjw/certs/
Then start the container with the mount above. Renew the same way before the cert expires (90 days).

## Check
    curl -kI https://<host>/<slug>/   # 200
    curl -kI https://<host>/          # 404
