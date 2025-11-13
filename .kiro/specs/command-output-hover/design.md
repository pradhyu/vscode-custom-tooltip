# Design Document

## Overview

This VS Code extension enables users to execute configurable shell commands with selected text as input and display the output in hover tooltips. The extension integrates with VS Code's command system, hover provider API, and configuration system to provide a seamless experience.

## Architecture

The extension follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Extension                     │
├─────────────────────────────────────────────────────────┤
│  Extension Activation & Registration                     │
│  ├─ Command Registration                                 │
│  ├─ Hover Provider Registration                          │
│  └─ Configuration Listener                               │
├─────────────────────────────────────────────────────────┤
│  Command Executor                                        │
│  ├─ Shell Command Builder                                │
│  ├─ Process Manager                                      │
│  └─ Output Capture                                       │
├─────────────────────────────────────────────────────────┤
│  Hover Manager                                           │
│  ├─ Output Storage                                       │
│  ├─ Hover Provider Implementation                        │
│  └─ Tooltip Formatter                                    │
├─────────────────────────────────────────────────────────┤
│  Configuration Manager                                   │
│  └─ Settings Reader                                      │
└─────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Extension Entry Point (`extension.ts`)

**Responsibilities:**
- Activate the extension when VS Code starts
- Register commands and hover providers
- Set up configuration change listeners
- Manage extension lifecycle

**Key Functions:**
```typescript
export function activate(context: vscode.ExtensionContext): void
export function deactivate(): void
```

### 2. Command Executor (`commandExecutor.ts`)

**Responsibilities:**
- Build shell commands with selected text
- Execute commands in appropriate shell (PowerShell/Bash)
- Handle timeouts and errors
- Capture and return output

**Interface:**
```typescript
interface CommandExecutor {
  execute(selectedText: string, command: string, shellType: ShellType): Promise<CommandResult>
}

interface CommandResult {
  success: boolean
  output: string
  error?: string
}

enum ShellType {
  PowerShell = 'powershell',
  Bash = 'bash'
}
```

**Implementation Details:**
- Use Node.js `child_process.spawn()` for command execution
- Implement 30-second timeout using `AbortController` or process kill
- Escape special characters in selected text to prevent injection
- Capture both stdout and stderr streams

### 3. Hover Manager (`hoverManager.ts`)

**Responsibilities:**
- Store command outputs mapped to document positions
- Provide hover information when requested
- Format output for display in tooltips
- Clean up stale hover data

**Interface:**
```typescript
interface HoverManager {
  storeOutput(document: vscode.TextDocument, range: vscode.Range, output: string): void
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover>
  clearOutput(document: vscode.TextDocument, range: vscode.Range): void
}

interface StoredOutput {
  output: string
  range: vscode.Range
  timestamp: number
}
```

**Implementation Details:**
- Use a Map with document URI as key and array of StoredOutput as value
- Implement range intersection checking for hover position
- Format output as Markdown code block for proper rendering
- Clean up outputs older than 1 hour or when document closes

### 4. Configuration Manager (`configManager.ts`)

**Responsibilities:**
- Read extension configuration from VS Code settings
- Provide default values
- Notify when configuration changes

**Interface:**
```typescript
interface ExtensionConfig {
  commandTemplate: string
  shellType: ShellType
  timeout: number
  placeholder: string
}

interface ConfigManager {
  getConfig(): ExtensionConfig
  onConfigChange(callback: (config: ExtensionConfig) => void): vscode.Disposable
}
```

**Configuration Schema:**
```json
{
  "commandOutputHover.commandTemplate": {
    "type": "string",
    "default": "echo {{input}}",
    "description": "Shell command template. Use {{input}} as placeholder for selected text."
  },
  "commandOutputHover.shellType": {
    "type": "string",
    "enum": ["bash", "powershell"],
    "default": "bash",
    "description": "Shell type to use for command execution."
  },
  "commandOutputHover.timeout": {
    "type": "number",
    "default": 30000,
    "description": "Command execution timeout in milliseconds."
  }
}
```

## Data Models

### Command Execution Flow

```typescript
// Selected text from editor
interface Selection {
  text: string
  range: vscode.Range
  document: vscode.TextDocument
}

// Command execution request
interface ExecutionRequest {
  selection: Selection
  config: ExtensionConfig
}

// Command execution result
interface ExecutionResult {
  success: boolean
  output: string
  error?: string
  executionTime: number
}
```

### Hover Data Storage

```typescript
// In-memory storage structure
Map<string, DocumentHoverData>

interface DocumentHoverData {
  uri: string
  outputs: StoredOutput[]
}

interface StoredOutput {
  range: vscode.Range
  output: string
  timestamp: number
}
```

## Error Handling

### Command Execution Errors

1. **No Selection Error**
   - Detect when command is invoked without text selection
   - Display error message: "Please select text before executing command"
   - Do not attempt command execution

2. **Command Timeout**
   - Kill process after configured timeout (default 30s)
   - Display error notification: "Command execution timed out"
   - Store timeout error in hover data

3. **Command Failure**
   - Capture stderr output
   - Display error notification with first line of error
   - Store full error output in hover data for inspection

4. **Invalid Configuration**
   - Validate command template contains placeholder
   - Validate shell type is supported on current platform
   - Display warning and use safe defaults

### Hover Provider Errors

1. **Document Closed**
   - Clean up hover data when document is closed
   - Return null from hover provider if document not found

2. **Range Mismatch**
   - Handle document edits that invalidate stored ranges
   - Clear stale hover data on document change events

## Testing Strategy

### Unit Tests

1. **Command Executor Tests**
   - Test command template parsing and placeholder replacement
   - Test shell command execution with mock processes
   - Test timeout handling
   - Test error capture and formatting

2. **Hover Manager Tests**
   - Test output storage and retrieval
   - Test range intersection logic
   - Test cleanup of stale data
   - Test Markdown formatting

3. **Configuration Manager Tests**
   - Test configuration reading with defaults
   - Test configuration change notifications
   - Test validation logic

### Integration Tests

1. **End-to-End Command Execution**
   - Test full flow from command invocation to hover display
   - Test with both PowerShell and Bash commands
   - Test with various text selections

2. **VS Code API Integration**
   - Test command registration and invocation
   - Test hover provider registration
   - Test configuration reading from workspace settings

### Manual Testing Scenarios

1. Select text and execute simple echo command
2. Execute command that takes several seconds
3. Execute command that fails with error
4. Hover over text after command execution
5. Edit document and verify hover data updates
6. Change configuration and verify new settings apply
7. Test on both Windows (PowerShell) and Unix (Bash)

## Implementation Notes

### Platform Considerations

- Detect platform using `process.platform`
- Default to PowerShell on Windows, Bash on Unix-like systems
- Allow manual override via configuration
- Handle path differences (Windows backslashes vs Unix forward slashes)

### Security Considerations

- Sanitize selected text to prevent command injection
- Use parameterized command execution where possible
- Warn users about executing untrusted commands
- Consider adding confirmation dialog for potentially dangerous commands

### Performance Considerations

- Limit stored hover data to prevent memory leaks
- Use debouncing for configuration change handlers
- Clean up hover data periodically (every 5 minutes)
- Limit maximum output size to 10KB per hover

### User Experience

- Show progress indicator in status bar during execution
- Use appropriate icons for success/error notifications
- Format output with syntax highlighting when possible
- Provide clear error messages with actionable suggestions
