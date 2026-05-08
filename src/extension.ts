import * as vscode from 'vscode';
import { FileHistoryProvider } from './features/fileHistory/FileHistoryProvider';
import { GitContentProvider } from './features/fileHistory/GitContentProvider';
import { BranchesProvider } from './features/branches/BranchesProvider';
import type { CommitItem } from './features/fileHistory/FileHistoryProvider';
import type { BranchItem } from './features/branches/BranchesProvider';

export function activate(context: vscode.ExtensionContext): void {
  const fileHistory = new FileHistoryProvider();
  const branches = new BranchesProvider();

  // Trigger initial load
  fileHistory.refresh();
  branches.refresh();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('sgit', new GitContentProvider()),

    vscode.window.registerTreeDataProvider('someGitTools.fileHistory', fileHistory),
    vscode.window.registerTreeDataProvider('someGitTools.branches', branches),

    // Refresh file history when the active editor changes
    vscode.window.onDidChangeActiveTextEditor(() => fileHistory.refresh()),

    vscode.commands.registerCommand('someGitTools.refreshFileHistory', () => fileHistory.refresh()),
    vscode.commands.registerCommand('someGitTools.openDiff', (item: CommitItem) => fileHistory.openDiff(item)),

    vscode.commands.registerCommand('someGitTools.refreshBranches', () => branches.refresh()),
    vscode.commands.registerCommand('someGitTools.checkoutBranch', (item: BranchItem) => branches.checkout(item)),
    vscode.commands.registerCommand('someGitTools.deleteLocalBranch', (item: BranchItem) => branches.deleteLocalBranch(item)),
    vscode.commands.registerCommand('someGitTools.deleteRemoteBranch', (item: BranchItem) => branches.deleteRemoteBranch(item)),
  );
}

export function deactivate(): void {}
