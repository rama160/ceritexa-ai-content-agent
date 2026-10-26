#!/usr/bin/env python3
"""Ceritexa review-only Shorts renderer; a green GitHub run means a real MP4 upload.

Single canonical renderer for Panex/Heros. No automatic provider publishing.
Requires the GitHub Actions CERITEXA_ADMIN_TOKEN repository secret.
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = os.environ.get("CERITEXA_WORKER_URL", "https://ceritexa-content-agent.finchat-ai-gateway.workers.dev").rstrip("/")
TOKEN = os.environ.get("CERITEXA_ADMIN_TOKEN", "")
EVENT = os.environ.get("GITHUB_EVENT_NAME", "workflow_dispatch")
MAX_JOBS = 2
MAX_BYTES = 7_500_000


def request(path: str, data=None, content_type=None):
    """Authenticated API request. Token is NEVER placed in URL or diagnostic logs."""
    headers = {
        "Authorization": "Bearer " + TOKEN,
        "User-Agent": "Ceritexa-renderer/1.4.2",
        "Cache-Control": "no-store",
    }
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(
        BASE + path, data=data, headers=headers, method="POST" if data is not None else "GET"
    )
    try:
        with urllib.request.urlopen(req, timeout=80) as response:
            body = response.read()
            return body if path.startswith("/api/media/") else json.loads(body)
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise RuntimeError("HTTP 401: CERITEXA_ADMIN_TOKEN GitHub tidak cocok dengan ADMIN_TOKEN Worker.") from None
        error = exc.read(500).decode("utf-8", "replace")
        raise RuntimeError(f"Worker HTTP {exc.code} on {path}: {error[:230]}") from None
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Tidak dapat menghubungi Worker Ceritexa ({path}): {exc.reason}") from None


def report(item_id: str, status: str, detail: str = ""):
    """Record render diagnostics in the existing D1 audit table. No new schema."""
    payload = json.dumps({"status": status, "detail": detail[:230]}).encode("utf-8")
    try:
        request(f"/api/posts/{item_id}/render-event", payload, "application/json")
    except Exception as exc:
        print(f"::warning::Ceritexa render diagnostic could not be saved: {exc}", flush=True)


def command(*args):
    try:
        subprocess.run(args, check=True, capture_output=True, timeout=260)
    except subprocess.CalledProcessError as exc:
        text = (exc.stderr or b"").decode("utf-8", "replace").strip()
        raise RuntimeError(f"{args[0]} returned {exc.returncode}: {text[-1100:]}") from None
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"{args[0]} exceeded 260 seconds") from None


def probe_json(path: Path, select_streams=None):
    cmd = ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams"]
    if select_streams:
        cmd += ["-select_streams", select_streams]
    return json.loads(subprocess.check_output(cmd + [str(path)], text=True, timeout=25))


def duration_seconds(path: Path):
    info = probe_json(path)
    return float(info["format"]["duration"])


def create_subtitles(story: str, seconds: float, path: Path):
    words = story.split()
    chunks = [" ".join(words[i:i + 9]) for i in range(0, len(words), 9)]
    if not chunks or not 0 < seconds <= 59:
        raise ValueError("Naskah kosong atau durasi narasi melebihi batas Shorts.")
    interval = seconds / len(chunks)

    def stamp(s):
        ms = int(s * 1000)
        return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"

    lines = []
    for i, item in enumerate(chunks):
        lines.extend([str(i + 1), stamp(i * interval) + " --> " + stamp((i + 1) * interval), item, ""])
    path.write_text("\n".join(lines), encoding="utf-8")


def verify_mp4(mp4: Path):
    size = mp4.stat().st_size
    if not (1000 <= size <= MAX_BYTES):
        raise ValueError(f"MP4 size {size} bytes is outside 1000-{MAX_BYTES}.")
    with mp4.open("rb") as fh:
        header = fh.read(16)
    if header[4:8] != b"ftyp":
        raise ValueError("FFmpeg output has no valid MP4 signature.")
    info = probe_json(mp4)
    streams = info.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if not video or video.get("codec_name") != "h264" or not audio:
        raise ValueError("MP4 must contain H.264 video and narration audio.")
    if int(video.get("width", 0)) >= int(video.get("height", 0)):
        raise ValueError("MP4 must be vertical 9:16.")
    return size


def verify_upload(ident: str):
    """Never report success on HTTP 200 alone: confirm same post now points to MP4."""
    for attempt in range(3):
        saved = next((p for p in request("/api/posts").get("posts", []) if p.get("id") == ident), None)
        if saved and saved.get("state") == "PENDING_REVIEW" and saved.get("media_type") == "video/mp4" and str(saved.get("media_key", "")).endswith(".mp4"):
            return saved["media_key"]
        if attempt < 2:
            time.sleep(2)
    raise RuntimeError("Worker did not confirm media_type=video/mp4 and state=PENDING_REVIEW after upload.")


def render(item, folder: Path):
    ident = item["id"]
    story = item["story"].strip()
    if len(story) < 100 or len(story.split()) > 145:
        raise ValueError("Naskah VIDEO harus 100+ karakter dan tidak lebih dari 145 kata.")

    source = folder / "art.jpg"
    illustration = request("/api/media/" + ident)
    if not illustration.startswith(b"\xff\xd8"):
        raise ValueError("Source artwork must be valid JPEG (not an MP4 or error response).")
    source.write_bytes(illustration)
    wav, srt, mp4 = folder / "voice.wav", folder / "caption.srt", folder / "output.mp4"

    # Preserve every story word; accelerate TTS only if needed to fit within 59 seconds.
    duration = 0
    for speed in [175, 195, 215]:
        command("espeak-ng", "-v", "id", "-s", str(speed), "-w", str(wav), story[:6500])
        duration = duration_seconds(wav)
        if 8 < duration <= 59:
            break
    if not 8 < duration <= 59:
        raise ValueError(f"Durasi narasi {duration:.1f}s di luar target 8-59 detik. Pendekkan naskah VIDEO melalui Edit draft.")

    create_subtitles(story, duration, srt)
    filt = (
        "scale=480:854:force_original_aspect_ratio=increase,crop=480:854,"
        "format=yuv420p,subtitles=" + str(srt)
        + ":force_style='FontName=DejaVu Sans,FontSize=15,Outline=2,Shadow=1,MarginV=65'"
    )
    command(
        "ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", "24",
        "-i", str(source), "-i", str(wav), "-vf", filt,
        "-c:v", "libx264", "-preset", "veryfast",
        "-b:v", "220k", "-maxrate", "320k", "-bufsize", "640k",
        "-r", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k",
        "-t", str(duration), "-movflags", "+faststart",
        "-shortest", str(mp4),
    )
    size = verify_mp4(mp4)
    uploaded = request("/api/posts/" + ident + "/media", mp4.read_bytes(), "video/mp4")
    if uploaded.get("id") != ident or not uploaded.get("media_key", "").endswith(".mp4"):
        raise RuntimeError("Worker upload API did not acknowledge the correct MP4 draft.")
    key = verify_upload(ident)
    report(ident, "COMPLETED", f"MP4 uploaded and D1 verified ({size} bytes)")
    return size, key


def eligible(posts):
    return [
        item for item in posts
        if item.get("format") == "VIDEO"
        and item.get("channel") in ("panex", "heros")
        and item.get("state") == "BLOCKED"
        and item.get("media_type") == "image/jpeg"
        and item.get("risk_note") == "VIDEO_RENDER_REQUIRED"
        and item.get("media_key")
    ]


def summary(lines):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as out:
            out.write("\n## Ceritexa MP4 renderer verification\n\n")
            out.write("\n".join(lines) + "\n")
    for line in lines:
        print(line, flush=True)


def main():
    if "--self-test" in sys.argv:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "test.srt"
            create_subtitles("Cerita orisinal tentang keberanian manusia", 12, path)
            assert path.read_text(encoding="utf-8").count("-->") == 1
            assert eligible([{"format": "VIDEO", "channel": "panex", "state": "BLOCKED", "media_type": "image/jpeg", "risk_note": "VIDEO_RENDER_REQUIRED", "media_key": "images/1.jpg"}])
            assert not eligible([{"format": "VIDEO", "channel": "panex", "state": "PENDING_REVIEW", "media_type": "video/mp4", "risk_note": "", "media_key": "owner/1.mp4"}])
        print("Renderer self-test PASS")
        return 0

    if not TOKEN or len(TOKEN) < 24:
        summary(["❌ GitHub Secret CERITEXA_ADMIN_TOKEN is absent or too short.",
                 "Set it in this repo only: Settings → Secrets and variables → Actions. Match Cloudflare ceritexa-content-agent ADMIN_TOKEN."])
        return 2

    try:
        status = request("/api/status")
        if status.get("paused"):
            msg = "Ceritexa Pause All enabled; no rendering permitted."
            summary(["⚠️ " + msg])
            return 1 if EVENT == "workflow_dispatch" else 0
        candidates = eligible(request("/api/posts").get("posts", []))
    except Exception as exc:
        summary([f"❌ Cannot check Ceritexa drafts: {exc}"])
        return 1

    print("Eligible unrendered Shorts:", len(candidates), flush=True)
    if not candidates:
        summary(["ℹ️ No blocked JPEG-based YouTube drafts require MP4 rendering.",
                 "This is not evidence of a completed upload. Review each draft's media_type in the dashboard."])
        return 1 if EVENT == "workflow_dispatch" else 0

    lines = []
    failures = 0
    for item in candidates[:MAX_JOBS]:
        ident = item["id"]
        title = str(item.get("title", "untitled"))[:80]
        print(f"Starting render: {item['channel']} / {title} / {ident}", flush=True)
        report(ident, "STARTED", "GitHub Actions renderer started")
        try:
            with tempfile.TemporaryDirectory() as temp:
                size, key = render(item, Path(temp))
            line = f"✅ {item['channel']} — {title}: MP4 {size} bytes; media_key {key}; state PENDING_REVIEW confirmed."
            print("::notice::" + line, flush=True)
        except Exception as exc:
            failures += 1
            message = str(exc).replace("\n", " ")[:270]
            line = f"❌ {item['channel']} — {title}: {type(exc).__name__}: {message}"
            print("::error::" + line, flush=True)
            report(ident, "FAILED", message)
        lines.append(line)

    summary(lines)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
