#!/usr/bin/env python3
"""Render owner-reviewable AI Shorts from *existing* Ceritexa video drafts.

Runs ONLY on GitHub Actions with private CERITEXA_ADMIN_TOKEN. Never publishes.
No third-party scraping, paid API, or channel authentication is needed.
"""
import json
import os
import subprocess
import tempfile
import urllib.request
from pathlib import Path

BASE = os.environ.get("CERITEXA_WORKER_URL", "https://ceritexa-content-agent.finchat-ai-gateway.workers.dev").rstrip("/")
TOKEN = os.environ.get("CERITEXA_ADMIN_TOKEN", "")
MAX_JOBS = 2


def request(path: str, data=None, content_type=None):
    headers = {"Authorization": "Bearer " + TOKEN, "User-Agent": "Ceritexa-renderer/1.0"}
    if content_type:
        headers["Content-Type"] = content_type
    method = "POST" if data is not None else "GET"
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=70) as response:
        value = response.read()
        return value if path.startswith("/api/media/") else json.loads(value)


def command(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=240)


def create_subtitles(story: str, seconds: float, path: Path):
    words = story.split()
    chunks = [" ".join(words[i:i + 9]) for i in range(0, len(words), 9)]
    if not chunks:
        raise ValueError("Empty narration")
    interval = seconds / len(chunks)
    def stamp(s):
        ms = int(s * 1000)
        return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"
    lines = []
    for i, text in enumerate(chunks):
        lines.extend([str(i+1), stamp(i*interval) + " --> " + stamp((i+1)*interval), text, ""])
    path.write_text("\n".join(lines), encoding="utf-8")


def render(item, folder: Path):
    ident = item["id"]
    story = item["story"].strip()
    if len(story) < 100:
        raise ValueError("Story too short")
    if len(story.split()) > 145:
        raise ValueError("Naskah melebihi 145 kata. Edit draft menjadi 95-125 kata agar Shorts lengkap.")
    source = folder / "image.jpg"
    source.write_bytes(request("/api/media/" + ident))
    wav = folder / "voice.wav"
    srt = folder / "caption.srt"
    mp4 = folder / "output.mp4"
    # Built-in offline Indonesian TTS. Replaceable later with a licensed high-quality voice.
    command("espeak-ng", "-v", "id", "-s", "165", "-w", str(wav), story[:6500])
    probe = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(wav)],
        text=True, timeout=20).strip()
    duration = float(probe)
    if not (8 < duration <= 59.0):
        raise ValueError(f"Durasi narasi {duration:.1f}s di luar target Shorts (maks 59s). Edit draft terlebih dahulu.")
    create_subtitles(story, duration, srt)
    filt = "scale=480:854:force_original_aspect_ratio=increase,crop=480:854,format=yuv420p,subtitles=" + str(srt) + ":force_style='FontName=DejaVu Sans,FontSize=15,Outline=2,Shadow=1,MarginV=65'"
    command("ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", "24",
            "-i", str(source), "-i", str(wav),
            "-vf", filt, "-c:v", "libx264", "-preset", "veryfast",
            "-b:v", "220k", "-maxrate", "320k", "-bufsize", "640k",
            "-r", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k",
            "-t", str(duration), "-movflags", "+faststart", "-shortest", str(mp4))
    size = mp4.stat().st_size
    if size < 1000 or size > 7_500_000:
        raise ValueError(f"Rendered MP4 size invalid: {size}")
    request("/api/posts/" + ident + "/media", mp4.read_bytes(), "video/mp4")
    return size


def main():
    if not TOKEN or len(TOKEN) < 24:
        print("SKIP: CERITEXA_ADMIN_TOKEN GitHub secret not configured.")
        return
    status = request("/api/status")
    if status.get("paused"):
        print("SKIP: Ceritexa Pause All enabled.")
        return
    data = request("/api/posts")
    candidates = [p for p in data.get("posts", [])
                  if p.get("format") == "VIDEO" and p.get("state") == "BLOCKED"
                  and p.get("media_type") == "image/jpeg"
                  and p.get("risk_note") == "VIDEO_RENDER_REQUIRED"]
    print("Eligible unrendered Shorts:", len(candidates))
    for item in candidates[:MAX_JOBS]:
        try:
            with tempfile.TemporaryDirectory() as name:
                size = render(item, Path(name))
            print("Rendered draft:", item["id"], "bytes:", size, "(awaiting owner approval)")
        except Exception as exc:
            # No retries of upload beyond this run; video rendering is idempotent by state.
            print("Render failed for", item["id"], "-", type(exc).__name__, str(exc)[:160])


if __name__ == "__main__":
    main()
