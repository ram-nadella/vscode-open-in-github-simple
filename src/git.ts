import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

export interface RepoInfo {
    remoteUrl: string;
    branch: string;
    rootPath: string;
}

export async function getRepoInfo(filePath: string): Promise<RepoInfo | null> {
    try {
        const rootPath = await getGitRootPath(filePath);
        if (!rootPath) {
            const error = new Error('Not a git repository');
            console.error(`Failed to get git repository information: ${error.message}`);
            throw error;
        }

        const remoteUrl = await getRemoteUrl(rootPath);
        if (!remoteUrl) {
            const error = new Error('No GitHub remote found');
            console.error(`Failed to get git repository information: ${error.message}, check remote configuration`);
            throw error;
        }

        const branch = await getCurrentBranch(rootPath);
        if (!branch) {
            const error = new Error('Could not determine current branch or commit');
            console.error(`Failed to get git repository information: ${error.message}`);
            throw error;
        }

        return { remoteUrl, branch, rootPath };
    } catch (error) {
        console.error(`Git error details: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

function executeCommand(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        cp.exec(command, { cwd }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Command failed: ${stderr.trim() || error.message}`));
                return;
            }
            resolve(stdout.trim());
        });
    });
}

async function getGitRootPath(filePath: string): Promise<string | null> {
    try {
        const cwd = path.dirname(filePath);
        const result = await executeCommand('git rev-parse --show-toplevel', cwd);
        return result;
    } catch (error) {
        return null;
    }
}

async function getRemoteUrl(repoPath: string): Promise<string | null> {
    try {
        // Try to get the origin remote URL
        const remoteUrl = await executeCommand('git config --get remote.origin.url', repoPath);
        return normalizeGitHubUrl(remoteUrl);
    } catch (error) {
        return null;
    }
}

async function getCurrentBranch(repoPath: string): Promise<string | null> {
    try {
        // Check if repository has commits
        try {
            // This will fail if there are no commits
            await executeCommand('git rev-parse HEAD', repoPath);
        } catch (error) {
            // No commits yet, we can try to get the branch name from the symbolic ref
            try {
                const symbolicRef = await executeCommand('git symbolic-ref --short HEAD', repoPath);
                return symbolicRef; // Usually 'main' or 'master' for a new repo
            } catch (innerError) {
                // Still failed, return default branch
                return 'main';
            }
        }
        
        // Try to get the current branch name
        const branch = await executeCommand('git rev-parse --abbrev-ref HEAD', repoPath);
        
        // Handle detached HEAD state
        if (branch === 'HEAD') {
            // We're in a detached HEAD state, get the commit hash instead
            const commitHash = await executeCommand('git rev-parse HEAD', repoPath);
            return commitHash;
        }
        
        return branch;
    } catch (error) {
        return null;
    }
}

function normalizeGitHubUrl(remoteUrl: string): string | null {
    // Handle different GitHub URL formats
    
    // 1. Handle SSH format: git@github.com:username/repo.git
    if (remoteUrl.startsWith('git@github.com:')) {
        // Convert SSH format to HTTPS format
        const sshPath = remoteUrl.slice('git@github.com:'.length);
        const repoPath = sshPath.endsWith('.git') ? sshPath.slice(0, -4) : sshPath;
        return `https://github.com/${repoPath}`;
    } 
    // 2. Handle HTTPS format: https://github.com/username/repo.git
    else if (remoteUrl.includes('github.com')) {
        // Just remove .git suffix if it exists
        return remoteUrl.endsWith('.git') ? remoteUrl.slice(0, -4) : remoteUrl;
    }
    
    // Not a GitHub URL
    return null;
}

export function buildGitHubUrl(repoInfo: RepoInfo, filePath: string, startLineNumber: number, endLineNumber?: number): string | null {
    try {
        // Get the relative path of the file within the repository
        const relativePath = path.relative(repoInfo.rootPath, filePath).replace(/\\/g, '/');
        
        // Construct the GitHub URL with the line number(s)
        if (endLineNumber && endLineNumber !== startLineNumber) {
            // For a multi-line selection
            return `${repoInfo.remoteUrl}/blob/${repoInfo.branch}/${relativePath}#L${startLineNumber}-L${endLineNumber}`;
        } else {
            // For a single line selection or cursor position
            return `${repoInfo.remoteUrl}/blob/${repoInfo.branch}/${relativePath}#L${startLineNumber}`;
        }
    } catch (error) {
        return null;
    }
}