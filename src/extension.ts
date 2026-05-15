import * as vscode from 'vscode';
import { FileHistoryProvider } from './features/fileHistory/FileHistoryProvider';
import { GitContentProvider } from './features/fileHistory/GitContentProvider';
import { BranchesProvider, GoneBranchDecorationProvider } from './features/branches/BranchesProvider';
import type { CommitItem } from './features/fileHistory/FileHistoryProvider';
import type { BranchItem } from './features/branches/BranchesProvider';

export function activate(context: vscode.ExtensionContext): void {
  const fileHistory = new FileHistoryProvider();
  const branches = new BranchesProvider();

  // Trigger initial load
  fileHistory.refresh();
  branches.refresh();

  // Auto-refresh branches when HEAD changes (checkout, rebase, etc.)
  const headWatcher = vscode.workspace.createFileSystemWatcher('**/.git/HEAD');

  const fileHistoryView = vscode.window.createTreeView('someGitTools.fileHistory', {
    treeDataProvider: fileHistory,
  });
  fileHistory.treeView = fileHistoryView;

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('sgit', new GitContentProvider()),

    fileHistoryView,
    vscode.window.registerTreeDataProvider('someGitTools.branches', branches),
    vscode.window.registerFileDecorationProvider(new GoneBranchDecorationProvider()),

    // Refresh file history when the active editor changes
    vscode.window.onDidChangeActiveTextEditor(() => fileHistory.refresh()),

    // Refresh branches on HEAD change
    headWatcher,
    headWatcher.onDidChange(() => branches.refresh()),

    vscode.commands.registerCommand('someGitTools.refreshFileHistory', () => fileHistory.refresh()),
    vscode.commands.registerCommand('someGitTools.openDiff', (item: CommitItem) => fileHistory.openDiff(item)),

    vscode.commands.registerCommand('someGitTools.refreshBranches', () => branches.refresh()),
    vscode.commands.registerCommand('someGitTools.checkoutBranch', (item: BranchItem) => branches.checkout(item)),
    vscode.commands.registerCommand('someGitTools.deleteLocalBranch', (item: BranchItem) => branches.deleteLocalBranch(item)),
    vscode.commands.registerCommand('someGitTools.deleteRemoteBranch', (item: BranchItem) => branches.deleteRemoteBranch(item)),
    vscode.commands.registerCommand('someGitTools.pullBranch', (item: BranchItem) => branches.pullBranch(item)),
  );
}

export function deactivate(): void {}
