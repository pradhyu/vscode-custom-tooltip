# Implementation Plan

- [x] 1. Set up VS Code extension project structure
  - Initialize extension project using Yeoman generator or manual setup
  - Configure TypeScript with appropriate compiler options
  - Set up package.json with extension metadata and activation events
  - Configure extension manifest with command and configuration contributions
  - _Requirements: 1.1, 3.1, 4.1_

- [x] 2. Implement Configuration Manager
  - [x] 2.1 Create configuration schema in package.json
    - Define commandTemplate, shellType, and timeout settings
    - Set appropriate default values and descriptions
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 2.2 Implement ConfigManager class
    - Write getConfig() method to read VS Code settings
    - Implement configuration change listener with callback support
    - Add validation for configuration values
    - _Requirements: 3.4, 3.5_

- [x] 3. Implement Command Executor
  - [x] 3.1 Create CommandExecutor class with shell command building
    - Implement placeholder replacement in command template
    - Add input sanitization to prevent command injection
    - Support both PowerShell and Bash command formats
    - _Requirements: 1.2, 1.3_
  
  - [x] 3.2 Implement command execution with child_process
    - Use spawn() to execute shell commands
    - Capture stdout and stderr streams
    - Implement 30-second timeout mechanism
    - Handle process termination on timeout
    - _Requirements: 1.2, 1.4, 1.5, 5.2, 5.3_
  
  - [x] 3.3 Add error handling and result formatting
    - Capture and format error messages
    - Return structured CommandResult with success status
    - Handle edge cases (empty output, large output)
    - _Requirements: 1.4, 1.5, 5.5_

- [x] 4. Implement Hover Manager
  - [x] 4.1 Create HoverManager class with output storage
    - Implement Map-based storage for document outputs
    - Write storeOutput() method to save command results
    - Add timestamp tracking for cleanup
    - _Requirements: 2.1_
  
  - [x] 4.2 Implement hover provider
    - Create provideHover() method implementing VS Code HoverProvider interface
    - Implement range intersection logic to find matching output
    - Format output as Markdown code block for tooltip display
    - _Requirements: 2.2, 2.3, 2.4_
  
  - [x] 4.3 Add cleanup mechanisms
    - Implement periodic cleanup of stale hover data (older than 1 hour)
    - Clear hover data when documents are closed
    - Handle document edits that invalidate ranges
    - _Requirements: 2.5_

- [x] 5. Implement main extension command
  - [x] 5.1 Create command handler in extension.ts
    - Get active editor and selected text
    - Validate that text is selected
    - Show error message if no selection exists
    - _Requirements: 1.1, 4.3_
  
  - [x] 5.2 Integrate command execution with progress feedback
    - Show progress indicator in status bar when execution starts
    - Call CommandExecutor with selected text and configuration
    - Remove progress indicator when execution completes
    - _Requirements: 5.1, 5.4_
  
  - [x] 5.3 Handle execution results and store for hover
    - Store successful output in HoverManager
    - Store error output in HoverManager for debugging
    - Show error notification if command fails
    - _Requirements: 2.1, 5.5_

- [x] 6. Wire up extension activation and registration
  - [x] 6.1 Implement activate() function
    - Register the command with VS Code
    - Register hover provider for all document types
    - Initialize ConfigManager, CommandExecutor, and HoverManager
    - Set up configuration change listeners
    - _Requirements: 3.5, 4.1, 4.2_
  
  - [x] 6.2 Configure keyboard shortcut and command palette
    - Add default keybinding in package.json
    - Ensure command appears in command palette with clear name
    - _Requirements: 4.1, 4.2, 4.4, 4.5_
  
  - [x] 6.3 Implement deactivate() function
    - Clean up resources and dispose of subscriptions
    - Clear all stored hover data
    - _Requirements: N/A_

- [ ]* 7. Add unit tests for core components
  - Write tests for CommandExecutor placeholder replacement and sanitization
  - Write tests for HoverManager storage and range intersection
  - Write tests for ConfigManager settings reading
  - Mock VS Code API and child_process for isolated testing
  - _Requirements: All requirements (validation)_

- [x] 8. Create extension documentation
  - [x] 8.1 Write README.md with usage instructions
    - Document how to configure command templates
    - Provide example commands for common use cases
    - Include screenshots of hover tooltip
    - _Requirements: 3.1, 3.2, 4.1_
  
  - [x] 8.2 Add CHANGELOG.md
    - Document initial release features
    - _Requirements: N/A_
