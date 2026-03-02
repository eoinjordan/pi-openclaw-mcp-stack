"""Module entrypoint wrapper for `python -m agentic_mcp.server`."""

from pathlib import Path
import sys

# Reuse the existing top-level server implementation.
_root = Path(__file__).resolve().parents[1]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from server import main  # noqa: E402


if __name__ == "__main__":
    main()
