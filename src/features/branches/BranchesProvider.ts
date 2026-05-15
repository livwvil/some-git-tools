import * as vscode from 'vscode';
import { GitService, BranchInfo } from '../../git/GitService';

const GONE_SCHEME = 'sgit-branch-gone';
const UNSYNCED_SCHEME = 'sgit-branch-unsynced';

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  const rtf = new Intl.RelativeTimeFormat(vscode.env.language, { style: 'long', numeric: 'always' });

  if (seconds < 60) return rtf.format(-seconds, 'second');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return rtf.format(-days, 'day');
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, 'month');
  return rtf.format(-Math.floor(days / 365), 'year');
}

function buildDescription(branch: BranchInfo): string {
  const groups: string[] = [];

  if (!branch.isGone && (branch.numBehind > 0 || branch.numAhead > 0)) {
    groups.push(`↓${branch.numBehind} ↑${branch.numAhead}`);
  }

  if (branch.upstream) {
    groups.push(`${branch.isGone ? '⚠' : '⇄'} ${branch.upstream}`);
  }

  if (branch.lastCommitTimestamp > 0) {
    groups.push(timeAgo(branch.lastCommitTimestamp));
  }

  return groups.join('  ');
}

export class GoneBranchDecorationProvider implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme === GONE_SCHEME) {
      return { color: new vscode.ThemeColor('someGitTools.goneBranchForeground') };
    }
    if (uri.scheme === UNSYNCED_SCHEME) {
      return { color: new vscode.ThemeColor('someGitTools.unsyncedBranchForeground') };
    }
  }
}

export class BranchItem extends vscode.TreeItem {
  constructor(public readonly branch: BranchInfo) {
    super(branch.name, vscode.TreeItemCollapsibleState.None);

    const tokens: string[] = [];
    if (!branch.isCurrent) tokens.push('checkout');
    tokens.push('delete-local');
    if (branch.upstream) tokens.push('delete-remote');
    if (branch.isGone) tokens.push('gone');
    if (!branch.isGone && branch.numBehind > 0) tokens.push('pull');
    this.contextValue = tokens.join(' ');

    this.iconPath = new vscode.ThemeIcon('git-branch');

    const isUnsynced = branch.numAhead > 0 || branch.numBehind > 0;

    if (branch.isGone) {
      this.resourceUri = vscode.Uri.from({ scheme: GONE_SCHEME, path: '/' + branch.name });
    } else if (isUnsynced) {
      this.resourceUri = vscode.Uri.from({ scheme: UNSYNCED_SCHEME, path: '/' + branch.name });
    }

    this.description = buildDescription(branch);

    this.tooltip = branch.upstream
      ? `${branch.name} → ${branch.upstream}${branch.isGone ? ' [gone]' : ''}`
      : branch.name;
  }
}

export class BranchesProvider implements vscode.TreeDataProvider<BranchItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<BranchItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private repoRoot: string | undefined;

  refresh(): void {
    this.repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: BranchItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<BranchItem[]> {
    if (!this.repoRoot) return [];
    try {
      const git = new GitService(this.repoRoot);
      const branches = await git.getLocalBranches();
      // current branch first, then gone branches, then the rest alphabetically
      branches.sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        if (a.isGone !== b.isGone) return a.isGone ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return branches.map((b) => new BranchItem(b));
    } catch (err) {
      vscode.window.showErrorMessage(`Some Git Tools: ${String(err)}`);
      return [];
    }
  }

  async checkout(item: BranchItem): Promise<void> {
    if (!this.repoRoot) return;
    const git = new GitService(this.repoRoot);
    try {
      await git.checkout(item.branch.name);
      this.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`Checkout failed: ${String(err)}`);
    }
  }

  async deleteLocalBranch(item: BranchItem): Promise<void> {
    if (!this.repoRoot) return;
    const answer = await vscode.window.showWarningMessage(
      `Delete local branch "${item.branch.name}"?`,
      { modal: true },
      'Delete',
      'Force Delete',
    );
    if (!answer) return;
    const git = new GitService(this.repoRoot);
    try {
      await git.deleteLocalBranch(item.branch.name, answer === 'Force Delete');
      this.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`Delete failed: ${String(err)}`);
    }
  }

  async pullBranch(item: BranchItem): Promise<void> {
    if (!this.repoRoot) return;
    const git = new GitService(this.repoRoot);
    try {
      await git.pull(item.branch);
      this.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`Pull failed: ${String(err)}`);
    }
  }

  async deleteRemoteBranch(item: BranchItem): Promise<void> {
    if (!this.repoRoot || !item.branch.upstream) return;
    const answer = await vscode.window.showWarningMessage(
      `Delete remote branch "${item.branch.upstream}"?`,
      { modal: true },
      'Delete',
    );
    if (!answer) return;
    const git = new GitService(this.repoRoot);
    try {
      await git.deleteRemoteBranch(item.branch.upstream);
      this.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`Remote delete failed: ${String(err)}`);
    }
  }
}
