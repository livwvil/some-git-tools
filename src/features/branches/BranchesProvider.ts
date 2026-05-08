import * as vscode from 'vscode';
import { GitService, BranchInfo } from '../../git/GitService';

const GONE_SCHEME = 'sgit-branch-gone';

export class GoneBranchDecorationProvider implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme === GONE_SCHEME) {
      return { color: new vscode.ThemeColor('someGitTools.goneBranchForeground') };
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
    this.contextValue = tokens.join(' ');

    if (branch.isCurrent) {
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
    } else if (branch.isGone) {
      this.iconPath = new vscode.ThemeIcon('git-branch');
      this.resourceUri = vscode.Uri.from({ scheme: GONE_SCHEME, path: '/' + branch.name });
    } else {
      this.iconPath = new vscode.ThemeIcon('git-branch');
    }

    if (branch.isGone) {
      this.description = `${branch.upstream ?? ''} (gone)`;
    } else if (branch.upstream) {
      this.description = branch.upstream;
    }

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
      return branches.map(b => new BranchItem(b));
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
