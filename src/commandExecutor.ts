import { spawn } from 'child_process';
import { ShellType } from './configManager';

export interface CommandResult {
    success: boolean;
    output: string;
    error?: string;
}

export class CommandExecutor {
    
    async execute(selectedText: string, commandTemplate: string, shellType: ShellType, timeout: number): Promise<CommandResult> {
        const sanitizedInput = this.sanitizeInput(selectedText);
        const command = this.buildCommand(commandTemplate, sanitizedInput, shellType);
        
        return this.executeCommand(command, shellType, timeout);
    }
    
    private sanitizeInput(input: string): string {
        // Escape special characters to prevent command injection
        // For shell commands, we need to escape quotes and special characters
        return input
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'")
            .replace(/`/g, '\\`')
            .replace(/\$/g, '\\$');
    }
    
    private buildCommand(template: string, sanitizedInput: string, shellType: ShellType): string {
        // Replace {{input}} placeholder with sanitized input
        let command = template.replace(/\{\{input\}\}/g, sanitizedInput);
        
        // For PowerShell, wrap the command appropriately
        if (shellType === ShellType.PowerShell) {
            command = command.replace(/'/g, "''"); // Escape single quotes for PowerShell
        }
        
        return command;
    }

    private executeCommand(command: string, shellType: ShellType, timeout: number): Promise<CommandResult> {
        return new Promise((resolve) => {
            const shell = shellType === ShellType.PowerShell ? 'powershell.exe' : '/bin/bash';
            const shellArgs = shellType === ShellType.PowerShell ? ['-Command', command] : ['-c', command];
            
            const process = spawn(shell, shellArgs);
            
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            
            // Set up timeout
            const timeoutId = setTimeout(() => {
                timedOut = true;
                process.kill();
            }, timeout);
            
            // Capture stdout
            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            // Capture stderr
            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            // Handle process completion
            process.on('close', (code) => {
                clearTimeout(timeoutId);
                
                if (timedOut) {
                    resolve({
                        success: false,
                        output: '',
                        error: `Command execution timed out after ${timeout}ms`
                    });
                } else if (code !== 0) {
                    resolve({
                        success: false,
                        output: stdout,
                        error: stderr || `Command exited with code ${code}`
                    });
                } else {
                    resolve({
                        success: true,
                        output: stdout || stderr
                    });
                }
            });
            
            // Handle process errors
            process.on('error', (error) => {
                clearTimeout(timeoutId);
                resolve({
                    success: false,
                    output: '',
                    error: `Failed to execute command: ${error.message}`
                });
            });
        });
    }
}
