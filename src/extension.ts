import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { CommandExecutor } from './commandExecutor';
import { HoverManager } from './hoverManager';

let configManager: ConfigManager;
let commandExecutor: CommandExecutor;
let hoverManager: HoverManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('Command Output Hover extension is now active');
    
    // Initialize managers
    configManager = new ConfigManager();
    commandExecutor = new CommandExecutor();
    hoverManager = new HoverManager();
    
    // Register command to show full output
    const showFullOutputDisposable = vscode.commands.registerCommand('commandOutputHover.showFullOutput', (args) => {
        const { output, isError } = JSON.parse(args);
        showOutputPopup(output, isError);
    });
    
    // Register command
    const commandDisposable = vscode.commands.registerCommand('commandOutputHover.executeCommand', async () => {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }
        
        let selection = editor.selection;
        let selectedText = editor.document.getText(selection);
        
        // If no text is selected, get the word under the cursor
        if (!selectedText || selectedText.trim().length === 0) {
            const position = editor.selection.active;
            const wordRange = editor.document.getWordRangeAtPosition(position);
            
            if (wordRange) {
                selectedText = editor.document.getText(wordRange);
                selection = new vscode.Selection(wordRange.start, wordRange.end);
            } else {
                vscode.window.showErrorMessage('No text selected and no word found under cursor');
                return;
            }
        }
        
        // Get configuration
        const config = configManager.getConfig();
        
        // Execute command with progress feedback
        await executeCommandWithProgress(editor, selection, selectedText, config);
    });
    
    // Register hover provider for all document types
    const hoverDisposable = vscode.languages.registerHoverProvider(
        { scheme: '*', language: '*' },
        hoverManager
    );
    
    // Set up configuration change listener
    const configChangeDisposable = configManager.onConfigChange((newConfig) => {
        console.log('Configuration changed:', newConfig);
    });
    
    // Set up document close listener
    const docCloseDisposable = vscode.workspace.onDidCloseTextDocument((document) => {
        hoverManager.onDocumentClosed(document);
    });
    
    // Set up document change listener
    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        hoverManager.onDocumentChanged(event.document);
    });
    
    // Add all disposables to subscriptions
    context.subscriptions.push(
        commandDisposable,
        showFullOutputDisposable,
        hoverDisposable,
        configChangeDisposable,
        docCloseDisposable,
        docChangeDisposable
    );
}

async function executeCommandWithProgress(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    selectedText: string,
    config: any
): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Executing command...",
        cancellable: false
    }, async () => {
        try {
            // Build the actual command that will be executed
            const actualCommand = config.commandTemplate.replace(/\{\{input\}\}/g, selectedText);
            
            // Execute command
            const result = await commandExecutor.execute(
                selectedText,
                config.commandTemplate,
                config.shellType,
                config.timeout
            );
            
            // Handle result and store for hover
            handleExecutionResult(editor, selection, result, actualCommand, selectedText);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Command execution failed: ${error}`);
        }
    });
}

function handleExecutionResult(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    result: any,
    command: string,
    input: string
): void {
    const range = new vscode.Range(selection.start, selection.end);
    
    if (result.success) {
        // Store successful output
        hoverManager.storeOutput(editor.document, range, result.output, command, input);
        
        // Show output in a popup immediately
        showOutputPopup(result.output, false);
    } else {
        // Store error output for debugging
        const errorOutput = result.error || 'Unknown error';
        hoverManager.storeOutput(editor.document, range, `Error: ${errorOutput}`, command, input);
        
        // Show error in popup
        showOutputPopup(errorOutput, true);
    }
}

function showOutputPopup(output: string, isError: boolean): void {
    // Limit output length for the popup
    const maxLength = 500;
    let displayOutput = output;
    let truncated = false;
    
    if (output.length > maxLength) {
        displayOutput = output.substring(0, maxLength);
        truncated = true;
    }
    
    // Create a webview panel to show the output
    const panel = vscode.window.createWebviewPanel(
        'commandOutput',
        isError ? 'Command Error' : 'Command Output',
        vscode.ViewColumn.Beside,
        {
            enableScripts: false
        }
    );
    
    // Set the HTML content
    panel.webview.html = getWebviewContent(displayOutput, truncated, isError);
}

function getWebviewContent(output: string, truncated: boolean, isError: boolean): string {
    const escapedOutput = output
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    
    const backgroundColor = isError ? '#3d1f1f' : '#1e1e1e';
    const textColor = isError ? '#f48771' : '#d4d4d4';
    const title = isError ? 'Error' : 'Output';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            background-color: ${backgroundColor};
            color: ${textColor};
            font-family: 'Courier New', monospace;
            padding: 20px;
            margin: 0;
        }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            margin: 0;
            font-size: 14px;
            line-height: 1.5;
        }
        .truncated {
            margin-top: 20px;
            font-style: italic;
            color: #888;
        }
    </style>
</head>
<body>
    <pre>${escapedOutput}</pre>
    ${truncated ? '<div class="truncated">... (output truncated, hover over text to see full output)</div>' : ''}
</body>
</html>`;
}

export function deactivate() {
    if (hoverManager) {
        hoverManager.dispose();
    }
}
