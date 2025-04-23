from __future__ import annotations

import pathlib
import shutil
import tempfile
import urllib.request
import zipfile

URL = "https://github.com/dnSpyEx/dnSpy/releases/download/v6.5.1/dnSpy-net-win64.zip"


def get_paths() -> tuple[pathlib.Path, pathlib.Path, pathlib.Path, pathlib.Path]:
    base = pathlib.Path(tempfile.gettempdir()) / "opencode"
    zip_path = base / "dnSpy-net-win64.zip"
    stage = base / "_dnspy_stage"
    extract_dir = base / "dnSpy-net-win64"
    return base, zip_path, stage, extract_dir


def ensure_dnspy() -> pathlib.Path:
    base, zip_path, stage, extract_dir = get_paths()
    exe = extract_dir / "dnSpy.exe"
    console = extract_dir / "dnSpy.Console.exe"

    if exe.exists() and console.exists():
        return extract_dir

    base.mkdir(parents=True, exist_ok=True)
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True, exist_ok=True)

    with urllib.request.urlopen(URL, timeout=180) as response:
        zip_path.write_bytes(response.read())

    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            target = (stage / member.filename).resolve()
            if not target.is_relative_to(stage.resolve()):
                raise RuntimeError(f"unsafe zip member: {member.filename}")
        archive.extractall(stage)

    if extract_dir.exists():
        shutil.rmtree(extract_dir)
    extract_dir.mkdir(parents=True, exist_ok=True)

    for item in stage.iterdir():
        shutil.move(str(item), str(extract_dir / item.name))

    shutil.rmtree(stage)

    if not exe.exists() or not console.exists():
        raise RuntimeError("dnSpy extraction failed")

    return extract_dir


def main() -> None:
    _, _, _, extract_dir = get_paths()
    exe = extract_dir / "dnSpy.exe"
    console = extract_dir / "dnSpy.Console.exe"

    if exe.exists() and console.exists():
        print(f"dnSpy already present: {extract_dir}")
        return

    print(f"dnSpy installed: {ensure_dnspy()}")


if __name__ == "__main__":
    main()
