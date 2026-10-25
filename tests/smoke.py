#!/usr/bin/env python3
"""Non-mutating HTTP smoke verification against isolated Ceritexa Worker.

Only runs on manual GitHub Actions dispatch. Does not publish anything or alter
data, tokens, Cloudflare bindings, or unrelated Workers.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get(
    "CERITEXA_WORKER_URL",
    "https://ceritexa-content-agent.finchat-ai-gateway.workers.dev",
).rstrip("/")
TOKEN = os.environ.get("CERITEXA_ADMIN_TOKEN", "")


def get(path, token=None):
    headers = {"Accept": "application/json", "User-Agent": "Ceritexa-smoke/1.0"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            return response.status, json.loads(response.read(250_000))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read(250_000))


def main():
    if len(TOKEN) < 24:
        print("FAILED: GitHub Actions CERITEXA_ADMIN_TOKEN secret missing or invalid length.")
        return 2
    checks = []

    code, health = get("/api/health")
    checks.append(("public_health", code == 200 and health.get("ok") is True
                   and health.get("service") == "ceritexa-content-agent"))

    code, _ = get("/api/status")
    checks.append(("reject_anonymous_admin", code == 401))

    code, _ = get("/api/readiness")
    checks.append(("reject_anonymous_readiness", code == 401))

    code, status = get("/api/status", TOKEN)
    checks.append(("accept_admin", code == 200 and "channels" in status))
    checks.append(("public_posting_off", status.get("publicationEnabled") is False))

    code, ready = get("/api/readiness", TOKEN)
    checks.append(("readiness_api", code == 200 and ready.get("reviewRequired") is True))
    ids = {x.get("id"): x for x in ready.get("checks", [])}
    for name in ("database", "media", "ai", "admin"):
        checks.append((f"{name}_binding", ids.get(name, {}).get("ready") is True))

    code, posts = get("/api/posts", TOKEN)
    checks.append(("post_list", code == 200 and isinstance(posts.get("posts"), list)))

    for name, passed in checks:
        print(("PASS" if passed else "FAIL") + " - " + name)
    failures = [name for name, ok in checks if not ok]
    print(f"Summary: {len(checks) - len(failures)}/{len(checks)} checks passed.")
    if failures:
        print("FAILED checks:", ", ".join(failures))
        return 1
    print("HTTP smoke tests passed. Provider posting and video rendering are NOT covered.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("FAILED: Network or server error: " + type(exc).__name__ + ": " + str(exc)[:180])
        sys.exit(1)
