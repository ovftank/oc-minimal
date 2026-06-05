# oc-minimal

- [oc-minimal](#oc-minimal)
  - [requirements](#requirements)
  - [install](#install)
  - [mode](#mode)

## requirements

- srcwalk: <https://github.com/sting8k/srcwalk/releases>
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

