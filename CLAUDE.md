# Some Git Tools — VSCode Extension

## What this is

VSCode extension providing git utilities as tree views in the activity bar.

**Feature 1 — File History** (`someGitTools.fileHistory` view):
Shows all commits that touched the currently open file. Clicking a commit opens a diff
(before vs after that commit) using a custom `sgit://` URI scheme + `vscode.diff`.

**Feature 2 — Branch Manager** (`someGitTools.branches` view):
Lists all local branches sorted current-first, then gone, then alphabetically.
Branches whose remote tracking ref is gone are highlighted in red (`goneBranchForeground`) with a
`⚠ upstream` description. Branches ahead/behind their upstream are highlighted in yellow
(`unsyncedBranchForeground`) with `↓N ↑N` counts. Context menu: Checkout, Delete Local, Delete Remote.

## Names

- VSCode Marketplace: `Some Git Tools` (publisher: `livwvil`)
- npm: `@livwvil/some-git-tools`
- GitHub: `livwvil/some-git-tools`

## Tech stack

- **Language**: TypeScript (strict mode)
- **Bundler**: esbuild (no webpack)
- **Package manager**: pnpm
- **Runtime deps**: none — uses Node built-ins (`child_process.execFile`) + git CLI
- **VSCode engine**: `^1.90.0`

## Project structure

```
src/
  extension.ts                         # activate() — wires providers, commands, content provider
  git/
    GitService.ts                      # all git CLI calls; takes cwd: string in constructor
  features/
    fileHistory/
      FileHistoryProvider.ts           # TreeDataProvider<CommitItem>; CommitItem triggers openDiff
      GitContentProvider.ts            # TextDocumentContentProvider for sgit:// URIs (git show)
    branches/
      BranchesProvider.ts              # TreeDataProvider<BranchItem>; contextValue drives menus
resources/
  icon.svg                             # activity bar icon
```

## Development workflow

```bash
pnpm install          # first time
pnpm watch            # incremental build (keep running during dev)
# Press F5 in VSCode → launches Extension Development Host
# Ctrl+Shift+P → "Developer: Reload Window" to reload after rebuild
pnpm typecheck        # check types without building
pnpm build            # production bundle (minified)
pnpm package          # produce .vsix for manual install
```

## Key VSCode APIs

| API                                                                       | Used for                                  |
| ------------------------------------------------------------------------- | ----------------------------------------- |
| `vscode.window.registerTreeDataProvider`                                  | file history + branch list                |
| `vscode.workspace.registerTextDocumentContentProvider('sgit', ...)`       | serve file content at a commit            |
| `vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title)` | open diff editor                          |
| `vscode.window.onDidChangeActiveTextEditor`                               | refresh file history when switching files |

## Git commands used

| Command                                                                                                                       | Purpose                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `git log --follow --format=%H\x1f%h\x1f%p\x1f%s\x1f%an\x1f%ai\x1e -- <file>`                                                  | file commit history                          |
| `git for-each-ref --format=%(HEAD)\t%(refname:short)\t%(upstream:short)\t%(upstream:track)\t%(committerdate:unix) refs/heads` | branch list with gone + ahead/behind + dates |
| `git show <hash>:<relative-path>`                                                                                             | file content at a commit (for diff)          |
| `git checkout <branch>`                                                                                                       | checkout branch                              |
| `git branch -d/-D <branch>`                                                                                                   | delete local branch                          |
| `git push <remote> --delete <branch>`                                                                                         | delete remote branch                         |

## sgit:// URI scheme

Used to show file content at a specific git ref in the diff editor.

- Scheme: `sgit`
- Path: `/<repo-relative-file-path>` (leading slash required, for display in diff title)
- Query: JSON `{ cwd: string, ref: string }` where `ref` is a git ref like `abc1234` or `abc1234^`
- Empty string returned when ref doesn't exist (e.g. parent of first commit)

## Tree item contextValue conventions (BranchesProvider)

contextValue is a space-joined set of capability tokens. Menus use `viewItem =~ /token/`.

- `checkout` → branch is not current (can be checked out)
- `delete-local` → can delete local branch
- `delete-remote` → has a remote tracking branch to delete

Examples:

- Current branch, no upstream: *(no tokens)*
- Current branch, with upstream: `delete-remote`
- Non-current with upstream: `checkout delete-local delete-remote`
- Gone branch: `checkout delete-local gone`
