import * as path from 'node:path';
import * as vscode from 'vscode';
import { GitService, CommitInfo } from '../../git/GitService';

export class CommitItem extends vscode.TreeItem {
  constructor(
    public readonly commit: CommitInfo,
    public readonly absoluteFilePath: string,
    public readonly repoRoot: string,
  ) {
    super(commit.subject, vscode.TreeItemCollapsibleState.None);
    this.description = `${commit.shortHash} · ${commit.author}`;
    this.tooltip = new vscode.MarkdownString(
      `**${commit.subject}**\n\n${commit.hash}\n\n${commit.author} · ${commit.date}`,
    );
    this.command = {
      command: 'someGitTools.openDiff',
      title: 'Open Diff',
      arguments: [this],
    };
    this.contextValue = 'commit';
    this.iconPath = new vscode.ThemeIcon('git-commit');
  }
}

export class FileHistoryProvider implements vscode.TreeDataProvider<CommitItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CommitItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private filePath: string | undefined;
  private repoRoot: string | undefined;
  private targetHash: string | undefined;
  treeView: vscode.TreeView<CommitItem> | undefined;

  refresh(): void {
    const editor = vscode.window.activeTextEditor;
    const ws = vscode.workspace.workspaceFolders?.[0];
    const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;

    if (activeTab?.input instanceof vscode.TabInputText) {
      if (!editor || editor.document.isUntitled || !ws) return;
      this.filePath = editor.document.uri.fsPath;
      this.repoRoot = ws.uri.fsPath;
      this.targetHash = undefined;
      this._onDidChangeTreeData.fire(null);
    } else if (activeTab?.input instanceof vscode.TabInputTextDiff && editor?.document.uri.scheme === 'sgit') {
      try {
        const uri = editor.document.uri;
        const { cwd, ref } = JSON.parse(uri.query) as { cwd: string; ref: string };
        const relPath = uri.path.replace(/^\//, '');
        const absolutePath = path.join(cwd, relPath);
        // ref is either 'hash' (right side) or 'hash^' (left/parent side) — strip ^ to get commit hash
        const hash = ref.replace(/\^$/, '');
        if (this.filePath === absolutePath && this.targetHash === hash) return;
        this.filePath = absolutePath;
        this.repoRoot = cwd;
        this.targetHash = hash;
        this._onDidChangeTreeData.fire(null);
      } catch {
        // ignore malformed URI
      }
    } else {
      this.filePath = undefined;
      this.repoRoot = undefined;
      this.targetHash = undefined;
      this._onDidChangeTreeData.fire(null);
    }
  }

  getTreeItem(element: CommitItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<CommitItem[]> {
    if (!this.filePath || !this.repoRoot) return [];
    try {
      const git = new GitService(this.repoRoot);
      const commits = await git.getFileLog(this.filePath);
      const items = commits.map(c => new CommitItem(c, this.filePath!, this.repoRoot!));
      if (this.targetHash) {
        const target = items.find(item => item.commit.hash === this.targetHash);
        if (target) {
          const treeView = this.treeView;
          setTimeout(() => treeView?.reveal(target, { select: true, focus: false }), 0);
        }
      }
      return items;
    } catch (err) {
      vscode.window.showErrorMessage(`Some Git Tools: ${String(err)}`);
      return [];
    }
  }

  async openDiff(item: CommitItem): Promise<void> {
    const { hash, shortHash, shortParentHash } = item.commit;
    const relPath = path.relative(item.repoRoot, item.absoluteFilePath).replace(/\\/g, '/');
    const cwd = item.repoRoot;
    const filename = path.basename(item.absoluteFilePath);

    const makeUri = (ref: string) =>
      vscode.Uri.from({
        scheme: 'sgit',
        // Leading slash makes the path show nicely in the diff tab title
        path: `/${relPath}`,
        query: JSON.stringify({ cwd, ref }),
      });

    const parentLabel = shortParentHash || '∅';
    const title = `${filename} [${parentLabel} - ${shortHash}]`;

    await vscode.commands.executeCommand(
      'vscode.diff',
      makeUri(`${hash}^`),
      makeUri(hash),
      title,
    );
    this.treeView?.reveal(item, { select: true, focus: false });
  }
}
