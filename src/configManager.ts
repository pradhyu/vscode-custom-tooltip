import * as vscode from 'vscode';

export enum ShellType {
    Bash = 'bash',
    PowerShell = 'powershell'
}

export interface ExtensionConfig {
    commandTemplate: string;
    shellType: ShellType;
    timeout: number;
}

export class ConfigManager {
    private static readonly CONFIG_SECTION = 'commandOutputHover';
    
    getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        
        const commandTemplate = config.get<string>('commandTemplate', 'echo {{input}}');
        const shellType = config.get<string>('shellType', 'bash') as ShellType;
        const timeout = config.get<number>('timeout', 30000);
        
        // Validate configuration
        this.validateConfig(commandTemplate, shellType, timeout);
        
        return {
            commandTemplate,
            shellType,
            timeout
        };
    }
    
    onConfigChange(callback: (config: ExtensionConfig) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(ConfigManager.CONFIG_SECTION)) {
                callback(this.getConfig());
            }
        });
    }
    
    private validateConfig(commandTemplate: string, shellType: string, timeout: number): void {
        if (!commandTemplate.includes('{{input}}')) {
            vscode.window.showWarningMessage(
                'Command template does not contain {{input}} placeholder. Using default template.'
            );
        }
        
        if (shellType !== ShellType.Bash && shellType !== ShellType.PowerShell) {
            vscode.window.showWarningMessage(
                `Invalid shell type: ${shellType}. Using default (bash).`
            );
        }
        
        if (timeout <= 0 || timeout > 300000) {
            vscode.window.showWarningMessage(
                `Invalid timeout: ${timeout}ms. Using default (30000ms).`
            );
        }
    }
}
