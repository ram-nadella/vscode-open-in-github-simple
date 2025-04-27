import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';

// Import the extension module
import * as myExtension from '../extension';
import * as gitModule from '../git';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	let sandbox: sinon.SinonSandbox;
	
	setup(() => {
		sandbox = sinon.createSandbox();
	});
	
	teardown(() => {
		sandbox.restore();
	});

	test('Command should show error when no active editor', async () => {
		// Set activeTextEditor to undefined
		sandbox.stub(vscode.window, 'activeTextEditor').value(undefined);
		
		// Mock the showErrorMessage
		const errorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
		
		// Execute the command directly - note that we're testing the behavior, not the registration
		await vscode.commands.executeCommand('open-in-github-simple.openInGithub');
		
		// Verify that showErrorMessage was called with the correct message
		assert.strictEqual(errorMessageStub.calledOnce, true);
		assert.strictEqual(errorMessageStub.firstCall.args[0], 'No active editor found');
	});

	test('Command should open URL when editor is available', async () => {
		// For this test we'll mock the editor and Git functionality
		const mockDocument = { uri: { fsPath: '/path/to/file.ts' } };
		const mockSelection = { start: { line: 10 }, end: { line: 10 }, isEmpty: true }; // 0-based line number
		const mockEditor = { document: mockDocument, selection: mockSelection };
		
		// Mock activeTextEditor
		sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);
		
		// Mock the git functions
		const mockRepoInfo = {
			remoteUrl: 'https://github.com/username/repo',
			branch: 'main',
			rootPath: '/path'
		};
		
		sandbox.stub(gitModule, 'getRepoInfo').resolves(mockRepoInfo);
		sandbox.stub(gitModule, 'buildGitHubUrl').returns('https://github.com/username/repo/blob/main/to/file.ts#L11');
		
		// Mock VS Code's openExternal
		const openExternalStub = sandbox.stub(vscode.env, 'openExternal').resolves(true);
		
		 // Execute the command
		await vscode.commands.executeCommand('open-in-github-simple.openInGithub');
		
		// Verify openExternal was called with the correct URL
		assert.strictEqual(openExternalStub.calledOnce, true);
		assert.ok(openExternalStub.firstCall.args[0].toString().includes('github.com'), 'URL should contain github.com');
		
		// We've removed the information message in favor of console.log, so no need to test for it
	});
});
