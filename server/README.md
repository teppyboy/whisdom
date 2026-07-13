# Whisdom Server

Server-side Whisper transcription backend using Rust, Axum, and whisper.cpp.

## Quick Start

### Prerequisites

- Rust 1.82+ (stable)
- CMake and a C++ compiler (for whisper.cpp bindings)
- LLVM/clang (for bindgen on Windows: `winget install LLVM.LLVM`)
- ffmpeg (for audio extraction)
- yt-dlp (for URL downloads)

### Setup

```bash
# Review and customize config
cp config.toml.example config.toml   # or edit the provided config.toml

# Download a GGML model
bash scripts/download-model.sh ./models ggml-base-q5_1.bin

# Build and run
cargo build --release
./target/release/whisdom-server
```

The server starts on port 8788 by default. All settings can be changed via `config.toml` or environment variables.

### Configuration

Primary configuration lives in `config.toml`. Environment variables override TOML values. The server looks for `config.toml` in the working directory, or at `$WHISDOM_CONFIG`.

```toml
[server]
port = 8788
threads = 0          # 0 = auto-detect CPU cores

[auth]
allowed_origin = "https://your-frontend-domain.com"
allowed_emails = []  # e.g. ["user@example.com"]
allowed_domains = [] # e.g. ["example.com"]

[model]
path = "./models/ggml-base-q5_1.bin"

[paths]
temp_dir = "./tmp"

[limits]
max_upload_mb = 500

[turnstile]
enabled = true
secret_key = "1x0000000000000000000000000000000AA"  # from Cloudflare dashboard
```

Environment variable overrides:

| Variable | Config key |
|----------|-----------|
| `WHISDOM_CONFIG` | Path to config.toml |
| `WHISDOM_SERVER_PORT` | `server.port` |
| `WHISDOM_THREADS` | `server.threads` |
| `WHISDOM_ALLOWED_ORIGIN` | `auth.allowed_origin` |
| `WHISDOM_ALLOWED_EMAILS` | `auth.allowed_emails` (comma-separated) |
| `WHISDOM_ALLOWED_DOMAINS` | `auth.allowed_domains` (comma-separated) |
| `WHISDOM_MODEL_PATH` | `model.path` |
| `WHISDOM_TEMP_DIR` | `paths.temp_dir` |
| `WHISDOM_YTDLP_PATH` | `paths.ytdlp_path` |
| `WHISDOM_FFMPEG_PATH` | `paths.ffmpeg_path` |
| `WHISDOM_MAX_UPLOAD_MB` | `limits.max_upload_mb` |
| `TURNSTILE_SECRET_KEY` | `turnstile.secret_key` |
| `TURNSTILE_ENABLED` | `turnstile.enabled` (`"1"` or `"true"`) |

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/health | No | Health check |
| GET | /api/capabilities | No | Server capabilities |
| POST | /api/transcribe | Yes | Submit file or URL (multipart) |
| GET | /api/progress/:id | Yes | SSE progress stream |
| POST | /api/cancel/:id | Yes | Cancel running job |

### Authentication

Include a Google OAuth2 access token:

```
Authorization: Bearer <google-oauth-token>
```

### Submit a file

```bash
curl -X POST http://localhost:8788/api/transcribe \
  -H "Authorization: Bearer <token>" \
  -F "audio=@audio.mp3" \
  -F "language=en"
```

### Submit a URL

```bash
curl -X POST http://localhost:8788/api/transcribe \
  -H "Authorization: Bearer <token>" \
  -F "url=https://www.youtube.com/watch?v=..." \
  -F "language=vi"
```

### Stream progress

```bash
curl -N http://localhost:8788/api/progress/<job_id> \
  -H "Authorization: Bearer <token>"
```

Response is an SSE stream of JSON events with `phase`, `progress`, `message`, `text`, and `segments` fields.

## Deployment

### Docker

```bash
docker build -t whisdom-server .
docker run -p 8788:8788 \
  -v $(pwd)/config.toml:/app/config.toml \
  -v $(pwd)/models:/data/models \
  whisdom-server
```

### Bare metal with systemd

```ini
# /etc/systemd/system/whisdom-server.service
[Unit]
Description=Whisdom transcription server
After=network.target

[Service]
Type=simple
User=whisdom
WorkingDirectory=/opt/whisdom-server
ExecStart=/opt/whisdom-server/whisdom-server
Restart=on-failure
RestartSec=5
Environment=RUST_LOG=whisdom_server=info

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /bin/false whisdom
sudo cp target/release/whisdom-server /opt/whisdom-server/
sudo cp config.toml /opt/whisdom-server/
sudo mkdir -p /opt/whisdom-server/models /opt/whisdom-server/tmp
sudo chown -R whisdom:whisdom /opt/whisdom-server
sudo systemctl daemon-reload
sudo systemctl enable --now whisdom-server
```

### Nginx reverse proxy

```nginx
server {
    listen 443 ssl http2;
    server_name transcription.example.com;

    ssl_certificate /etc/ssl/example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/example.com/privkey.pem;

    client_max_body_size 500m;

    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

### Security hardening

- Run behind a reverse proxy (nginx/Caddy) with TLS
- Set `auth.allowed_emails` and `auth.allowed_domains` to restrict access
- Enable Turnstile for bot protection (see below)
- Use a dedicated non-root user (`whisdom`) for the service
- Set `limits.max_upload_mb` to a reasonable value
- Place model and temp directories on a volume with sufficient space

## Turnstile Integration

Cloudflare Turnstile adds bot protection to the `/api/transcribe` endpoint. When enabled, every transcribe request must include a valid Turnstile token.

### Setup

1. Create a Turnstile widget in the [Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Add your frontend domain(s) to the widget
3. Copy the **secret key** from the dashboard

### Server config

```toml
[turnstile]
enabled = true
secret_key = "1x0000000000000000000000000000000AA"
```

Or via environment:

```bash
export TURNSTILE_ENABLED=true
export TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

### Frontend

Add the Turnstile widget to your frontend and send the token with each transcribe request:

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<div class="cf-turnstile" data-sitekey="<YOUR_SITE_KEY>"></div>
```

Send the token as a form field:

```javascript
const form = new FormData()
form.set("audio", audioFile)
form.set("language", "en")
form.set("turnstile_token", turnstileToken)  // from Turnstile callback

await fetch("/api/transcribe", {
  method: "POST",
  headers: { Authorization: `Bearer ${googleToken}` },
  body: form,
})
```

When Turnstile is disabled or the secret key is empty, the token check is skipped entirely — no frontend changes are required.

## Recommended CPU Models

| Model | Size | Quality |
|-------|------|---------|
| ggml-tiny-q5_1.bin | ~40MB | Fastest |
| ggml-base-q5_1.bin | ~140MB | Balanced |
| ggml-small-q5_1.bin | ~460MB | High quality |
| ggml-medium-q5_0.bin | ~1.1GB | Best quality |

Download via: `bash scripts/download-model.sh ./models <model-filename>`
