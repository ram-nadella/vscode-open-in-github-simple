// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { getRepoInfo, buildGitHubUrl } from './git';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "open-in-github-simple" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('open-in-github-simple.openInGithub', async () => {
		// Get the active editor
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found');
			return;
		}

		// Get the current file path and selection information
		const filePath = editor.document.uri.fsPath;
		const selection = editor.selection;

		// Calculate the start and end line numbers (1-based for GitHub)
		const startLine = selection.start.line + 1;
		const endLine = selection.end.line + 1;

		try {
			// Get the Git repository information
			const repoInfo = await getRepoInfo(filePath);
			if (!repoInfo) {
				vscode.window.showErrorMessage('Could not determine GitHub repository information');
				console.error('Failed to get GitHub repository information. Check the logs for more details.');
				return;
			}

			// Build the GitHub URL with selection range if applicable
			let githubUrl;
			
			// Check if text is selected across multiple lines
			if (!selection.isEmpty && startLine !== endLine) {
				// Multi-line selection
				githubUrl = buildGitHubUrl(repoInfo, filePath, startLine, endLine);
			} else {
				// Single line or just cursor position
				githubUrl = buildGitHubUrl(repoInfo, filePath, startLine);
			}
			
			if (!githubUrl) {
				vscode.window.showErrorMessage('Failed to build GitHub URL');
				return;
			}

			// Open the URL in the browser
			vscode.env.openExternal(vscode.Uri.parse(githubUrl));
			console.log(`Opening ${githubUrl}`);
		} catch (error) {
			vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
