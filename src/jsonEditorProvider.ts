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

        let isUpdatingDocument = false;

        function updateWebview() {
            if (!isUpdatingDocument) {
                webviewPanel.webview.postMessage({
                    type: 'update',
                    text: document.getText(),
                });
            }
        }

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                // Only update webview if the change didn't come from the webview itself
                if (!isUpdatingDocument) {
                    updateWebview();
                }
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
                    isUpdatingDocument = true;
                    await this.updateTextDocument(document, e.text);
                    setTimeout(() => {
                        isUpdatingDocument = false;
                    }, 100);
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
        const enableVimMode = config.get<boolean>('enableVimMode', false);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON Editor</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/editor/editor.main.min.css" />
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
            width: 100%;
            height: 100%;
        }
        #jsonEditor {
            width: 100%;
            height: 100%;
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
        .view-toggle {
            display: flex;
            gap: 4px;
        }
        .view-toggle button {
            background-color: transparent;
            color: #858585;
            border: 1px solid #555;
            padding: 2px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }
        .view-toggle button.active {
            background-color: #0e639c;
            color: white;
            border-color: #0e639c;
        }
        .view-toggle button:hover:not(.active) {
            background-color: #3c3c3c;
            color: #d4d4d4;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background-color: #252526;
            border-radius: 5px;
            overflow: hidden;
        }
        th, td {
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid #3e3e3e;
        }
        th {
            background-color: #2d2d30;
            color: #9cdcfe;
            font-weight: bold;
            position: sticky;
            top: 0;
        }
        td {
            color: #d4d4d4;
        }
        tr:hover {
            background-color: #2a2d2e;
        }
        .table-view {
            display: none;
        }
        .json-view {
            display: block;
        }
        #vim-status {
            position: fixed;
            bottom: 10px;
            left: 10px;
            background: #252526;
            padding: 5px 10px;
            border-radius: 3px;
            font-size: 12px;
            color: #d4d4d4;
            z-index: 1000;
            border: 1px solid #3e3e3e;
            font-family: 'Consolas', 'Courier New', monospace;
            min-width: 100px;
            text-align: center;
        }
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
                <div id="jsonEditor" class="json-editor-container"></div>
            </div>
        </div>
        <div class="resizer" id="resizer"></div>
        <div class="response-pane" id="responsePane" style="width: 50%;">
            <div class="pane-header">
                <span>RESPONSE</span>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <div class="view-toggle" id="viewToggle" style="display:none;">
                        <button id="jsonViewBtn" class="active">JSON</button>
                        <button id="tableViewBtn">Table</button>
                    </div>
                    <button class="format-btn" id="formatResponseBtn" style="display:none;">Format</button>
                </div>
            </div>
            <div class="response-content" id="responseContent">
                <div class="empty-state">Click POST to see the response here</div>
            </div>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js"></script>
    <script>
        const vscode = acquireVsCodeApi();
        const urlInput = document.getElementById('urlInput');
        const postBtn = document.getElementById('postBtn');
        const formatRequestBtn = document.getElementById('formatRequestBtn');
        const formatResponseBtn = document.getElementById('formatResponseBtn');
        const responseContent = document.getElementById('responseContent');
        const resizer = document.getElementById('resizer');
        const editorPane = document.getElementById('editorPane');
        const responsePane = document.getElementById('responsePane');
        const contentArea = document.getElementById('contentArea');
        const viewToggle = document.getElementById('viewToggle');
        const jsonViewBtn = document.getElementById('jsonViewBtn');
        const tableViewBtn = document.getElementById('tableViewBtn');

        let currentResponseData = null;
        let currentResponseHtml = '';
        let currentView = 'json'; // 'json' or 'table'
        let editor = null;
        let isUpdatingFromExtension = false;

        // Initialize Monaco Editor
        const enableVim = ${enableVimMode};
        require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
        require(['vs/editor/editor.main'], function () {
            editor = monaco.editor.create(document.getElementById('jsonEditor'), {
                value: ${JSON.stringify(document.getText())},
                language: 'json',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                formatOnPaste: false,
                formatOnType: false,
                tabSize: 2,
                insertSpaces: true,
                folding: true,
                foldingStrategy: 'indentation',
                showFoldingControls: 'always'
            });

            // Add Ctrl+Enter keybinding to POST
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function() {
                postBtn.click();
            });

            // Enable proper Vim mode with modal editing if configured
            if (enableVim) {
                const statusNode = document.createElement('div');
                statusNode.id = 'vim-status';
                statusNode.style.cssText = 'position: fixed; bottom: 10px; left: 10px; background: #252526; padding: 5px 10px; border-radius: 3px; font-size: 12px; color: #4ec9b0; z-index: 1000; border: 1px solid #3e3e3e; font-family: monospace;';
                document.body.appendChild(statusNode);

                // Vim state
                let vimMode = 'normal'; // normal, insert, visual, visualLine
                let vimCommand = '';
                let vimCount = '';
                let yankBuffer = '';
                let visualStart = null;
                let lastCommand = null; // For repeat with .
                
                function updateStatus() {
                    const modeText = vimMode === 'normal' ? '-- NORMAL --' : 
                                   vimMode === 'insert' ? '-- INSERT --' : 
                                   vimMode === 'visualLine' ? '-- VISUAL LINE --' :
                                   '-- VISUAL --';
                    const cmdText = vimCommand ? ' ' + vimCommand : '';
                    const countText = vimCount ? ' ' + vimCount : '';
                    statusNode.textContent = modeText + countText + cmdText;
                    statusNode.style.color = vimMode === 'insert' ? '#ce9178' : 
                                           (vimMode === 'visual' || vimMode === 'visualLine') ? '#569cd6' : '#4ec9b0';
                }
                
                function setMode(mode) {
                    vimMode = mode;
                    vimCommand = '';
                    vimCount = '';
                    
                    if (mode === 'visual' || mode === 'visualLine') {
                        visualStart = editor.getPosition();
                        // Don't set readonly - we need to allow cursor movement
                        editor.updateOptions({ readOnly: false });
                        if (mode === 'visualLine') {
                            // Select entire line
                            const lineNumber = visualStart.lineNumber;
                            const model = editor.getModel();
                            const lineLength = model.getLineMaxColumn(lineNumber);
                            editor.setSelection(new monaco.Range(lineNumber, 1, lineNumber, lineLength));
                        }
                    } else {
                        visualStart = null;
                        if (mode === 'normal') {
                            // Clear selection
                            const pos = editor.getPosition();
                            editor.setSelection(new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column));
                            editor.updateOptions({ readOnly: true });
                        } else if (mode === 'insert') {
                            editor.updateOptions({ readOnly: false });
                        }
                    }
                    
                    updateStatus();
                }
                
                setMode('normal');
                
                // Handle all keyboard input
                editor.onKeyDown((e) => {
                    if (vimMode === 'insert') {
                        // In insert mode, handle Escape and some Ctrl commands
                        if (e.keyCode === monaco.KeyCode.Escape) {
                            e.preventDefault();
                            e.stopPropagation();
                            setMode('normal');
                            return;
                        }
                        // Ctrl+w - delete word backward
                        if ((e.ctrlKey || e.metaKey) && e.keyCode === monaco.KeyCode.KeyW) {
                            e.preventDefault();
                            e.stopPropagation();
                            editor.trigger('vim', 'deleteWordLeft', null);
                            return;
                        }
                        // Ctrl+u - delete to start of line
                        if ((e.ctrlKey || e.metaKey) && e.keyCode === monaco.KeyCode.KeyU) {
                            e.preventDefault();
                            e.stopPropagation();
                            const pos = editor.getPosition();
                            const model = editor.getModel();
                            editor.executeEdits('vim', [{
                                range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, pos.column),
                                text: ''
                            }]);
                            return;
                        }
                        return;
                    }
                    
                    // Normal mode handling
                    const key = e.browserEvent.key;
                    const isShift = e.shiftKey;
                    const isCtrl = e.ctrlKey || e.metaKey;
                    
                    // Prevent default for most keys in normal mode
                    if (vimMode === 'normal' && key.length === 1 && !isCtrl) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    
                    // Handle numbers for count
                    if (vimMode === 'normal' && /^[0-9]$/.test(key) && (vimCount || key !== '0')) {
                        vimCount += key;
                        updateStatus();
                        return;
                    }
                    
                    const count = parseInt(vimCount) || 1;
                    
                    // Navigation commands
                    if (vimMode === 'normal') {
                        switch(key) {
                            case 'h':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorLeft', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'j':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorDown', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'k':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorUp', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'l':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorRight', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'w':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorWordStartRight', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'b':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorWordStartLeft', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'e':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorWordEndRight', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case '0':
                                if (!vimCount) {
                                    editor.trigger('vim', 'cursorHome', null);
                                }
                                break;
                            case '$':
                                editor.trigger('vim', 'cursorEnd', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'g':
                                if (vimCommand === 'g') {
                                    // gg - go to top
                                    if (vimCount) {
                                        editor.setPosition({ lineNumber: count, column: 1 });
                                    } else {
                                        editor.setPosition({ lineNumber: 1, column: 1 });
                                    }
                                    vimCommand = '';
                                    vimCount = '';
                                    updateStatus();
                                } else {
                                    vimCommand = 'g';
                                    updateStatus();
                                }
                                break;
                            case 'G':
                                // G - go to bottom (or specific line if count given)
                                if (vimCount) {
                                    editor.setPosition({ lineNumber: count, column: 1 });
                                    vimCount = '';
                                } else {
                                    const model = editor.getModel();
                                    const lastLine = model.getLineCount();
                                    editor.setPosition({ lineNumber: lastLine, column: 1 });
                                }
                                updateStatus();
                                break;
                            case 'i':
                                setMode('insert');
                                break;
                            case 'I':
                                editor.trigger('vim', 'cursorHome', null);
                                setMode('insert');
                                break;
                            case 'a':
                                editor.trigger('vim', 'cursorRight', null);
                                setMode('insert');
                                break;
                            case 'A':
                                editor.trigger('vim', 'cursorEnd', null);
                                setMode('insert');
                                break;
                            case 'o':
                                editor.trigger('vim', 'cursorEnd', null);
                                editor.trigger('vim', 'type', { text: '\\n' });
                                setMode('insert');
                                break;
                            case 'O':
                                editor.trigger('vim', 'cursorHome', null);
                                editor.trigger('vim', 'type', { text: '\\n' });
                                editor.trigger('vim', 'cursorUp', null);
                                setMode('insert');
                                break;
                            case 'x':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'deleteRight', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'X':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'deleteLeft', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'd':
                                if (vimCommand === 'd') {
                                    // dd - delete line
                                    const pos = editor.getPosition();
                                    const model = editor.getModel();
                                    for(let i = 0; i < count; i++) {
                                        const line = model.getLineContent(pos.lineNumber);
                                        yankBuffer = line;
                                        editor.executeEdits('vim', [{
                                            range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber + 1, 1),
                                            text: ''
                                        }]);
                                    }
                                    vimCommand = '';
                                    vimCount = '';
                                    updateStatus();
                                } else {
                                    vimCommand = 'd';
                                    updateStatus();
                                }
                                break;
                            case 'y':
                                if (vimCommand === 'y') {
                                    // yy - yank line
                                    const pos = editor.getPosition();
                                    const model = editor.getModel();
                                    yankBuffer = model.getLineContent(pos.lineNumber);
                                    vimCommand = '';
                                    vimCount = '';
                                    updateStatus();
                                } else {
                                    vimCommand = 'y';
                                    updateStatus();
                                }
                                break;
                            case 'p':
                                if (yankBuffer) {
                                    editor.trigger('vim', 'type', { text: yankBuffer });
                                }
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'u':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'undo', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'r':
                                if (isCtrl) {
                                    for(let i = 0; i < count; i++) editor.trigger('vim', 'redo', null);
                                    vimCount = '';
                                    updateStatus();
                                } else {
                                    // Replace single character
                                    vimCommand = 'r';
                                    updateStatus();
                                    // Wait for next key
                                    const replaceHandler = (replaceEvent) => {
                                        replaceEvent.preventDefault();
                                        replaceEvent.stopPropagation();
                                        const replaceChar = replaceEvent.browserEvent.key;
                                        if (replaceChar.length === 1) {
                                            editor.trigger('vim', 'deleteRight', null);
                                            editor.trigger('vim', 'type', { text: replaceChar });
                                            editor.trigger('vim', 'cursorLeft', null);
                                        }
                                        vimCommand = '';
                                        updateStatus();
                                        editor._standaloneKeybindingService._store._toDispose = 
                                            editor._standaloneKeybindingService._store._toDispose.filter(d => d !== replaceDisposable);
                                    };
                                    const replaceDisposable = editor.onKeyDown(replaceHandler);
                                }
                                break;
                            case 's':
                                // Substitute character
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'deleteRight', null);
                                setMode('insert');
                                lastCommand = { type: 's', count: count };
                                break;
                            case 'S':
                                // Substitute line
                                const pos = editor.getPosition();
                                const model = editor.getModel();
                                const lineContent = model.getLineContent(pos.lineNumber);
                                editor.executeEdits('vim', [{
                                    range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, lineContent.length + 1),
                                    text: ''
                                }]);
                                editor.trigger('vim', 'cursorHome', null);
                                setMode('insert');
                                lastCommand = { type: 'S' };
                                break;
                            case 'C':
                                // Change to end of line
                                const cPos = editor.getPosition();
                                const cModel = editor.getModel();
                                const cLineLength = cModel.getLineMaxColumn(cPos.lineNumber);
                                editor.executeEdits('vim', [{
                                    range: new monaco.Range(cPos.lineNumber, cPos.column, cPos.lineNumber, cLineLength),
                                    text: ''
                                }]);
                                setMode('insert');
                                lastCommand = { type: 'C' };
                                break;
                            case 'D':
                                // Delete to end of line
                                const dPos = editor.getPosition();
                                const dModel = editor.getModel();
                                const dLineLength = dModel.getLineMaxColumn(dPos.lineNumber);
                                const deletedText = dModel.getValueInRange(new monaco.Range(dPos.lineNumber, dPos.column, dPos.lineNumber, dLineLength));
                                yankBuffer = deletedText;
                                editor.executeEdits('vim', [{
                                    range: new monaco.Range(dPos.lineNumber, dPos.column, dPos.lineNumber, dLineLength),
                                    text: ''
                                }]);
                                lastCommand = { type: 'D' };
                                break;
                            case 'J':
                                // Join lines
                                editor.trigger('vim', 'editor.action.joinLines', null);
                                lastCommand = { type: 'J' };
                                break;
                            case 'P':
                                // Paste before cursor
                                if (yankBuffer) {
                                    const pPos = editor.getPosition();
                                    editor.executeEdits('vim', [{
                                        range: new monaco.Range(pPos.lineNumber, pPos.column, pPos.lineNumber, pPos.column),
                                        text: yankBuffer
                                    }]);
                                }
                                break;
                            case '~':
                                // Toggle case
                                const tPos = editor.getPosition();
                                const tModel = editor.getModel();
                                const char = tModel.getValueInRange(new monaco.Range(tPos.lineNumber, tPos.column, tPos.lineNumber, tPos.column + 1));
                                const toggled = char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase();
                                editor.executeEdits('vim', [{
                                    range: new monaco.Range(tPos.lineNumber, tPos.column, tPos.lineNumber, tPos.column + 1),
                                    text: toggled
                                }]);
                                editor.trigger('vim', 'cursorRight', null);
                                lastCommand = { type: '~' };
                                break;
                            case '^':
                                // First non-blank character
                                editor.trigger('vim', 'cursorHome', null);
                                const model2 = editor.getModel();
                                const pos2 = editor.getPosition();
                                const line2 = model2.getLineContent(pos2.lineNumber);
                                const firstNonBlank = line2.search(/\\S/);
                                if (firstNonBlank !== -1) {
                                    editor.setPosition({ lineNumber: pos2.lineNumber, column: firstNonBlank + 1 });
                                }
                                break;
                            case '{':
                                // Previous paragraph
                                editor.trigger('vim', 'cursorUp', null);
                                break;
                            case '}':
                                // Next paragraph
                                editor.trigger('vim', 'cursorDown', null);
                                break;
                            case '.':
                                // Repeat last command
                                if (lastCommand) {
                                    switch(lastCommand.type) {
                                        case 's':
                                            for(let i = 0; i < (lastCommand.count || 1); i++) editor.trigger('vim', 'deleteRight', null);
                                            setMode('insert');
                                            break;
                                        case 'S':
                                        case 'C':
                                        case 'D':
                                        case 'J':
                                        case '~':
                                            // Re-execute the command
                                            const fakeEvent = { browserEvent: { key: lastCommand.type }, shiftKey: false, ctrlKey: false, metaKey: false, preventDefault: () => {}, stopPropagation: () => {} };
                                            // This is simplified - in real vim . is more complex
                                            break;
                                    }
                                }
                                break;
                            case '>':
                                if (vimCommand === '>') {
                                    // >> indent line
                                    editor.trigger('vim', 'editor.action.indentLines', null);
                                    vimCommand = '';
                                    lastCommand = { type: '>>' };
                                } else {
                                    vimCommand = '>';
                                    updateStatus();
                                }
                                break;
                            case '<':
                                if (vimCommand === '<') {
                                    // << outdent line
                                    editor.trigger('vim', 'editor.action.outdentLines', null);
                                    vimCommand = '';
                                    lastCommand = { type: '<<' };
                                } else {
                                    vimCommand = '<';
                                    updateStatus();
                                }
                                break;
                            case 'v':
                                setMode('visual');
                                break;
                            case 'V':
                                setMode('visualLine');
                                break;
                            case '%':
                                // Jump to matching bracket
                                editor.trigger('vim', 'editor.action.jumpToBracket', null);
                                break;
                            case '/':
                                // Forward search
                                editor.trigger('vim', 'actions.find', null);
                                break;
                            case '?':
                                // Backward search - open find and set to search backwards
                                editor.trigger('vim', 'actions.find', null);
                                // Note: Monaco's find widget doesn't have direct API to set direction
                                // User will need to click the up arrow or use Shift+Enter
                                statusNode.textContent = 'Search (use Shift+Enter for previous)';
                                setTimeout(() => updateStatus(), 2000);
                                break;
                            case 'n':
                                editor.trigger('vim', 'editor.action.nextMatchFindAction', null);
                                break;
                            case 'N':
                                editor.trigger('vim', 'editor.action.previousMatchFindAction', null);
                                break;
                            case '*':
                                // Search for word under cursor (forward)
                                editor.trigger('vim', 'editor.action.addSelectionToNextFindMatch', null);
                                break;
                            case '#':
                                // Search for word under cursor (backward)
                                editor.trigger('vim', 'editor.action.addSelectionToPreviousFindMatch', null);
                                break;
                            case ':':
                                // Simple command mode
                                const cmd = prompt('Command:');
                                if (cmd === 'w' || cmd === 'write') {
                                    vscode.postMessage({ type: 'updateText', text: editor.getValue() });
                                    statusNode.textContent = 'Saved!';
                                    setTimeout(() => updateStatus(), 1000);
                                } else if (cmd === 'q' || cmd === 'quit') {
                                    statusNode.textContent = 'Cannot quit from webview';
                                    setTimeout(() => updateStatus(), 2000);
                                }
                                break;
                        }
                    }
                    
                    // Visual mode - handle navigation to extend selection
                    if (vimMode === 'visual' || vimMode === 'visualLine') {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        if (e.keyCode === monaco.KeyCode.Escape) {
                            setMode('normal');
                            return;
                        }
                        
                        const count = parseInt(vimCount) || 1;
                        
                        // Navigation in visual mode extends selection
                        switch(key) {
                            case 'h':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorLeftSelect', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'j':
                                if (vimMode === 'visualLine') {
                                    for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorDownSelect', null);
                                } else {
                                    for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorDownSelect', null);
                                }
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'k':
                                if (vimMode === 'visualLine') {
                                    for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorUpSelect', null);
                                } else {
                                    for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorUpSelect', null);
                                }
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'l':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorRightSelect', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'w':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorWordStartRightSelect', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'b':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorWordStartLeftSelect', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case 'e':
                                for(let i = 0; i < count; i++) editor.trigger('vim', 'cursorWordEndRightSelect', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case '0':
                                editor.trigger('vim', 'cursorHomeSelect', null);
                                break;
                            case '$':
                                editor.trigger('vim', 'cursorEndSelect', null);
                                break;
                            case 'g':
                                if (vimCommand === 'g') {
                                    // gg in visual mode
                                    editor.trigger('vim', 'cursorTopSelect', null);
                                    vimCommand = '';
                                    vimCount = '';
                                    updateStatus();
                                } else {
                                    vimCommand = 'g';
                                    updateStatus();
                                }
                                break;
                            case 'G':
                                editor.trigger('vim', 'cursorBottomSelect', null);
                                vimCount = '';
                                updateStatus();
                                break;
                            case '%':
                                // Select to matching bracket
                                const currentPos = editor.getPosition();
                                editor.trigger('vim', 'editor.action.jumpToBracket', null);
                                const newPos = editor.getPosition();
                                // Create selection from visualStart to new position
                                if (visualStart) {
                                    editor.setSelection(new monaco.Selection(
                                        visualStart.lineNumber, visualStart.column,
                                        newPos.lineNumber, newPos.column
                                    ));
                                }
                                break;
                            case 'd':
                            case 'x':
                                const selection = editor.getSelection();
                                const selectedText = editor.getModel().getValueInRange(selection);
                                yankBuffer = selectedText;
                                editor.executeEdits('vim', [{
                                    range: selection,
                                    text: ''
                                }]);
                                setMode('normal');
                                break;
                            case 'y':
                                const sel = editor.getSelection();
                                yankBuffer = editor.getModel().getValueInRange(sel);
                                setMode('normal');
                                break;
                            case 'c':
                                const changeSel = editor.getSelection();
                                yankBuffer = editor.getModel().getValueInRange(changeSel);
                                editor.executeEdits('vim', [{
                                    range: changeSel,
                                    text: ''
                                }]);
                                setMode('insert');
                                break;
                            case '>':
                                editor.trigger('vim', 'editor.action.indentLines', null);
                                setMode('normal');
                                break;
                            case '<':
                                editor.trigger('vim', 'editor.action.outdentLines', null);
                                setMode('normal');
                                break;
                            case 'o':
                                // Toggle cursor to other end of selection
                                const currentSel = editor.getSelection();
                                const newSel = new monaco.Selection(
                                    currentSel.endLineNumber, currentSel.endColumn,
                                    currentSel.startLineNumber, currentSel.startColumn
                                );
                                editor.setSelection(newSel);
                                break;
                            case 'U':
                                // Uppercase selection
                                const upperSel = editor.getSelection();
                                const upperText = editor.getModel().getValueInRange(upperSel).toUpperCase();
                                editor.executeEdits('vim', [{
                                    range: upperSel,
                                    text: upperText
                                }]);
                                setMode('normal');
                                break;
                            case 'u':
                                // Lowercase selection
                                const lowerSel = editor.getSelection();
                                const lowerText = editor.getModel().getValueInRange(lowerSel).toLowerCase();
                                editor.executeEdits('vim', [{
                                    range: lowerSel,
                                    text: lowerText
                                }]);
                                setMode('normal');
                                break;
                            case '~':
                                // Toggle case of selection
                                const toggleSel = editor.getSelection();
                                const toggleText = editor.getModel().getValueInRange(toggleSel);
                                const toggled = toggleText.split('').map(c => 
                                    c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()
                                ).join('');
                                editor.executeEdits('vim', [{
                                    range: toggleSel,
                                    text: toggled
                                }]);
                                setMode('normal');
                                break;
                        }
                        
                        // Handle number input for count in visual mode
                        if (/^[0-9]$/.test(key) && (vimCount || key !== '0')) {
                            vimCount += key;
                            updateStatus();
                        }
                    }
                });
                
                console.log('Proper Vim mode enabled with modal editing');
            }

            // Handle editor changes - but prevent update loop
            let changeTimeout;
            editor.onDidChangeModelContent(() => {
                if (isUpdatingFromExtension) {
                    return; // Don't send updates back when we're updating from extension
                }
                
                // Debounce updates to VS Code
                clearTimeout(changeTimeout);
                changeTimeout = setTimeout(() => {
                    const text = editor.getValue();
                    vscode.postMessage({
                        type: 'updateText',
                        text: text
                    });
                }, 300);
            });
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
            if (editor) {
                editor.getAction('editor.action.formatDocument').run();
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

            const text = editor ? editor.getValue() : '';
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

        // View toggle handlers
        jsonViewBtn.addEventListener('click', () => {
            currentView = 'json';
            jsonViewBtn.classList.add('active');
            tableViewBtn.classList.remove('active');
            responseContent.innerHTML = currentResponseHtml;
        });

        tableViewBtn.addEventListener('click', () => {
            currentView = 'table';
            tableViewBtn.classList.add('active');
            jsonViewBtn.classList.remove('active');
            if (currentResponseData) {
                responseContent.innerHTML = jsonToTable(currentResponseData);
            }
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    if (editor) {
                        isUpdatingFromExtension = true;
                        editor.setValue(message.text);
                        setTimeout(() => {
                            isUpdatingFromExtension = false;
                        }, 100);
                    }
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
                viewToggle.style.display = 'flex';
                
                const jsonString = typeof response.data === 'string' 
                    ? response.data 
                    : JSON.stringify(response.data, null, 2);
                
                currentResponseHtml = \`
                    <div class="response-header">
                        <div class="status-badge status-success">✅ HTTP \${response.statusCode || 200}</div>
                    </div>
                    <pre>\${syntaxHighlightJson(jsonString)}</pre>
                \`;
                
                if (currentView === 'json') {
                    responseContent.innerHTML = currentResponseHtml;
                } else {
                    responseContent.innerHTML = jsonToTable(currentResponseData);
                }
            } else {
                currentResponseData = null;
                formatResponseBtn.style.display = 'none';
                viewToggle.style.display = 'none';
                
                responseContent.innerHTML = \`
                    <div class="response-header">
                        <div class="status-badge status-error">❌ ERROR</div>
                    </div>
                    <pre style="color: #f48771;">\${escapeHtml(response.error || 'Unknown error')}</pre>
                \`;
            }
        }

        function jsonToTable(data) {
            if (typeof data !== 'object' || data === null) {
                return '<pre>' + escapeHtml(String(data)) + '</pre>';
            }

            let html = '<table>';
            
            if (Array.isArray(data)) {
                if (data.length === 0) {
                    return '<div class="empty-state">Empty array</div>';
                }
                
                // Get all unique keys from array objects
                const keys = new Set();
                data.forEach(item => {
                    if (typeof item === 'object' && item !== null) {
                        Object.keys(item).forEach(key => keys.add(key));
                    }
                });
                
                const keyArray = Array.from(keys);
                
                // Table header
                html += '<thead><tr>';
                keyArray.forEach(key => {
                    html += '<th>' + escapeHtml(String(key)) + '</th>';
                });
                html += '</tr></thead>';
                
                // Table body
                html += '<tbody>';
                data.forEach(item => {
                    html += '<tr>';
                    keyArray.forEach(key => {
                        const value = item && typeof item === 'object' ? item[key] : item;
                        const displayValue = typeof value === 'object' 
                            ? JSON.stringify(value) 
                            : String(value !== undefined ? value : '');
                        html += '<td>' + escapeHtml(displayValue) + '</td>';
                    });
                    html += '</tr>';
                });
                html += '</tbody>';
            } else {
                // Single object - show as key-value pairs
                html += '<thead><tr><th>Key</th><th>Value</th></tr></thead>';
                html += '<tbody>';
                Object.keys(data).forEach(key => {
                    const value = data[key];
                    const displayValue = typeof value === 'object' 
                        ? JSON.stringify(value, null, 2) 
                        : String(value);
                    html += '<tr>';
                    html += '<td><strong>' + escapeHtml(key) + '</strong></td>';
                    html += '<td>' + escapeHtml(displayValue) + '</td>';
                    html += '</tr>';
                });
                html += '</tbody>';
            }
            
            html += '</table>';
            return html;
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
