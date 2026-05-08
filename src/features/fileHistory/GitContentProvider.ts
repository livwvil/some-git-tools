import * as vscode from 'vscode';
import { GitService } from '../../git/GitService';

export interface SgitQuery {
  cwd: string;
  ref: string;
}

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const { cwd, ref } = JSON.parse(uri.query) as SgitQuery;
    // uri.path has a leading "/" we added for display; strip it
    const repoRelativePath = uri.path.replace(/^\//, '').replace(/\\/g, '/');
    const git = new GitService(cwd);
    return git.getFileContentAtRef(ref, repoRelativePath);
  }
}
