from __future__ import annotations

import subprocess
import sys

from install_dnspy import ensure_dnspy


def main() -> int:
    install_dir = ensure_dnspy()
    console = install_dir / "dnSpy.Console.exe"

    if not console.exists():
        raise RuntimeError(f"dnSpy.Console.exe not found: {console}")

    result = subprocess.run([str(console), *sys.argv[1:]], check=False, cwd=install_dir)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
