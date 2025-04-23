# Windows Config

- [Windows Config](#windows-config)
  - [Requirements](#requirements)
  - [Install](#install)
  - [Modes](#modes)
    - [Brainstorm](#brainstorm)
    - [Plan](#plan)
    - [Build](#build)

## Requirements

- srcwalk — code navigation for AI agents: <https://github.com/sting8k/srcwalk/releases>
- PowerShell 7: <https://github.com/PowerShell/PowerShell/releases>
- Windows Terminal Canary: <https://aka.ms/terminal-canary-installer>
- Chocolatey:

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

## Install

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/ovftank/windows-config/main/install.ps1'))
```

## Modes

### Brainstorm

làm rõ yc, trao đổi, chốt hướng làm.

- Làm rõ scope.
- Đề xuất hướng làm.

### Plan

tạo spec, requirements, task list.

- Chia nhỏ việc.
- Lên plan
- Chuẩn bị cho Build.

### Build

code theo plan đã duyệt.

- Làm từng task.
- Chạy verification sau khi sửa.

hdsd:

```text
Làm rõ yêu cầu      → Brainstorm
Lập plan cho yc     → Plan
Đã có plan rõ       → Build
```
