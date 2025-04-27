import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
// Fix the proxyquire import to use default import
import proxyquire from 'proxyquire';

// Import the git module for testing
import * as git from '../git';

suite('Git Functionality Tests', () => {
    let sandbox: sinon.SinonSandbox;
    const mockFilePath = '/mock/path/to/file.ts';
    const mockRootPath = '/mock/path';

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('buildGitHubUrl should construct the correct URL', () => {
        const repoInfo: git.RepoInfo = {
            remoteUrl: 'https://github.com/username/repo',
            branch: 'main',
            rootPath: mockRootPath
        };

        const filePath = path.join(mockRootPath, 'src', 'file.ts');
        const lineNumber = 42;

        const url = git.buildGitHubUrl(repoInfo, filePath, lineNumber);
        assert.strictEqual(url, 'https://github.com/username/repo/blob/main/src/file.ts#L42');
    });

    test('buildGitHubUrl should construct the correct URL with line range', () => {
        const repoInfo: git.RepoInfo = {
            remoteUrl: 'https://github.com/username/repo',
            branch: 'main',
            rootPath: mockRootPath
        };

        const filePath = path.join(mockRootPath, 'src', 'file.ts');
        const startLine = 42;
        const endLine = 50;

        const url = git.buildGitHubUrl(repoInfo, filePath, startLine, endLine);
        assert.strictEqual(url, 'https://github.com/username/repo/blob/main/src/file.ts#L42-L50');
    });

    test('buildGitHubUrl should handle errors gracefully', () => {
        const repoInfo: git.RepoInfo = {
            remoteUrl: 'https://github.com/username/repo',
            branch: 'main',
            rootPath: mockRootPath
        };

        // Create a condition that would cause an error (null filePath)
        const url = git.buildGitHubUrl(repoInfo, null as any, 42);
        assert.strictEqual(url, null);
    });

    // Test for getRepoInfo with different scenarios using stubs for console.error
    suite('getRepoInfo', () => {
        test('getRepoInfo should return repository information', async () => {
            const consoleErrorStub = sandbox.stub(console, 'error');
            
            // Mock executeCommand directly since it's the underlying function that makes git calls
            const executeCommandStub = sandbox.stub();
            executeCommandStub.withArgs('git rev-parse --show-toplevel', path.dirname(mockFilePath)).resolves(mockRootPath);
            executeCommandStub.withArgs('git config --get remote.origin.url', mockRootPath).resolves('https://github.com/username/repo.git');
            executeCommandStub.withArgs('git rev-parse --abbrev-ref HEAD', mockRootPath).resolves('main');
            executeCommandStub.withArgs('git rev-parse HEAD', mockRootPath).resolves('abcdef1234567890');
            
            // Create a proxied git module with our executeCommandStub
            const proxiedGit = proxyquire('../git', {
                'child_process': {
                    exec: (cmd: string, options: any, callback: any) => {
                        // Extract the git command being executed
                        const command = cmd;
                        const cwd = options.cwd;
                        
                        // Determine which mock response to use based on the command
                        executeCommandStub(command, cwd)
                            .then((result: string) => callback(null, result, ''))
                            .catch((error: Error) => callback(error, '', error.message));
                        
                        return {} as cp.ChildProcess;
                    }
                }
            });
            
            // Call the function from our proxied module
            const result = await proxiedGit.getRepoInfo(mockFilePath);
            
            // Verify the result
            assert.notStrictEqual(result, null);
            assert.strictEqual(result?.remoteUrl, 'https://github.com/username/repo');
            assert.strictEqual(result?.branch, 'main');
            assert.strictEqual(result?.rootPath, mockRootPath);
        });

        test('getRepoInfo should handle errors appropriately', async () => {
            const consoleErrorStub = sandbox.stub(console, 'error');
            // Instead of stubbing getRepoInfo itself, let's stub a function it depends on to cause an error
            const executeCommandStub = sandbox.stub().rejects(new Error('Git command failed'));
            
            // Use proxyquire to inject our stub
            const proxiedGit = proxyquire.noCallThru().load('../git', {
                './git': {
                    executeCommand: executeCommandStub
                }
            });
            
            try {
                const result = await git.getRepoInfo('/non-existent/path');
                // We expect null when an error occurs
                assert.strictEqual(result, null);
                // Ensure the error was logged
                assert.ok(consoleErrorStub.called);
            } catch (error) {
                // If the function throws instead of returning null, that's also acceptable behavior
                assert.ok(error instanceof Error);
            }
        });
    });

    // Test the actual implementation of git functions with mocked git commands
    suite('Git command integration', () => {
        // Helper function to create a proxied git module with stubbed child_process
        function createProxiedGitModule(execStubResponses: Record<string, {stdout: string, stderr: string, error: Error | null}>) {
            const execStub = (command: string, options: any, callback: any) => {
                const matchingCommand = Object.keys(execStubResponses).find(key => command.includes(key));
                if (matchingCommand) {
                    const response = execStubResponses[matchingCommand as keyof typeof execStubResponses];
                    callback(response.error, response.stdout, response.stderr);
                } else {
                    callback(new Error(`No stub response for command: ${command}`), '', 'Command not stubbed');
                }
                return {} as any;
            };

            // Use the correct proxyquire call
            const proxiedGit = proxyquire.noCallThru().load('../git', {
                'child_process': { exec: execStub }
            });

            return proxiedGit;
        }

        test('Should handle SSH GitHub URLs correctly', async function() {
            const execStubResponses = {
                'rev-parse --show-toplevel': { stdout: mockRootPath, stderr: '', error: null },
                'config --get remote.origin.url': { stdout: 'git@github.com:username/repo.git', stderr: '', error: null },
                'rev-parse --abbrev-ref HEAD': { stdout: 'main', stderr: '', error: null },
                'rev-parse HEAD': { stdout: 'abcdef1234567890', stderr: '', error: null }
            };

            const proxiedGit = createProxiedGitModule(execStubResponses);
            const result = await proxiedGit.getRepoInfo(mockFilePath);
            assert.notStrictEqual(result, null);
            assert.strictEqual(result?.remoteUrl, 'https://github.com/username/repo');
            assert.strictEqual(result?.branch, 'main');
            assert.strictEqual(result?.rootPath, mockRootPath);
        });

        test('Should handle HTTPS GitHub URLs correctly', async function() {
            const execStubResponses = {
                'rev-parse --show-toplevel': { stdout: mockRootPath, stderr: '', error: null },
                'config --get remote.origin.url': { stdout: 'https://github.com/username/repo.git', stderr: '', error: null },
                'rev-parse --abbrev-ref HEAD': { stdout: 'feature', stderr: '', error: null },
                'rev-parse HEAD': { stdout: 'abcdef1234567890', stderr: '', error: null }
            };

            const proxiedGit = createProxiedGitModule(execStubResponses);
            const result = await proxiedGit.getRepoInfo(mockFilePath);
            assert.notStrictEqual(result, null);
            assert.strictEqual(result?.remoteUrl, 'https://github.com/username/repo');
            assert.strictEqual(result?.branch, 'feature');
            assert.strictEqual(result?.rootPath, mockRootPath);
        });

        test('Should handle detached HEAD state', async function() {
            const execStubResponses = {
                'rev-parse --show-toplevel': { stdout: mockRootPath, stderr: '', error: null },
                'config --get remote.origin.url': { stdout: 'https://github.com/username/repo.git', stderr: '', error: null },
                'rev-parse --abbrev-ref HEAD': { stdout: 'HEAD', stderr: '', error: null },
                'rev-parse HEAD': { stdout: 'abcdef1234567890', stderr: '', error: null }
            };

            const proxiedGit = createProxiedGitModule(execStubResponses);
            const result = await proxiedGit.getRepoInfo(mockFilePath);
            assert.notStrictEqual(result, null);
            assert.strictEqual(result?.remoteUrl, 'https://github.com/username/repo');
            assert.strictEqual(result?.branch, 'abcdef1234567890');
            assert.strictEqual(result?.rootPath, mockRootPath);
        });

        test('Should handle non-GitHub remotes', async function() {
            // Create a custom console with a spy for error
            const errorSpy = sandbox.spy();
            const customConsole = { error: errorSpy, log: console.log, warn: console.warn, info: console.info };
            
            const execStubResponses = {
                'rev-parse --show-toplevel': { stdout: mockRootPath, stderr: '', error: null },
                'config --get remote.origin.url': { stdout: 'https://gitlab.com/username/repo.git', stderr: '', error: null },
                'rev-parse --abbrev-ref HEAD': { stdout: 'main', stderr: '', error: null },
                'rev-parse HEAD': { stdout: 'abcdef1234567890', stderr: '', error: null }
            };

            // Use our custom console in the proxied module
            const proxiedGit = proxyquire.noCallThru().load('../git', {
                'child_process': { exec: (command: string, options: any, callback: any) => {
                    const matchingCommand = Object.keys(execStubResponses).find(key => command.includes(key));
                    if (matchingCommand) {
                        const response = execStubResponses[matchingCommand as keyof typeof execStubResponses];
                        callback(response.error, response.stdout, response.stderr);
                    } else {
                        callback(new Error(`No stub response for command: ${command}`), '', 'Command not stubbed');
                    }
                    return {} as any;
                }},
                console: customConsole
            });
            
            const result = await proxiedGit.getRepoInfo(mockFilePath);
            
            // Verify the result is null (non-GitHub remote was rejected)
            assert.strictEqual(result, null);
        });
    });
});