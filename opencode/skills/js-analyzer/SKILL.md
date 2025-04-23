---
name: js-analyzer
description: Analyze JavaScript to understand complex game logic, data flow, architecture, and client runtime behavior. Use this skill when the user needs to comprehend large or tricky JS/TS codebases, trace specific game logic such as input handling, camera/aim, hit detection, state sync, packet formats, or deobfuscate packed or anti-debug JavaScript to recover the real flow. Prefer this skill for deep architectural understanding and gameplay logic tracing rather than syntax checking.
---

## What this skill does

Use this skill to turn complex or unfamiliar JavaScript/TypeScript into a clear explanation of the underlying game logic, data flow, obfuscation patterns, and runtime hooks.

Focus on:

- recovering the real logic, state management, and data flow from the code
- recovering the real logic behind obfuscation, wrapper layers, and runtime patching
- tracing data from user inputs (sources) to execution points (sinks)
- identifying behavior-changing indirection such as string arrays, lookup tables, and packet rewriting before `send()`
- recovering game/client logic like movement, aiming, recoil, hit registration, camera transforms, entity state, and network replication
- understanding the architecture, design patterns, and interaction between different modules or components
- searching for specific logic flows or business rules within a larger codebase

## When to use it

Use this skill when the user:

- asks to explain complex logic, state management, or component interactions in a JS/TS application
- needs to search for specific behaviors, API usages, or data transformations across files
- traces how a specific piece of data is handled from input to output
- needs to understand obfuscated, packed, minified, or anti-debug JavaScript and recover the real runtime flow
- is looking at scripts that hook network requests, WebSocket payloads, WebAssembly, or game/client state before send
- wants to understand how a game client handles input, player state, shooting, collision, sync, or prediction across code paths

## Workflow

1. Classify the scope: single function, single module, or cross-file interaction.
2. Identify the entry points, then trace inputs, transforms, decisions, and outputs.
3. If searching for logic, use search tools (`rg`, `sg`) to map out where relevant data structures or APIs are used. Prefer `rg` for text search and `rg --files` for file discovery because they are much faster than alternatives like `grep` or shell-based file listing.
4. Track data flow before naming variables or summarizing.
5. Explain the code in plain language, detailing the architecture and data flow.
6. If the codebase is large, summarize the top-level architecture before drilling into details.

## Tooling discipline

- Follow the repo's `AGENTS.md`: use `pnpm`/`pnpx` for Node tooling and `uv run`/`uv tool run` for Python tooling.
- Use `rg` first for discovery instead of `ls`, `find`, `grep`, `cat`, or broad shell scans.
- List candidate files with `rg --files <static-dir>` before opening or scanning many files.
- Read files with `rg -n --passthru "^" <file>` when a command-line read is needed.
- Search content with `rg -n "pattern" <static-dir>` and include a static directory prefix.
- Prefer two focused searches over one broad search: first find anchors, then trace definitions, mutations, and call sites.
- Avoid root scans like `rg --files /` or `rg -n "x" C:\`; start from the current workspace or the user's provided directory.
- If a user gives a bare filename, check the current working directory and project/workspace directories before searching user profile folders.
- Use the dedicated file tools when they are more direct, but keep the same discipline: narrow path first, then focused content search, then read only relevant context.

## Tool-assisted workflow

Use tools by default when the codebase or snippet is non-trivial:

1. Start with `rg` to find the obvious anchors: API endpoints, state mutations, runtime hooks, obfuscation helpers, packet builders, and `send()`. For game logic, also anchor on `input`, `mouse`, `keyboard`, `camera`, `yaw`, `pitch`, `aim`, `shoot`, `recoil`, `hit`, `collision`, `entity`, `packet`, `ws`, and `sync`.
2. Read the surrounding lines to understand the context of the hit.
3. Run a second `rg` pass to trace the origin of variables used in key operations. Find where the data is produced and where it is consumed.
4. Use `sg` (`ast-grep`) when the question depends on syntax shape rather than raw text, such as finding all calls to a specific method with certain arguments.
5. If the code is obfuscated or packed, first identify the resolver, the table, the sink, and any runtime patch points before naming symbols.
6. If the source is too noisy to reason about directly, inspect the deobfuscation tool first with `pnpx webcrack --help`, then run `pnpx webcrack <input.js> -o <out-dir>` and continue analysis from the generated readable output.
7. After gathering tool outputs, synthesize the findings to explain the behavior from a data flow perspective.

## Ripgrep discipline

- Treat every `rg` hit as a lead to trace, not a definitive conclusion.
- When tracing data, search for both the definition and all mutation points.
- Read a sufficient context window around each relevant hit before deciding its role in the logic.
- Prefer tracing the complete path from input to output over isolated keyword matches.
- When analyzing obfuscated code, search separately for the string resolver, the data table, the runtime hook, and the consumer of the decoded value.
- Avoid root-level glob patterns without a static prefix (e.g., `*.js` or `**/*.ts`). The environment intercepts `rg` calls and splits the path at the first glob character (`*`, `?`, `[`, `]`) to determine the search root. If the pattern lacks a static directory prefix, the scan is intentionally skipped. Always specify a static directory path (e.g., `rg "pattern" src/` or `rg --files src/`).
- For filename discovery, prefer `rg --files <dir> | rg -i "filename-or-extension"` over recursive shell listing.
- For code anchors, use alternation to batch related terms, e.g. `rg -n "send\(|WebSocket|packet|msgpack" src/`.

Example search flow:

```bash
rg -n "updatePlayer|shoot|hitTest" src/
sg run -p '$OBJ.position.x = $VAL' src/
rg --files src/
rg -n "WebAssembly\.instantiate|send\(|packet|msgpack|atob|decodeURIComponent" src/
pnpx webcrack --help
pnpx webcrack input.js -o out
```

## Webcrack workflow

- Use `pnpx webcrack --help` before the first run when flags or output shape are unclear.
- Run webcrack only when the raw source is packed, heavily minified, uses string-array indirection, or is too noisy for direct tracing.
- Prefer `pnpx webcrack <input.js> -o <out-dir>` for a full cleanup pass; use flags such as `--no-unpack`, `--no-deobfuscate`, or `--no-unminify` only when the user asks for a specific stage or full deobfuscation breaks the output.
- Re-read the generated output with `rg` and focused file reads. Do not treat webcrack output as final truth; use it to expose the logic, then verify packet builders, input handlers, and runtime hooks manually.

## Analysis checklist

Look for these patterns in order:

- complex state mutations and component lifecycles
- obfuscation patterns such as string arrays, index shuffling, decoder wrappers, anti-debug checks, and runtime patching
- network payload mutation, including WebSocket packet rewriting and client-side protocol tampering
- WebAssembly hooks, dynamic evaluation, and payload assembly from fragments
- game client primitives: input → camera → aim → projectile/hit detection → state sync

## How to explain the result

Always answer in a structure that helps the user understand the architecture:

1. `Quick read` - one or two sentences on the script's core purpose, obfuscation level, and architecture.
2. `Logic map` - high-level overview of how data flows through the components.
3. `Recovered flow` - the important steps in order, detailing data transformations and runtime hooks.
4. `Plain-English summary` - one short wrap-up that states the behavior plainly.

When useful, include a tiny pseudo-code rewrite or data-flow diagram to clarify complex interactions.

## Working style

- Prefer clarity over exhaustive line-by-line dumping.
- Focus on the _why_ and _how_ of the logic rather than just translating syntax to English.
- Keep the explanation grounded in evidence from the code.
- If the flow spans multiple files, explicitly mention the hand-offs between files/modules.
- If the code is obfuscated, say what is known versus inferred, and call out runtime hooks separately from normal application logic.
- If the user asks about game logic, prioritize the exact runtime path they care about: input source, state mutation, packet build, and server-facing side effects.

## Output template

Use this format unless the user asks for something else:

```markdown
# JS Game Logic Analysis

## Quick read

## Logic map

## Recovered flow

## Plain-English summary
```

## Good defaults

- Collapse repetitive boilerplate so the core business logic stands out.
- Prefer tool-backed evidence for data flows (showing the path) over pure eyeballing.

## What not to do

- Do not just restate the code line-by-line.
- Do not focus on syntax style (linting) when the user needs architectural analysis.
