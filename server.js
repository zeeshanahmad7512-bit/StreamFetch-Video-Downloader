const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const YTDLP = process.env.YTDLP_PATH || "yt-dlp";
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_DOWNLOADS || 2);
let activeDownloads = 0;

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https:"],
    scriptSrc: ["'self'"],
    connectSrc: ["'self'"]
  }
}}));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }));

const allowedHosts = [
  "youtube.com", "youtu.be", "tiktok.com", "instagram.com",
  "facebook.com", "fb.watch"
];

function validateUrl(raw) {
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("Please enter a valid video URL.");
  let u;
  try { u = new URL(raw); } catch { throw new Error("That URL is not valid."); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only HTTP and HTTPS links are accepted.");
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const allowed = allowedHosts.some(d => host === d || host.endsWith("." + d));
  if (!allowed) throw new Error("This platform is not on the supported-host list.");
  return u.toString();
}

function runYtDlp(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("The request timed out. Try a shorter or publicly accessible video."));
    }, timeoutMs);
    child.stdout.on("data", d => { stdout += d.toString(); if (stdout.length > 5_000_000) child.kill("SIGKILL"); });
    child.stderr.on("data", d => { stderr += d.toString(); if (stderr.length > 20_000) stderr = stderr.slice(-20_000); });
    child.on("error", e => { clearTimeout(timer); reject(new Error("Could not start yt-dlp. Check the server installation.")); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim().split("\n").slice(-3).join(" ") || "Unable to process this video."));
    });
  });
}

app.get("/api/health", (_req, res) => res.json({ ok: true, engine: "yt-dlp" }));

app.post("/api/info", async (req, res) => {
  try {
    const url = validateUrl(req.body.url);
    const { stdout } = await runYtDlp([
      "--dump-single-json", "--no-playlist", "--no-warnings",
      "--socket-timeout", "15", url
    ], 90000);
    const info = JSON.parse(stdout);
    const formats = (info.formats || [])
      .filter(f => f.height && f.vcodec && f.vcodec !== "none")
      .map(f => f.height)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a,b) => b-a);
    res.json({
      title: info.title || "Video",
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      uploader: info.uploader || info.channel || null,
      formats: formats.slice(0, 8)
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/download", async (req, res) => {
  let tempDir;
  let acquiredSlot = false;
  try {
    if (activeDownloads >= MAX_CONCURRENT) return res.status(429).json({ error: "The downloader is busy. Please try again shortly." });
    const url = validateUrl(req.body.url);
    const quality = ["best", "1080", "720", "480", "audio"].includes(req.body.quality) ? req.body.quality : "best";
    activeDownloads++;
    acquiredSlot = true;
    tempDir = path.join(os.tmpdir(), "streamfetch-" + crypto.randomUUID());
    fs.mkdirSync(tempDir, { recursive: true });
    const output = path.join(tempDir, "media.%(ext)s");
    let format;
    if (quality === "audio") format = "bestaudio/best";
    else if (quality === "best") format = "bestvideo*+bestaudio/best";
    else format = `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`;

    const args = ["--no-playlist", "--no-warnings", "--no-part", "--socket-timeout", "20",
      "-f", format, "-o", output];
    if (quality === "audio") args.push("-x", "--audio-format", "mp3");
    else args.push("--merge-output-format", "mp4");
    args.push(url);

    await runYtDlp(args, 8 * 60 * 1000);
    const candidates = fs.readdirSync(tempDir).filter(n => !n.endsWith(".part"));
    if (!candidates.length) throw new Error("No downloadable media file was created.");
    const file = path.join(tempDir, candidates[0]);
    const ext = path.extname(file).toLowerCase();
    const mime = quality === "audio" ? "audio/mpeg" :
      (ext === ".webm" ? "video/webm" : "video/mp4");
    const safeName = (path.basename(candidates[0], ext).replace(/[^a-z0-9_-]/gi, "_").slice(0, 70) || "video") + (quality === "audio" ? ".mp3" : ext);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("Cache-Control", "no-store");
    const stream = fs.createReadStream(file);
    stream.on("error", () => { if (!res.headersSent) res.status(500).end("File read failed."); });
    stream.pipe(res);
    const cleanup = () => { try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} };
    res.on("finish", cleanup);
    res.on("close", cleanup);
    tempDir = null;
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally {
    if (tempDir) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
    if (acquiredSlot) activeDownloads--;
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`StreamFetch listening on ${PORT}`));
