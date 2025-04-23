---
name: dnspy
description: Use dnSpy.Console.exe to decompile and inspect .NET assemblies. Use this skill whenever the user asks to analyze DLLs, EXEs, folders of .NET binaries, specific types, metadata tokens, GAC assemblies, C# output, IL output, dependencies, resources, or project-style decompilation with dnSpy/dnSpy.Console. Prefer this skill for .NET reverse engineering and assembly understanding rather than generic file search.
---

## What this skill does

Use this skill to turn .NET assemblies into inspectable C#/IL output with `dnSpy.Console.exe`, then analyze the generated source or focused stdout to answer the user's actual question.

Focus on:

- locating the target assembly quickly and correctly
- choosing focused type/member extraction when possible
- decompiling full projects only when broader architecture is needed
- resolving dependencies with `--asm-path` or GAC options when output is incomplete
- reading the generated C#/IL with evidence instead of dumping file lists
- explaining behavior, architecture, data flow, suspicious logic, or relevant APIs

## When to use it

Use this skill when the user:

- provides or mentions a `.dll` or `.exe` that is likely a .NET assembly
- asks to decompile, inspect, reverse engineer, understand, or analyze .NET binaries
- asks for a type, method, metadata token, RVA/token-backed member, or GAC assembly
- wants C#, Visual Basic, IL, or IL-with-C# output from dnSpy
- asks what a DLL does, what classes it contains, or where specific logic lives
- asks for dependency-aware decompilation or project-style source output

## Workflow

1. Resolve the target path before running dnSpy.
2. Pick the narrowest useful dnSpy mode: type/member stdout for focused questions, full `-o` output for broad analysis.
3. Run the bundled wrapper with normal `dnSpy.Console.exe` args.
4. Inspect generated source with targeted search/read operations.
5. Summarize the decompilation result and the next files/symbols to inspect.
6. If output has missing references or invalid options, retry with corrected args instead of stopping at the first failure.

## Tooling discipline

- Follow the repo's `AGENTS.md`: use `uvx`, `uv run`, or `uv tool run` for Python-driven commands; do not call `python`, `python3`, or `py` directly.
- Use `rg` first for file discovery and content search instead of `find`, `grep`, `cat`, or broad shell listing.
- List candidate files with `rg --files <static-dir>` and filter from there.
- Search content with `rg -n "pattern" <static-dir>` after decompilation.
- Read generated source with `rg -n --passthru "^" <file>` when using command-line reads.
- Prefer the current working directory and known output directory over broad profile/root scans.
- Do not scan `/`, `C:\`, or the whole user profile unless the user explicitly asks; it wastes time and produces permission errors.
- Use the dedicated file tools when they are more direct, but apply the same path discipline: narrow directory first, then focused search, then read only relevant files.

## Target resolution discipline

- If the user gives a bare filename like `xnet.dll`, search the current working directory first.
- Treat Windows filenames case-insensitively: `xnet.dll` can match `xNet.dll`.
- If not found in the current directory, then search obvious local folders the user is likely referring to, such as the active workspace, `Downloads`, `Desktop`, and `Documents`.
- Do not start with root-level scans like `/` or `C:\`; they are slow, noisy, and often hit permission-denied folders.
- If multiple matches exist, choose the closest/current-workspace match first and mention the chosen path.
- If no match is found after reasonable local searches, ask for the full path.

Example target lookup flow:

```bash
rg --files . | rg -i "(^|[\\/])xnet\.dll$"
rg --files "C:/Users/ovftank/Downloads" | rg -i "(^|[\\/])xnet\.dll$"
rg --files "C:/Users/ovftank/Desktop" | rg -i "(^|[\\/])xnet\.dll$"
```

## Run dnSpy.Console

Use the bundled wrapper and pass normal `dnSpy.Console.exe` arguments after the script path. The wrapper handles local availability automatically.

Use the skill base directory reported when this skill is loaded; relative paths like `scripts/dnspy_console.py` are relative to that base directory.

```powershell
uvx python "<skill-base>\scripts\dnspy_console.py" [dnSpy.Console args]
```

## Decompilation strategy

- For a broad first pass on an unknown assembly, decompile to a fresh temp output directory with `-o`, `--no-sln`, and often `--no-resources`.
- For a known class or namespace, prefer `-t TypeName` or `--type TypeName` to get focused stdout.
- For a known metadata token, use `--md TOKEN` plus the target assembly to avoid searching the whole project.
- For low-level behavior, use `-l IL` or `-l "IL with C#"` rather than default C#.
- For obfuscation, compiler-generated code, async state machines, lambdas, or closures, add `--show-all`.
- For ambiguous symbols, add `--full-names`; for stable comparisons, add `--sort-members`.
- For missing references, retry with one or more `--asm-path` values pointing at dependency folders.
- For framework/GAC types, use `--gac-file` with the full assembly name when version matters.
- For large folders, add `--threads N` to keep CPU usage controlled.

## Common commands

```powershell
uvx python "<skill-base>\scripts\dnspy_console.py" -o "C:\out\path" --no-sln --no-resources "C:\some\file.dll"
uvx python "<skill-base>\scripts\dnspy_console.py" -o "C:\out\path" -r "C:\some\folder"
uvx python "<skill-base>\scripts\dnspy_console.py" -t Namespace.Type "C:\some\file.dll"
uvx python "<skill-base>\scripts\dnspy_console.py" --md 0x06000123 "C:\some\file.dll"
uvx python "<skill-base>\scripts\dnspy_console.py" -l IL -t Namespace.Type "C:\some\file.dll"
uvx python "<skill-base>\scripts\dnspy_console.py" --asm-path "C:\deps" -o "C:\out\path" "C:\some\file.dll"
uvx python "<skill-base>\scripts\dnspy_console.py" --gac-file "mscorlib, Version=4.0.0.0" -t System.Int32
```

## Useful args

- `-o outdir`: output directory
- `-r`: recursive search for .NET files
- `-t name` or `--type name`: decompile a type to stdout
- `--md N`: decompile a member by metadata token to stdout
- `--gac-file assembly`: decompile an assembly from the GAC
- `-l lang`: language, default is C#; supports `C#`, `Visual Basic`, `IL`, `IL with C#`
- `--asm-path path`: assembly search path, repeatable or semicolon-separated
- `--user-gac path`: user/private GAC path, repeatable or semicolon-separated
- `--no-gac`: do not use the GAC for assembly lookup
- `--no-stdlib`: projects do not reference `mscorlib`
- `--no-sln`: do not create a `.sln` file
- `--sln-name name`: custom solution name
- `--threads N`: worker thread count
- `--no-resources`: do not unpack resources
- `--no-resx`: do not create `.resx` files
- `--no-baml`: do not decompile BAML to XAML
- `--no-color`: disable colored stdout
- `--spaces N`: tab size in spaces, or `0` for tabs
- `--vs N`: Visual Studio version, 2005 through 2017

## After decompilation

- List the output directory to identify generated project folders and high-value source files.
- Start with project files, namespaces, top-level classes, and names that match the user's question.
- Use focused searches over generated `.cs`, `.vb`, or `.il` files for APIs, strings, network calls, cryptography, serialization, reflection, P/Invoke, process/file/registry access, and suspicious control flow.
- Prefer reading relevant source files over reporting every generated file.
- If the user asked a behavioral question, trace the code path from public entry points to private helpers and external side effects.
- If the assembly appears obfuscated, look for short/generated names, string decoding helpers, reflection, dynamic invocation, and compiler-generated types.

Example post-decompile search flow:

```bash
rg --files "C:/Users/ovftank/AppData/Local/Temp/opencode/<target>_decompiled"
rg -n "HttpClient|Socket|WebRequest|Dns|Ssl|Proxy" "C:/Users/ovftank/AppData/Local/Temp/opencode/<target>_decompiled"
rg -n "Assembly\.Load|Activator\.CreateInstance|Invoke\(|DllImport|Process\.Start" "C:/Users/ovftank/AppData/Local/Temp/opencode/<target>_decompiled"
rg -n --passthru "^" "C:/path/to/relevant/File.cs"
```

## Analysis checklist

Look for these patterns when relevant:

- public API surface: classes, constructors, methods, properties, events
- network behavior: HTTP clients, sockets, proxy classes, DNS, TLS/cert handling
- persistence and side effects: filesystem, registry, process launch, services, scheduled tasks
- dynamic behavior: reflection, `Assembly.Load`, `Activator.CreateInstance`, delegates, expression trees
- crypto/encoding: hashes, encryption, compression, base64, custom string transforms
- interop: P/Invoke, COM, native DLL imports, platform-specific helpers
- threading/runtime: async state machines, timers, threads, tasks, cancellation, synchronization
- resources: embedded config, strings, `.resources`, BAML/XAML, localized data

## Output template

Use this format unless the user asks for something else:

```markdown
# dnSpy Analysis

## Target

## Decompilation

## Key files or symbols

## Findings

## Next steps
```

## Working style

- Prioritize the user's actual question over exhaustive decompilation notes.
- Keep binary inputs unchanged and write outputs to temp or a user-approved folder.
- Quote paths in commands and report the exact command when useful.
- Mention when dnSpy output is partial due to missing references, obfuscation, native code, or unsupported metadata.
- If `dnSpy.Console.exe` prints usage with an error such as `Invalid option`, correct the arguments and retry.
