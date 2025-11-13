import * as vscode from 'vscode';

export class JsonEditorProvider implements vscode.CustomTextEditorProvider {
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new JsonEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            JsonEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                }
            }
        );
        return providerRegistration;
    }

    private static readonly viewType = 'commandOutputHover.jsonEditor';

    constructor(private readonly context: vscode.ExtensionContext) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
        };

        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);

        function updateWebview() {
            webviewPanel.webview.postMessage({
                type: 'update',
                text: document.getText(),
            });
        }

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });

        webviewPanel.webview.onDidReceiveMessage(async e => {
            switch (e.type) {
                case 'postJson':
                    await this.postJson(e.url, e.json, webviewPanel);
                    return;
                case 'updateText':
                    this.updateTextDocument(document, e.text);
                    return;
            }
        });

        updateWebview();
    }

    private async postJson(url: string, jsonContent: string, webviewPanel: vscode.WebviewPanel) {
        const config = vscode.workspace.getConfiguration('commandOutputHover');
        const method = config.get<string>('jsonPostMethod', 'POST');
        const headers = config.get<Record<string, string>>('jsonPostHeaders', { 'Content-Type': 'application/json' });

        try {
            // Import JsonPoster dynamically
            const { JsonPoster } = await import('./jsonPoster');
            const poster = new JsonPoster();
            
            const result = await poster.post(jsonContent, { url, method, headers });
            
            webviewPanel.webview.postMessage({
                type: 'response',
                success: result.success,
                data: result.data,
                error: result.error,
                statusCode: result.statusCode
            });
        } catch (error) {
            webviewPanel.webview.postMessage({
                type: 'response',
                success: false,
                error: `Failed to post: ${error}`
            });
        }
    }

    private updateTextDocument(document: vscode.TextDocument, text: string) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            text
        );
        return vscode.workspace.applyEdit(edit);
    }

    private getHtmlForWebview(webview: vscode.Webview, document: vscode.TextDocument): string {
        const config = vscode.workspace.getConfiguration('commandOutputHover');
        const defaultUrl = config.get<string>('jsonPostUrl', 'https://httpbin.org/post');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON Editor</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            margin: 0;
            padding: 0;
            font-family: 'Consolas', 'Courier New', monospace;
            background-color: #1e1e1e;
            color: #d4d4d4;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .toolbar {
            background-color: #252526;
            padding: 12px 16px;
            border-bottom: 1px solid #3e3e3e;
            display: flex;
            gap: 10px;
            align-items: center;
            flex-shrink: 0;
        }
        .url-input {
            flex: 1;
            background-color: #3c3c3c;
            border: 1px solid #555;
            color: #d4d4d4;
            padding: 6px 12px;
            border-radius: 3px;
            font-family: inherit;
            font-size: 13px;
        }
        .url-input:focus {
            outline: none;
            border-color: #007acc;
        }
        .btn {
            background-color: #0e639c;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            font-family: inherit;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .btn:hover {
            background-color: #1177bb;
        }
        .btn:disabled {
            background-color: #555;
            cursor: not-allowed;
        }
        .btn-secondary {
            background-color: #3c3c3c;
        }
        .btn-secondary:hover {
            background-color: #505050;
        }
        .content-area {
            display: flex;
            flex: 1;
            overflow: hidden;
            position: relative;
        }
        .editor-pane {
            display: flex;
            flex-direction: column;
            min-width: 200px;
        }
        .response-pane {
            display: flex;
            flex-direction: column;
            background-color: #1a1a1a;
            min-width: 200px;
        }
        .resizer {
            width: 4px;
            background-color: #3e3e3e;
            cursor: col-resize;
            flex-shrink: 0;
        }
        .resizer:hover {
            background-color: #007acc;
        }
        .pane-header {
            background-color: #252526;
            padding: 8px 16px;
            border-bottom: 1px solid #3e3e3e;
            font-size: 12px;
            font-weight: bold;
            color: #858585;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .format-btn {
            background-color: transparent;
            color: #858585;
            border: 1px solid #555;
            padding: 2px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            font-family: inherit;
        }
        .format-btn:hover {
            background-color: #3c3c3c;
            color: #d4d4d4;
        }
        .editor {
            flex: 1;
            overflow: auto;
            position: relative;
        }
        .json-editor-container {
            position: relative;
            width: 100%;
            height: 100%;
        }
        #jsonEditor {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            padding: 16px;
            background-color: #1e1e1e;
            color: #d4d4d4;
            border: none;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.6;
            white-space: pre;
            overflow: auto;
            outline: none;
        }
        #jsonEditor:focus {
            outline: 1px solid #007acc;
        }
        .response-content {
            flex: 1;
            padding: 16px;
            overflow: auto;
        }
        .response-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid #3e3e3e;
        }
        .status-badge {
            padding: 4px 12px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: bold;
        }
        .status-success {
            background-color: #1a472a;
            color: #4ec9b0;
        }
        .status-error {
            background-color: #5a1d1d;
            color: #f48771;
        }
        pre {
            background-color: #252526;
            padding: 16px;
            border-radius: 5px;
            overflow-x: auto;
            margin: 0;
            line-height: 1.6;
            font-size: 13px;
        }
        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #858585;
            font-size: 14px;
        }
        .loading {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .spinner {
            border: 2px solid #3e3e3e;
            border-top: 2px solid #007acc;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .json-key { color: #9cdcfe; }
        .json-string { color: #ce9178; }
        .json-number { color: #b5cea8; }
        .json-boolean { color: #569cd6; }
        .json-null { color: #569cd6; }
    </style>
</head>
<body>
    <div class="toolbar">
        <input type="text" class="url-input" id="urlInput" placeholder="Enter URL to POST JSON..." value="${defaultUrl}">
        <button class="btn btn-secondary" id="formatRequestBtn" title="Format JSON">
            <span>✨</span>
            <span>Format Request</span>
        </button>
        <button class="btn" id="postBtn">
            <span>▶️</span>
            <span>POST</span>
        </button>
    </div>
    <div class="content-area" id="contentArea">
        <div class="editor-pane" id="editorPane" style="width: 50%;">
            <div class="pane-header">
                <span>JSON REQUEST</span>
            </div>
            <div class="editor">
                <div class="json-editor-container">
                    <pre id="jsonEditor" contenteditable="true" spellcheck="false"></pre>
                </div>
            </div>
        </div>
        <div class="resizer" id="resizer"></div>
        <div class="response-pane" id="responsePane" style="width: 50%;">
            <div class="pane-header">
                <span>RESPONSE</span>
                <button class="format-btn" id="formatResponseBtn" style="display:none;">Format JSON</button>
            </div>
            <div class="response-content" id="responseContent">
                <div class="empty-state">Click POST to see the response here</div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const urlInput = document.getElementById('urlInput');
        const postBtn = document.getElementById('postBtn');
        const formatRequestBtn = document.getElementById('formatRequestBtn');
        const formatResponseBtn = document.getElementById('formatResponseBtn');
        const jsonEditor = document.getElementById('jsonEditor');
        const responseContent = document.getElementById('responseContent');
        const resizer = document.getElementById('resizer');
        const editorPane = document.getElementById('editorPane');
        const responsePane = document.getElementById('responsePane');
        const contentArea = document.getElementById('contentArea');

        let currentResponseData = null;
        let isUpdating = false;

        // Syntax highlight JSON text
        function highlightJson(text) {
            try {
                const json = JSON.parse(text);
                const formatted = JSON.stringify(json, null, 2);
                return syntaxHighlightJson(formatted);
            } catch {
                return escapeHtml(text);
            }
        }

        // Initialize editor with document content and syntax highlighting
        function updateEditorContent(text, highlight = true) {
            if (isUpdating) return;
            isUpdating = true;
            
            if (highlight) {
                jsonEditor.innerHTML = highlightJson(text);
            } else {
                jsonEditor.textContent = text;
            }
            
            isUpdating = false;
        }

        // Initialize with content
        updateEditorContent(${JSON.stringify(document.getText())}, true);

        // Handle editor input - update on blur to avoid cursor issues
        let typingTimer;
        jsonEditor.addEventListener('input', () => {
            if (isUpdating) return;
            
            clearTimeout(typingTimer);
            const text = jsonEditor.textContent || '';
            
            // Send update to VS Code
            vscode.postMessage({
                type: 'updateText',
                text: text
            });
            
            // Debounce syntax highlighting to avoid cursor jumping
            typingTimer = setTimeout(() => {
                updateEditorContent(text, true);
            }, 1000);
        });

        // Re-highlight on blur
        jsonEditor.addEventListener('blur', () => {
            const text = jsonEditor.textContent || '';
            updateEditorContent(text, true);
        });

        // Resizer functionality
        let isResizing = false;
        let startX = 0;
        let startWidthLeft = 0;
        let startWidthRight = 0;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidthLeft = editorPane.offsetWidth;
            startWidthRight = responsePane.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const delta = e.clientX - startX;
            const containerWidth = contentArea.offsetWidth;
            const newLeftWidth = startWidthLeft + delta;
            const newRightWidth = startWidthRight - delta;
            
            if (newLeftWidth > 200 && newRightWidth > 200) {
                const leftPercent = (newLeftWidth / containerWidth) * 100;
                const rightPercent = (newRightWidth / containerWidth) * 100;
                editorPane.style.width = leftPercent + '%';
                responsePane.style.width = rightPercent + '%';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });

        // Format request JSON
        formatRequestBtn.addEventListener('click', () => {
            try {
                const text = jsonEditor.textContent || '';
                const json = JSON.parse(text);
                const formatted = JSON.stringify(json, null, 2);
                updateEditorContent(formatted);
                vscode.postMessage({
                    type: 'updateText',
                    text: formatted
                });
            } catch (error) {
                alert('Invalid JSON: ' + error.message);
            }
        });

        // Format response JSON
        formatResponseBtn.addEventListener('click', () => {
            if (currentResponseData) {
                displayResponse({
                    success: true,
                    data: currentResponseData,
                    statusCode: 200
                });
            }
        });

        // Handle POST button
        postBtn.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (!url) {
                alert('Please enter a URL');
                return;
            }

            postBtn.disabled = true;
            responseContent.innerHTML = '<div class="empty-state"><div class="loading"><div class="spinner"></div><span>Posting JSON...</span></div></div>';

            const text = jsonEditor.textContent || '';
            vscode.postMessage({
                type: 'postJson',
                url: url,
                json: text
            });
        });

        // Handle Enter key in URL input
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                postBtn.click();
            }
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    updateEditorContent(message.text);
                    break;
                case 'response':
                    postBtn.disabled = false;
                    displayResponse(message);
                    break;
            }
        });

        function displayResponse(response) {
            if (response.success) {
                currentResponseData = response.data;
                formatResponseBtn.style.display = 'block';
                
                const jsonString = typeof response.data === 'string' 
                    ? response.data 
                    : JSON.stringify(response.data, null, 2);
                
                responseContent.innerHTML = \`
                    <div class="response-header">
                        <div class="status-badge status-success">✅ HTTP \${response.statusCode || 200}</div>
                    </div>
                    <pre>\${syntaxHighlightJson(jsonString)}</pre>
                \`;
            } else {
                currentResponseData = null;
                formatResponseBtn.style.display = 'none';
                
                responseContent.innerHTML = \`
                    <div class="response-header">
                        <div class="status-badge status-error">❌ ERROR</div>
                    </div>
                    <pre style="color: #f48771;">\${escapeHtml(response.error || 'Unknown error')}</pre>
                \`;
            }
        }

        function syntaxHighlightJson(json) {
            // First escape HTML
            const escaped = json
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            
            // Then apply syntax highlighting
            return escaped.replace(
                /("(\\\\u[a-fA-F0-9]{4}|\\\\[^u]|[^\\\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+\.?\d*([eE][+-]?\d+)?)/g,
                function(match) {
                    let style = 'color: #b5cea8;'; // numbers - green
                    
                    if (/^"/.test(match)) {
                        if (/:$/.test(match)) {
                            style = 'color: #9cdcfe;'; // keys - blue
                        } else {
                            style = 'color: #ce9178;'; // strings - orange
                        }
                    } else if (/true|false/.test(match)) {
                        style = 'color: #569cd6;'; // booleans - blue
                    } else if (/null/.test(match)) {
                        style = 'color: #569cd6;'; // null - blue
                    }
                    
                    return '<span style="' + style + '">' + match + '</span>';
                }
            );
        }

        function escapeHtml(text) {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    </script>
</body>
</html>`;
    }
}
