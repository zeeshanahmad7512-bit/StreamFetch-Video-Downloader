# StreamFetch — Video Downloader

A self-hosted downloader for publicly accessible media that you own or are authorized to save.

## Features
- Premium responsive dark interface
- Video metadata and thumbnail preview
- Best available, up to 1080p / 720p / 480p and MP3 options
- Node.js + Express backend, yt-dlp and FFmpeg
- Host allowlist, API rate limiting, temporary file cleanup

## Important limitations
- Only use this service for content you own, have permission to download, or are otherwise legally entitled to save.
- No DRM circumvention, private-content access, login-cookie support or platform restriction bypass.
- Platform support changes over time. Some URLs or formats may not be downloadable.
- This is a starter deployment, not a high-volume commercial service. Add authentication, quotas, monitoring, persistent job queues and storage before opening it to the public.
- Large downloads can exceed the memory, disk, request-duration or bandwidth limits of low-cost hosting.

## Run locally with Docker
```bash
docker build -t streamfetch .
docker run --rm -p 3000:3000 streamfetch
```
Open http://localhost:3000

## Run locally without Docker
Requirements: Node.js 20+, Python 3, yt-dlp and FFmpeg installed and available in PATH.
```bash
npm install
npm start
```

## Deploy to Render (Docker)
1. Create a GitHub repository and upload the contents of this folder (not the ZIP itself).
2. In Render, choose **New + → Web Service**, connect the repository.
3. Select **Docker** as the runtime. Render will detect `Dockerfile`.
4. Set the health check path to `/api/health` if it is not detected automatically.
5. Deploy and open the generated `onrender.com` URL.
6. For a real public service, use a paid instance with enough RAM, disk and request duration. Review current Render limits before launch.

The included `render.yaml` is an optional Blueprint configuration. You can deploy it through Render Blueprint if preferred.

## Deploy on a VPS
Install Docker, clone the repository, then:
```bash
docker build -t streamfetch .
docker run -d --restart unless-stopped -p 3000:3000 --name streamfetch streamfetch
```
Put it behind HTTPS using Caddy or Nginx. Do not expose an unencrypted production service.

## Configuration
- `PORT`: HTTP port (default 3000)
- `YTDLP_PATH`: yt-dlp executable path (default `yt-dlp`)
- `MAX_CONCURRENT_DOWNLOADS`: concurrent downloads (default 2)

## API
- `GET /api/health`
- `POST /api/info` with JSON `{ "url": "https://..." }`
- `POST /api/download` with JSON `{ "url": "https://...", "quality": "best|1080|720|480|audio" }`

## Before public launch
- Confirm local laws and the terms of each source platform.
- Add authentication and per-user quotas.
- Add a job queue and object storage for long-running downloads.
- Add monitoring, abuse reporting and stricter infrastructure-level egress controls.
- Keep yt-dlp updated and review platform compatibility regularly.
