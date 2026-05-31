import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommitInfo {
  hash: string;
  shortHash: string;
  shortParentHash: string;
  subject: string;
  author: string;
  date: string;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream?: string;
  isGone: boolean;
  numAhead: number;
  numBehind: number;
  lastCommitTimestamp: number;
}

export class GitService {
  constructor(private readonly cwd: string) {}

  private async run(...args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, { cwd: this.cwd });
      return stdout.trimEnd();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? ((err as NodeJS.ErrnoException & { stderr?: string }).stderr ?? err.message)
          : String(err);
      throw new Error(msg);
    }
  }

  async getFileLog(filePath: string): Promise<CommitInfo[]> {
    const SEP = '\x1f';
    const RS = '\x1e';
    const out = await this.run(
      'log',
      '--follow',
      `--format=%H${SEP}%h${SEP}%p${SEP}%s${SEP}%an${SEP}%ai${RS}`,
      '--',
      filePath,
    );
    if (!out) return [];
    return out.split(RS).flatMap((record) => {
      const trimmed = record.trim();
      if (!trimmed) return [];
      const [hash, shortHash, parentHashes, subject, author, date] = trimmed.split(SEP);
      // %p gives space-separated abbreviated parent hashes; take the first one
      const shortParentHash = parentHashes?.split(' ')[0] ?? '';
      return [{ hash, shortHash, shortParentHash, subject, author, date }];
    });
  }

  async getLocalBranches(): Promise<BranchInfo[]> {
    const TAB = '\t';
    const out = await this.run(
      'for-each-ref',
      `--format=%(HEAD)${TAB}%(refname:short)${TAB}%(upstream:short)${TAB}%(upstream:track)${TAB}%(committerdate:unix)`,
      'refs/heads',
    );
    if (!out) return [];
    return out.split('\n').flatMap((line) => {
      if (!line) return [];
      const [head, name, upstream, track, timestamp] = line.split(TAB);
      const aheadMatch = /ahead (\d+)/.exec(track ?? '');
      const behindMatch = /behind (\d+)/.exec(track ?? '');
      return [
        {
          name,
          isCurrent: head === '*',
          upstream: upstream || undefined,
          isGone: track?.includes('[gone]') ?? false,
          numAhead: aheadMatch ? parseInt(aheadMatch[1], 10) : 0,
          numBehind: behindMatch ? parseInt(behindMatch[1], 10) : 0,
          lastCommitTimestamp: parseInt(timestamp, 10) || 0,
        },
      ];
    });
  }

  async getFileContentAtRef(ref: string, repoRelativePath: string): Promise<string> {
    try {
      return await this.run('show', `${ref}:${repoRelativePath}`);
    } catch {
      return '';
    }
  }

  async checkout(branch: string): Promise<void> {
    await this.run('checkout', branch);
  }

  async deleteLocalBranch(branch: string, force = false): Promise<void> {
    await this.run('branch', force ? '-D' : '-d', branch);
  }

  async deleteRemoteBranch(upstream: string): Promise<void> {
    // upstream is e.g. "origin/feature/foo" → split on first "/"
    const idx = upstream.indexOf('/');
    const remote = upstream.slice(0, idx);
    const branch = upstream.slice(idx + 1);
    await this.run('push', remote, '--delete', branch);
  }

  async fetchPrune(): Promise<void> {
    await this.run('fetch', '--all', '--prune');
  }

  async pull(branch: BranchInfo): Promise<void> {
    if (!branch.upstream) return;
    const idx = branch.upstream.indexOf('/');
    const remote = branch.upstream.slice(0, idx);
    const remoteBranch = branch.upstream.slice(idx + 1);
    if (branch.isCurrent) {
      await this.run('pull');
    } else {
      // fetch directly into local ref (works for non-checked-out branches)
      await this.run('fetch', remote, `${remoteBranch}:${branch.name}`);
    }
  }
}
