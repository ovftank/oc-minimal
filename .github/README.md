# oc-minimal

- [oc-minimal](#oc-minimal)
  - [requirements](#requirements)
  - [install](#install)
  - [mode](#mode)

## requirements

- powershell 7: <https://github.com/PowerShell/PowerShell/releases>
- windows terminal canary: <https://aka.ms/terminal-canary-installer>
- chocolatey:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

- ripgrep:

```powershell
choco install ripgrep -y
```

- git:

```powershell
$gitUninstaller = "C:\Program Files\Git\unins000.exe"
if (Test-Path $gitUninstaller) {
    Start-Process -FilePath $gitUninstaller -ArgumentList "/SILENT" -Wait -ErrorAction SilentlyContinue
}
choco install git.install --params "'/GitAndUnixToolsOnPath /NoShellIntegration /NoGuiHereIntegration'" -y --force
```

- eza:

```powershell
choco install eza -y
```

## install

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/ovftank/oc-minimal/main/install.ps1'))
```

## mode

- `ask`: khầy mode, hỏi gì đáp nấy.
- `clarify`: làm rõ yc.
- `plan`: vẽ plan để implement.
- `build`: như cái tên, `build` thôi =)))
