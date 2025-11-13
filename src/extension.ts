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
    
    // Register command
    const commandDisposable = vscode.commands.registerCommand('commandOutputHover.executeCommand', async () => {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }
        
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        
        if (!selectedText || selectedText.trim().length === 0) {
            vscode.window.showErrorMessage('Please select text before executing command');
            return;
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
    }, async (progress) => {
        try {
            // Execute command
            const result = await commandExecutor.execute(
                selectedText,
                config.commandTemplate,
                config.shellType,
                config.timeout
            );
            
            // Handle result and store for hover
            handleExecutionResult(editor, selection, result);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Command execution failed: ${error}`);
        }
    });
}

function handleExecutionResult(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    result: any
): void {
    const range = new vscode.Range(selection.start, selection.end);
    
    if (result.success) {
        // Store successful output
        hoverManager.storeOutput(editor.document, range, result.output);
        vscode.window.showInformationMessage('Command executed successfully. Hover over the selection to see output.');
    } else {
        // Store error output for debugging
        const errorOutput = result.error || 'Unknown error';
        hoverManager.storeOutput(editor.document, range, `Error: ${errorOutput}`);
        
        // Show error notification
        const firstLine = errorOutput.split('\n')[0];
        vscode.window.showErrorMessage(`Command failed: ${firstLine}`);
    }
}

export function deactivate() {
    if (hoverManager) {
        hoverManager.dispose();
    }
}
