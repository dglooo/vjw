# Deploy: one nginx container, a secret sub-path, HTTPS

The app is served only at `https://<host>/<slug>/`. Every other path returns 404, `/robots.txt` disallows everything,
and every response carries `X-Robots-Tag: noindex, nofollow`. There is no login: the slug is the lock. Keep it out of
commits, chats and screenshots, and never push the image to a public registry (the slug is inside).

## Build (from the repo root)
    SLUG=$(openssl rand -hex 16)   # the build refuses fewer than 16 of [A-Za-z0-9_-]
    docker build -f deploy/Dockerfile --build-arg SLUG=$SLUG -t vjw .
The build runs `npm ci` (its postinstall fetches the MediaPipe pose model) and `VJW_BASE=/$SLUG/ npm run build`.
On an Apple-silicon Mac, add `--platform linux/amd64` for an x86 server, or build on the server.
Your curation (the trash, favourites, rework marks and stars) lives in `web/scene-marks.json`, which the dev server
writes and git ignores. The build bakes it in as every visitor's defaults (a visitor's own changes win). Build where
that file is, or copy it into `web/` first. Without it the build still passes, with the built-ins' own stars.

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

## Remote AI (development): the lead live-codes your G editor on the site
`deploy/ai-relay.mjs` passes the lead's shader code into the G editor open in your browser (docs/ai-shader-guide.md).
One file, Node 20, no npm packages, nothing stored. Its only lock is a token you make. The paths below are for `/vjw001/`.
1. From the repo root on your Mac, copy the relay and the guide to the server:
       scp deploy/ai-relay.mjs docs/ai-shader-guide.md <user>@<host>:/tmp/
2. On the server, make the token and start the relay (it listens on 127.0.0.1:7781 and restarts with the server):
       sudo mkdir -p /opt/vjw-ai && sudo mv /tmp/ai-relay.mjs /tmp/ai-shader-guide.md /opt/vjw-ai/
       echo "VJW_AI_TOKEN=$(openssl rand -hex 24)" | sudo tee /etc/vjw-ai.env >/dev/null && sudo chmod 600 /etc/vjw-ai.env
       sudo docker run -d --name vjw-ai --restart unless-stopped --init --network host --env-file /etc/vjw-ai.env \
         -v /opt/vjw-ai:/app:ro node:20-alpine node /app/ai-relay.mjs
   No Docker: with Node ≥ 20, `env $(sudo cat /etc/vjw-ai.env) node /opt/vjw-ai/ai-relay.mjs` (it lives with that shell: tmux).
3. In the nginx `server { … }` that serves `/vjw001/`, add this block, then `sudo nginx -t && sudo systemctl reload nginx`:
       location /vjw001/__ai/ {
         proxy_pass http://127.0.0.1:7781/__ai/;
         proxy_http_version 1.1;
         proxy_set_header Connection '';
         proxy_set_header X-Real-IP $remote_addr;
         proxy_buffering off;       # the editor's event stream (SSE) goes through at once
         proxy_read_timeout 1h;     # an idle stream stays open
         client_max_body_size 3m;   # the editor's answer carries a PNG still (nginx's default is 1m)
         access_log off;            # the stream's URL carries the token; the relay logs each call without it
       }
4. Upload a build that has the Remote AI row: `cd web && VJW_BASE=/vjw001/ npm run build`, then `web/dist/` as before.
5. Check: `curl -s https://<host>/vjw001/__ai/state` answers `{"ok":false,"error":"a wrong or missing token: …"}`.
6. Your token: `sudo cat /etc/vjw-ai.env`, the part after `=`. Open the site, press Start, then G, paste the token
   into Remote AI and press Connect: the dot turns green. From then on G connects by itself in this browser. Send the
   same token to the lead in the chat. Logs: `sudo docker logs -f vjw-ai`. A new token: rerun the `echo` line, then
   `sudo docker rm -f vjw-ai` and the `docker run` line again.
