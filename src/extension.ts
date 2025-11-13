import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { CommandExecutor } from './commandExecutor';
import { HoverManager } from './hoverManager';
import { JsonPoster } from './jsonPoster';

let configManager: ConfigManager;
let commandExecutor: CommandExecutor;
let hoverManager: HoverManager;
let jsonPoster: JsonPoster;

export function activate(context: vscode.ExtensionContext) {
    console.log('Command Output Hover extension is now active');
    
    // Initialize managers
    configManager = new ConfigManager();
    commandExecutor = new CommandExecutor();
    hoverManager = new HoverManager();
    jsonPoster = new JsonPoster();
    
    // Register command to show full output
    const showFullOutputDisposable = vscode.commands.registerCommand('commandOutputHover.showFullOutput', (args) => {
        const { output, isError } = JSON.parse(args);
        showOutputPopup(output, isError);
    });
    
    // Register command to post JSON to URL
    const postJsonDisposable = vscode.commands.registerCommand('commandOutputHover.postJsonToUrl', async () => {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }
        
        if (editor.document.languageId !== 'json') {
            vscode.window.showErrorMessage('This command only works with JSON files');
            return;
        }
        
        await postJsonToRemoteUrl(editor);
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
        postJsonDisposable,
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

async function postJsonToRemoteUrl(editor: vscode.TextEditor): Promise<void> {
    const config = vscode.workspace.getConfiguration('commandOutputHover');
    const url = config.get<string>('jsonPostUrl', '');
    const method = config.get<string>('jsonPostMethod', 'POST');
    const headers = config.get<Record<string, string>>('jsonPostHeaders', { 'Content-Type': 'application/json' });
    
    if (!url || url.trim() === '') {
        const configure = await vscode.window.showErrorMessage(
            'No URL configured for JSON posting',
            'Configure Now'
        );
        if (configure) {
            vscode.commands.executeCommand('workbench.action.openSettings', 'commandOutputHover.jsonPostUrl');
        }
        return;
    }
    
    const jsonContent = editor.document.getText();
    
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Posting JSON to remote URL...",
        cancellable: false
    }, async () => {
        const result = await jsonPoster.post(jsonContent, { url, method, headers });
        
        if (result.success) {
            showJsonResponse(result.data, result.statusCode || 200);
        } else {
            vscode.window.showErrorMessage(`Failed to post JSON: ${result.error}`);
        }
    });
}

function showJsonResponse(data: any, statusCode: number): void {
    const panel = vscode.window.createWebviewPanel(
        'jsonResponse',
        `Response (${statusCode})`,
        vscode.ViewColumn.Beside,
        {
            enableScripts: false
        }
    );
    
    panel.webview.html = getJsonResponseHtml(data, statusCode);
}

function getJsonResponseHtml(data: any, statusCode: number): string {
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const isSuccess = statusCode >= 200 && statusCode < 300;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON Response</title>
    <style>
        body {
            background-color: #1e1e1e;
            color: #d4d4d4;
            font-family: 'Consolas', 'Courier New', monospace;
            padding: 20px;
            margin: 0;
        }
        .header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid #3e3e3e;
        }
        .status {
            font-size: 18px;
            font-weight: bold;
            color: ${isSuccess ? '#4ec9b0' : '#f48771'};
            margin-right: 10px;
        }
        .status-icon {
            font-size: 24px;
            margin-right: 10px;
        }
        pre {
            background-color: #252526;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            line-height: 1.6;
        }
        .json-key {
            color: #9cdcfe;
        }
        .json-string {
            color: #ce9178;
        }
        .json-number {
            color: #b5cea8;
        }
        .json-boolean {
            color: #569cd6;
        }
        .json-null {
            color: #569cd6;
        }
    </style>
</head>
<body>
    <div class="header">
        <span class="status-icon">${isSuccess ? '✅' : '❌'}</span>
        <span class="status">HTTP ${statusCode}</span>
    </div>
    <pre>${syntaxHighlightJson(jsonString)}</pre>
</body>
</html>`;
}

function syntaxHighlightJson(json: string): string {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

export function deactivate() {
    if (hoverManager) {
        hoverManager.dispose();
    }
}
