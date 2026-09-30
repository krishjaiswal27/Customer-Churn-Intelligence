"""Local preview server for the site.

Run from the repository root:
    python scripts/serve.py            # http://localhost:8000/docs/
    python scripts/serve.py 8080       # another port

Use this instead of `python -m http.server`, which has two problems here:
  * It ignores HTTP Range requests, so browsers cannot seek in the demo video
    (the player only plays from the start). This server answers them with
    206 Partial Content, as GitHub Pages does.
  * It lets the browser cache CSS/JS heuristically, so edits can look like they
    did nothing. This server sends Cache-Control: no-store.

The repository root is served, so the site loads from the /docs/ sub-path, the
same shape as the GitHub Pages URL.
"""

from __future__ import annotations

import os
import re
import sys
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RANGE = re.compile(r"bytes=(\d*)-(\d*)$")


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mp4": "video/mp4",
        ".webp": "image/webp",
        ".js": "text/javascript",
        ".json": "application/json",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        match = RANGE.match(self.headers.get("Range", "").strip())
        path = self.translate_path(self.path)
        if not match or not os.path.isfile(path):
            return super().send_head()

        size = os.path.getsize(path)
        first, last = match.groups()
        if first:
            start = int(first)
            end = min(int(last), size - 1) if last else size - 1
        elif last:  # "bytes=-N": the final N bytes
            start, end = max(size - int(last), 0), size - 1
        else:
            return super().send_head()

        if start >= size or start > end:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None

        f = open(path, "rb")
        f.seek(start)
        self._remaining = end - start + 1
        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(self._remaining))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile) -> None:
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        try:
            while remaining > 0:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser cancelled the request, e.g. while seeking
        finally:
            self._remaining = None


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    print(f"Serving {ROOT} at http://localhost:{port}/docs/  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
