import * as vscode from 'vscode';

interface StoredOutput {
    output: string;
    range: vscode.Range;
    timestamp: number;
}

interface DocumentHoverData {
    uri: string;
    outputs: StoredOutput[];
}

export class HoverManager implements vscode.HoverProvider {
    private hoverData: Map<string, DocumentHoverData> = new Map();
    private cleanupInterval: NodeJS.Timeout | undefined;
    private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    private readonly MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
    
    constructor() {
        this.startCleanupTimer();
    }
    
    storeOutput(document: vscode.TextDocument, range: vscode.Range, output: string): void {
        const uri = document.uri.toString();
        
        if (!this.hoverData.has(uri)) {
            this.hoverData.set(uri, {
                uri,
                outputs: []
            });
        }
        
        const docData = this.hoverData.get(uri)!;
        
        // Remove any existing output for the same range
        docData.outputs = docData.outputs.filter(stored => !stored.range.isEqual(range));
        
        // Add new output
        docData.outputs.push({
            output,
            range,
            timestamp: Date.now()
        });
    }

    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
        const uri = document.uri.toString();
        const docData = this.hoverData.get(uri);
        
        if (!docData) {
            return null;
        }
        
        // Find output for the position
        for (const stored of docData.outputs) {
            if (stored.range.contains(position)) {
                // Format output as Markdown code block
                const markdown = new vscode.MarkdownString();
                markdown.appendCodeblock(stored.output, 'text');
                
                return new vscode.Hover(markdown, stored.range);
            }
        }
        
        return null;
    }
    
    clearOutput(document: vscode.TextDocument, range: vscode.Range): void {
        const uri = document.uri.toString();
        const docData = this.hoverData.get(uri);
        
        if (docData) {
            docData.outputs = docData.outputs.filter(stored => !stored.range.isEqual(range));
            
            // Remove document data if no outputs remain
            if (docData.outputs.length === 0) {
                this.hoverData.delete(uri);
            }
        }
    }

    private startCleanupTimer(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanupStaleData();
        }, this.CLEANUP_INTERVAL_MS);
    }
    
    private cleanupStaleData(): void {
        const now = Date.now();
        
        for (const [uri, docData] of this.hoverData.entries()) {
            // Remove outputs older than MAX_AGE_MS
            docData.outputs = docData.outputs.filter(stored => 
                now - stored.timestamp < this.MAX_AGE_MS
            );
            
            // Remove document data if no outputs remain
            if (docData.outputs.length === 0) {
                this.hoverData.delete(uri);
            }
        }
    }
    
    onDocumentClosed(document: vscode.TextDocument): void {
        const uri = document.uri.toString();
        this.hoverData.delete(uri);
    }
    
    onDocumentChanged(document: vscode.TextDocument): void {
        // For now, we keep the hover data even when document changes
        // In a more sophisticated implementation, we could track edits
        // and adjust ranges accordingly
    }
    
    dispose(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.hoverData.clear();
    }
}
