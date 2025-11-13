# Requirements Document

## Introduction

This document specifies the requirements for a VS Code extension that allows users to execute configurable shell commands (PowerShell or Bash) with selected text as input and display the command output in a hover tooltip similar to VS Code's built-in type information hovers.

## Glossary

- **Extension**: The VS Code extension being developed
- **User**: A developer using VS Code with this extension installed
- **Selected Text**: Text highlighted by the User in the VS Code editor
- **Shell Command**: A PowerShell or Bash command configured by the User
- **Hover Tooltip**: A popup window that appears when hovering over text in the editor, similar to VS Code's type information display
- **Command Output**: The result returned from executing the Shell Command
- **Configuration**: User-defined settings stored in VS Code settings

## Requirements

### Requirement 1

**User Story:** As a developer, I want to select text in the editor and execute a custom shell command with that text as input, so that I can quickly process or transform selected content using external tools.

#### Acceptance Criteria

1. WHEN the User selects text in the editor, THE Extension SHALL capture the selected text
2. WHEN the User triggers the command execution action, THE Extension SHALL execute the configured Shell Command with the Selected Text as input
3. THE Extension SHALL support both PowerShell commands on Windows and Bash commands on Unix-based systems
4. WHEN the Shell Command completes execution, THE Extension SHALL capture the Command Output
5. IF the Shell Command fails or times out, THEN THE Extension SHALL capture the error message as Command Output

### Requirement 2

**User Story:** As a developer, I want the command output to appear as a hover tooltip when I hover over the selected text, so that I can view the results without disrupting my workflow.

#### Acceptance Criteria

1. WHEN the Shell Command execution completes successfully, THE Extension SHALL register a hover provider for the Selected Text location
2. WHEN the User hovers over the previously Selected Text, THE Extension SHALL display the Command Output in a Hover Tooltip
3. THE Extension SHALL format the Command Output in the Hover Tooltip with monospace font and preserve line breaks
4. THE Extension SHALL display the Hover Tooltip at the cursor position similar to VS Code's native type hovers
5. WHILE the User moves the cursor away from the Selected Text, THE Extension SHALL dismiss the Hover Tooltip

### Requirement 3

**User Story:** As a developer, I want to configure custom shell commands in VS Code settings, so that I can define different commands for different use cases.

#### Acceptance Criteria

1. THE Extension SHALL provide a Configuration setting for specifying the Shell Command template
2. THE Extension SHALL support a placeholder syntax in the Shell Command template that will be replaced with the Selected Text
3. THE Extension SHALL allow the User to configure the shell type (PowerShell or Bash) in Configuration
4. THE Extension SHALL read Configuration settings from VS Code workspace or user settings
5. WHEN Configuration settings are modified, THE Extension SHALL apply the new settings without requiring a restart

### Requirement 4

**User Story:** As a developer, I want to trigger the command execution through a keyboard shortcut or command palette, so that I can quickly execute commands without using the mouse.

#### Acceptance Criteria

1. THE Extension SHALL register a VS Code command that can be invoked from the command palette
2. THE Extension SHALL provide a default keyboard shortcut for executing the Shell Command
3. WHEN the User invokes the command without Selected Text, THE Extension SHALL display an error message
4. THE Extension SHALL allow the User to customize the keyboard shortcut through VS Code keybindings
5. THE Extension SHALL display the command name clearly in the command palette

### Requirement 5

**User Story:** As a developer, I want visual feedback while the command is executing, so that I know the extension is processing my request.

#### Acceptance Criteria

1. WHEN the Shell Command execution starts, THE Extension SHALL display a progress indicator in the status bar
2. THE Extension SHALL set a timeout limit of 30 seconds for Shell Command execution
3. IF the Shell Command execution exceeds the timeout limit, THEN THE Extension SHALL terminate the process and display a timeout error
4. WHEN the Shell Command execution completes, THE Extension SHALL remove the progress indicator
5. IF the Shell Command execution fails, THEN THE Extension SHALL display an error notification with the failure reason
