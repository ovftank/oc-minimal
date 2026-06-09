---
name: srcwalk
compatible_srcwalk: '>=0.3.0'
description: "Srcwalk is the agent's code navigator: one tree-sitter CLI for repo maps, token-aware large-file reads, symbol search, callers/callees, deps, impact checks, and precise drill-ins. Use it before raw reads or grep for code-structure work. Run `srcwalk guide` first. Must use! It is the installed binary's source of truth."
---

# srcwalk — bootstrap entry

Default to srcwalk for code navigation, large-file reading, repo maps, symbols, callers/callees, deps, and impact checks. Use raw reads or broad grep first only for pure text/path matching.

Do not require `srcwalk` to be added to `PATH`. `install.ps1` copies this skill to `%USERPROFILE%\.config\opencode\skills\srcwalk`; in OpenCode's bash shell, use the equivalent `$HOME` path:

```bash
"$HOME/.config/opencode/skills/srcwalk/srcwalk.exe" <args>
```

When working inside this repo before install, use:

```bash
./opencode/skills/srcwalk/srcwalk.exe <args>
```

Before non-trivial use, you must run:

```bash
"$HOME/.config/opencode/skills/srcwalk/srcwalk.exe" guide
```

Do not pipe, truncate, summarize, or sample `srcwalk guide`; later sections contain important routing rules and caveats.

Use root/command help only for flags:

```bash
"$HOME/.config/opencode/skills/srcwalk/srcwalk.exe" --help
"$HOME/.config/opencode/skills/srcwalk/srcwalk.exe" <command> --help
```
