import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { CommandExecutor } from './commandExecutor';
import { HoverManager } from './hoverManager';
import { JsonPoster } from './jsonPoster';
import { JsonEditorProvider } from './jsonEditorProvider';

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
    
    // Register custom JSON editor
    context.subscriptions.push(JsonEditorProvider.register(context));
    
    // Register command to open JSON editor
    const openJsonEditorDisposable = vscode.commands.registerCommand('commandOutputHover.openJsonEditor', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'json') {
            vscode.window.showErrorMessage('Please open a JSON file first');
            return;
        }
        
        await vscode.commands.executeCommand('vscode.openWith', editor.document.uri, 'commandOutputHover.jsonEditor');
    });
    
    // Register command to show full output
    const showFullOutputDisposable = vscode.commands.registerCommand('commandOutputHover.showFullOutput', (args) => {
        const { output, isError } = JSON.parse(args);
        showOutputPopup(output, isError);
    });
    
    // Register command to post JSON to URL with prompt
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
        
        await postJsonToRemoteUrl(editor, true);
    });
    
    // Register command to post JSON to default URL
    const postJsonDefaultDisposable = vscode.commands.registerCommand('commandOutputHover.postJsonToUrlDefault', async () => {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }
        
        if (editor.document.languageId !== 'json') {
            vscode.window.showErrorMessage('This command only works with JSON files');
            return;
        }
        
        await postJsonToRemoteUrl(editor, false);
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
        openJsonEditorDisposable,
        postJsonDisposable,
        postJsonDefaultDisposable,
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

async function postJsonToRemoteUrl(editor: vscode.TextEditor, promptForUrl: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('commandOutputHover');
    const configuredUrl = config.get<string>('jsonPostUrl', '');
    const method = config.get<string>('jsonPostMethod', 'POST');
    const headers = config.get<Record<string, string>>('jsonPostHeaders', { 'Content-Type': 'application/json' });
    
    let url = configuredUrl;
    
    // If promptForUrl is true, show input box
    if (promptForUrl) {
        const inputUrl = await vscode.window.showInputBox({
            prompt: 'Enter URL to POST JSON to (Ctrl+Click to use this URL)',
            placeHolder: 'https://api.example.com/endpoint',
            value: configuredUrl,
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'URL cannot be empty';
                }
                try {
                    new URL(value);
                    return null;
                } catch {
                    return 'Please enter a valid URL';
                }
            }
        });
        
        // User cancelled
        if (!inputUrl) {
            return;
        }
        
        url = inputUrl.trim();
    } else {
        // Use default URL, check if it's configured
        if (!url || url.trim() === '') {
            const configure = await vscode.window.showInformationMessage(
                'No default URL configured. Click the play button with Ctrl/Cmd to enter a URL, or configure one in settings.',
                'Configure Now',
                'Enter URL Now'
            );
            
            if (configure === 'Configure Now') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'commandOutputHover.jsonPostUrl');
                return;
            } else if (configure === 'Enter URL Now') {
                // Recursively call with prompt
                await postJsonToRemoteUrl(editor, true);
                return;
            } else {
                return;
            }
        }
    }
    
    const jsonContent = editor.document.getText();
    
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Posting JSON to ${url}...`,
        cancellable: false
    }, async () => {
        const result = await jsonPoster.post(jsonContent, { url, method, headers });
        
        if (result.success) {
            showJsonResponse(result.data, result.statusCode || 200, url);
        } else {
            vscode.window.showErrorMessage(`Failed to post JSON: ${result.error}`);
        }
    });
}

function showJsonResponse(data: any, statusCode: number, url: string): void {
    const panel = vscode.window.createWebviewPanel(
        'jsonResponse',
        `📡 Response (${statusCode})`,
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );
    
    panel.webview.html = getJsonResponseHtml(data, statusCode, url);
}

function getJsonResponseHtml(data: any, statusCode: number, url: string): string {
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const isSuccess = statusCode >= 200 && statusCode < 300;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON Response</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            background-color: #1e1e1e;
            color: #d4d4d4;
            font-family: 'Consolas', 'Courier New', monospace;
            padding: 0;
            margin: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .toolbar {
            background-color: #252526;
            padding: 12px 20px;
            border-bottom: 1px solid #3e3e3e;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
        }
        .toolbar-left {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .status {
            font-size: 16px;
            font-weight: bold;
            color: ${isSuccess ? '#4ec9b0' : '#f48771'};
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .status-icon {
            font-size: 20px;
        }
        .url {
            font-size: 11px;
            color: #858585;
            max-width: 400px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .copy-btn {
            background-color: #0e639c;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-family: inherit;
        }
        .copy-btn:hover {
            background-color: #1177bb;
        }
        .copy-btn:active {
            background-color: #0d5a8f;
        }
        .content {
            flex: 1;
            overflow: auto;
            padding: 20px;
        }
        pre {
            background-color: #252526;
            padding: 20px;
            border-radius: 5px;
            margin: 0;
            line-height: 1.6;
            font-size: 13px;
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
        .copied-toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #4ec9b0;
            color: #1e1e1e;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 12px;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .copied-toast.show {
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="toolbar-left">
            <div class="status">
                <span class="status-icon">${isSuccess ? '✅' : '❌'}</span>
                <span>HTTP ${statusCode}</span>
            </div>
            <div class="url" title="${url}">POST ${url}</div>
        </div>
        <button class="copy-btn" onclick="copyToClipboard()">📋 Copy JSON</button>
    </div>
    <div class="content">
        <pre id="json-content">${syntaxHighlightJson(jsonString)}</pre>
    </div>
    <div id="toast" class="copied-toast">Copied to clipboard!</div>
    
    <script>
        function copyToClipboard() {
            const jsonText = ${JSON.stringify(jsonString)};
            navigator.clipboard.writeText(jsonText).then(() => {
                const toast = document.getElementById('toast');
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 2000);
            });
        }
    </script>
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
