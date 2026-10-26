#!/usr/bin/env python3
"""Ceritexa review-only Shorts renderer; a green GitHub run means a real MP4 upload.

Single canonical renderer for Panex/Heros. No automatic provider publishing.
Requires the GitHub Actions CERITEXA_ADMIN_TOKEN repository secret.
"""
import json
import hashlib
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
        "User-Agent": "Ceritexa-renderer/1.6.1",
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
            return body if path.startswith("/api/media/") or path.endswith("/image") else json.loads(body)
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


def voice_for_channel(channel: str) -> str:
    """Channel-scoped neural narrator. No automatic robotic downgrade."""
    default = "id-ID-ArdiNeural" if channel == "heros" else "id-ID-GadisNeural"
    override = os.environ.get("CERITEXA_VOICE_HEROS" if channel == "heros" else "CERITEXA_VOICE_PANEX", default)
    if override not in ("id-ID-ArdiNeural", "id-ID-GadisNeural"):
        raise ValueError("Only approved Indonesian neural narrator voices are enabled")
    return override


def synthesize_neural(story: str, channel: str, folder: Path):
    """Edge online neural TTS provides actual subtitle timings. It is unofficial and may fail.

    Fail visibly if unavailable; never generate a low-quality eSpeak video as 'cinematic'.
    """
    speech = folder / "narration.mp3"
    subtitles = folder / "captions.srt"
    voice = voice_for_channel(channel)
    errors = []
    for rate in ("+0%", "+12%", "+24%"):
        for path in (speech, subtitles):
            path.unlink(missing_ok=True)
        try:
            command("edge-tts", "--voice", voice, "--rate", rate,
                    "--text", story, "--write-media", str(speech),
                    "--write-subtitles", str(subtitles))
            if not speech.exists() or speech.stat().st_size < 3500:
                raise RuntimeError("Neural TTS produced no usable speech audio")
            if not subtitles.exists() or "-->" not in subtitles.read_text(encoding="utf-8"):
                raise RuntimeError("Neural TTS returned no synchronized SRT subtitle timings")
            length = duration_seconds(speech)
            if 8 < length <= 58.5:
                return speech, subtitles, length, voice, rate
            errors.append(f"duration {length:.1f}s at {rate}")
        except Exception as exc:
            errors.append(str(exc)[:130])
            # An unavailable provider must fail closed, not silently switch to robotic audio.
            if "returned" in str(exc) or "TTS" in str(exc):
                break
    raise RuntimeError(
        "Narasi neural gagal atau tidak muat dalam 59 detik. "
        "Edit naskah agar lebih singkat atau ulangi jika Edge TTS tersedia lagi. "
        "Details: " + "; ".join(errors[-3:])
    )


def get_storyboard_images(ident: str, folder: Path):
    """Continue the story's OWN dynamic shot plan until all frames are ready.

    Each Worker call generates a small bounded batch; under a free-tier quota pause
    we stop and keep already-generated frames, never silently shorten the story.
    """
    endpoint = "/api/posts/" + ident + "/storyboard"
    last = -1
    meta = None
    for attempt in range(26):
        # Write-capable request also returns the plannedCount, partial asset metadata and quota.
        meta = request(endpoint, b"{}", "application/json")
        count, planned = int(meta.get("sceneCount", 0)), int(meta.get("plannedCount", 0))
        if planned < 2 or planned > 24:
            raise RuntimeError(f"Invalid narrative scene plan: {planned} shots.")
        if meta.get("ready"):
            break
        if meta.get("dailyLimitReached"):
            raise RuntimeError(
                f"Story has {planned} planned scenes; only {count} generated. "
                "Ceritexa free image quota was reached. Storyboard is retained; "
                "retry another day, do not shorten the narrative."
            )
        if count == last:
            raise RuntimeError(
                f"Storyboard generation stalled at {count}/{planned}; "
                "check Workers AI and scene generation audit."
            )
        last = count
    else:
        raise RuntimeError("Storyboard did not complete within 26 bounded requests")

    scenes = meta.get("scenes", [])
    if not meta.get("ready") or len(scenes) != planned:
        raise RuntimeError("Storyboard is not complete; MP4 creation blocked.")
    files, seen = [], set()
    for index, scene in enumerate(scenes):
        if scene.get("index") != index or not str(scene.get("beat", "")).strip():
            raise RuntimeError(f"Scene {index+1}/{planned} has invalid ordering or beat")
        data = request(f"{endpoint}/{index}/image")
        if not isinstance(data, bytes) or not data.startswith(b"\xff\xd8") or len(data) < 1000:
            raise RuntimeError(f"Storyboard scene {index+1}/{planned} is not a usable JPEG")
        digest = hashlib.sha256(data).digest()
        if digest in seen:
            raise RuntimeError(f"Storyboard contains identical illustrations: scene {index+1}")
        seen.add(digest)
        path = folder / f"scene-{index:02}.jpg"
        path.write_bytes(data)
        files.append(path)
    return files, scenes


def scene_durations(scenes, voice_duration: float):
    """Allocate screen time according to the amount of *spoken narrative* in each beat,
    rather than dividing every story into an arbitrary number of equal-duration shots.
    """
    if not 8 < voice_duration <= 59 or not 2 <= len(scenes) <= 24:
        raise ValueError("Narration or dynamic storyboard duration is out of range.")
    lengths = [len(str(scene["beat"]).split()) for scene in scenes]
    if not all(n > 0 for n in lengths):
        raise ValueError("A scene has no story beat or voiceover")
    total = sum(lengths)
    durations = [voice_duration * n / total for n in lengths]
    # Do not force many tiny clips: inconsistent narration pacing must be revised.
    if any(t < 1.0 for t in durations):
        raise ValueError("A story beat lasts under 1 second. Edit the script or scene plan.")
    return durations


def motion_graph(durations, subtitle_file: Path):
    """Variable-count moving-camera shots with scene-relative fade and true narration time.

    FFmpeg fade/concat avoids xfade timing instability, and no scene is fabricated to
    fill a fixed four-shot video.
    """
    if not 2 <= len(durations) <= 24 or any(d <= 0 for d in durations):
        raise ValueError("Invalid dynamically planned scene durations")
    filters = []
    for i, segment in enumerate(durations):
        fade = min(.28, segment / 8)
        zoom = ["min(zoom+0.00075,1.13)", "min(zoom+0.00060,1.12)",
                "min(zoom+0.00090,1.17)", "min(zoom+0.00055,1.11)"][i % 4]
        x = "iw/2-(iw/zoom/2)" if i % 2 == 0 else "max(0,iw/2-(iw/zoom/2))"
        y = "ih/2-(ih/zoom/2)"
        filters.append(
            f"[{i}:v]scale=600:1068:force_original_aspect_ratio=increase,"
            f"crop=600:1068,zoompan=z='{zoom}':x='{x}':y='{y}':d=1:s=540x960:fps=24,"
            f"fps=24,trim=duration={segment:.3f},settb=AVTB,setpts=PTS-STARTPTS,"
            f"fade=t=in:st=0:d={fade:.3f},"
            f"fade=t=out:st={segment-fade:.3f}:d={fade:.3f}[v{i}]"
        )
    filters.append("".join(f"[v{i}]" for i in range(len(durations)))+
                   f"concat=n={len(durations)}:v=1:a=0[merged]")
    srt = str(subtitle_file).replace("'", "\\'")
    filters.append(
        f"[merged]subtitles='{srt}':"
        "force_style='FontName=DejaVu Sans,FontSize=16,Outline=2,Shadow=0,MarginV=115'[outv]"
    )
    return ";".join(filters)


def encode_motion_movie(images, scenes, voice, subtitles, duration, output: Path):
    """Encode each unique scene at its narration-based duration and validate MP4."""
    if len(images) != len(scenes):
        raise ValueError("Image count must equal narrative scene count")
    durations = scene_durations(scenes, duration)
    graph = motion_graph(durations, subtitles)
    for rate in (720, 570):
        args = ["ffmpeg", "-y", "-loglevel", "error"]
        for image, seconds in zip(images, durations):
            args.extend(["-loop", "1", "-framerate", "24", "-t", f"{seconds + .12:.3f}", "-i", str(image)])
        args.extend(["-i", str(voice), "-filter_complex", graph,
                     "-map", "[outv]", "-map", f"{len(images)}:a:0",
                     "-c:v", "libx264", "-preset", "veryfast",
                     "-b:v", f"{rate}k", "-maxrate", f"{rate+100}k",
                     "-bufsize", f"{(rate+100)*2}k",
                     "-r", "24", "-pix_fmt", "yuv420p",
                     "-c:a", "aac", "-b:a", "80k", "-af", "loudnorm=I=-16:LRA=11:TP=-2.0",
                     "-t", f"{duration:.3f}", "-movflags", "+faststart",
                     "-shortest", str(output)])
        command(*args)
        if output.stat().st_size <= MAX_BYTES:
            return verify_mp4(output)
    raise ValueError("Cinematic MP4 >7.5MB; reduce story length but never silently skip scenes")


def render(item, folder: Path):
    ident = item["id"]
    story = str(item["story"] or "").strip()
    if len(story) < 100 or len(story.split()) > 145:
        raise ValueError("Naskah VIDEO harus minimal 100 karakter dan maksimum 145 kata.")
    images, scenes = get_storyboard_images(ident, folder)
    narration, captions, duration, voice, rate = synthesize_neural(story, item["channel"], folder)
    output = folder / "cinematic.mp4"
    size = encode_motion_movie(images, scenes, narration, captions, duration, output)
    uploaded = request("/api/posts/" + ident + "/media", output.read_bytes(), "video/mp4")
    if uploaded.get("id") != ident or not uploaded.get("media_key", "").endswith(".mp4"):
        raise RuntimeError("Cloudflare did not acknowledge actual MP4 upload")
    key = verify_upload(ident)
    report(ident, "COMPLETED",
           f"CINEMATIC_MOTION_COMIC; scene_count={len(scenes)}; neural={voice}; "
           f"rate={rate}; MP4/D1 verified; {size} bytes")
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
            assert voice_for_channel("panex") in ("id-ID-GadisNeural","id-ID-ArdiNeural")
            for n in (3, 6, 9, 12):
                scenes = [{"beat": "Narasi konflik berubah menjadi harapan setiap adegan"} for _ in range(n)]
                durations = scene_durations(scenes, 48.0)
                graph = motion_graph(durations, Path(temp) / "caption.srt")
                assert len(durations) == n
                assert abs(sum(durations) - 48.0) < 0.001
                assert graph.count("fade=t=in") == n and "zoompan=" in graph
                assert "concat=n=" + str(n) in graph
                assert "subtitles=" in graph
            unequal = scene_durations([{"beat": "Pahlawan datang"},{"beat": "Namun ia harus menolong seisi kota dengan kekuatan baru"}],24)
            assert unequal[1] > unequal[0]

        print("Renderer self-test PASS")
        return 0

    if "--self-test-media" in sys.argv:
        # Fully offline encoder smoke. Validates the exact production FFmpeg graph
        # across two different scene counts without making real AI/provider calls.
        colors = ["red", "blue", "green", "yellow", "magenta", "cyan", "orange"]
        for count in (3, 7):
            with tempfile.TemporaryDirectory() as work:
                folder = Path(work)
                scenes = [{"beat": "Tokoh memasuki babak konflik dan memilih keberanian"} for _ in range(count)]
                pictures = []
                for index, color in enumerate(colors[:count]):
                    path = folder / f"scene-{index:02}.jpg"
                    command("ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
                            "-i", f"color=c={color}:s=600x1068:r=1",
                            "-frames:v", "1", str(path))
                    pictures.append(path)
                seconds = 12.0 if count == 3 else 14.0
                voice = folder / "synthetic-voice.wav"
                command("ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
                        "-i", f"sine=frequency=240:duration={seconds}",
                        "-ac", "1", "-ar", "24000", str(voice))
                subtitles = folder / "synthetic-caption.srt"
                create_subtitles("Cerita uji orisinal memiliki awal konflik aksi dan akhir penuh harapan", seconds, subtitles)
                mp4 = folder / "smoke.mp4"
                size = encode_motion_movie(pictures, scenes, voice, subtitles, seconds, mp4)
                details = probe_json(mp4)
                assert len([stream for stream in details["streams"] if stream["codec_type"] == "video"]) == 1
                print(f"OFFLINE MEDIA SMOKE PASS: {count} distinct scenes; MP4 H264/AAC; {size} bytes")
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

    print("Eligible narrative-adaptive Shorts:", len(candidates), "(variable scenes + neural narrator)", flush=True)
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
