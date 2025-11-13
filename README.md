# Command Output Hover

Execute shell commands with selected text and view the output in hover tooltips.

## Features

- Execute custom shell commands (Bash or PowerShell) with selected text as input
- View command output in hover tooltips when you hover over the selected text
- Configurable command templates with placeholder syntax
- Support for both Bash and PowerShell
- Visual progress feedback during command execution
- Configurable timeout for command execution

## Usage

1. Select text in the editor (or place cursor on a word)
2. Press `Ctrl+Shift+E` (or `Cmd+Shift+E` on Mac) or use the command palette to run "Execute Command with Selection"
3. The command output will appear in a popup panel immediately
4. Hover over the text to see a rich tooltip with a preview of the output
5. Click the link in the tooltip to view the full output in a popup panel

**Note:** If no text is selected, the extension will automatically use the word under the cursor.

### Viewing Output

- **Immediate popup**: After command execution, output appears in a side panel
- **Rich hover tooltip**: Hover over the text to see a preview with ✅/❌ icon
- **Full output link**: Click the link in the tooltip to open the complete output in a popup

## Configuration

Configure the extension in your VS Code settings:

### `commandOutputHover.commandTemplate`

The shell command template to execute. Use `{{input}}` as a placeholder for the selected text.

**Default:** `echo {{input}}`

**Examples:**
- `echo {{input}} | wc -w` - Count words in selection
- `echo {{input}} | tr '[:lower:]' '[:upper:]'` - Convert to uppercase
- `curl -s "https://api.example.com/lookup?q={{input}}"` - API lookup

### `commandOutputHover.shellType`

The shell type to use for command execution.

**Options:** `bash`, `powershell`

**Default:** `bash`

### `commandOutputHover.timeout`

Command execution timeout in milliseconds.

**Default:** `30000` (30 seconds)

## Example Use Cases

### Word Count
```json
{
  "commandOutputHover.commandTemplate": "echo {{input}} | wc -w",
  "commandOutputHover.shellType": "bash"
}
```

### Convert to Uppercase
```json
{
  "commandOutputHover.commandTemplate": "echo {{input}} | tr '[:lower:]' '[:upper:]'",
  "commandOutputHover.shellType": "bash"
}
```

### Base64 Encode
```json
{
  "commandOutputHover.commandTemplate": "echo -n {{input}} | base64",
  "commandOutputHover.shellType": "bash"
}
```

### Dictionary Lookup (requires curl and jq)
```json
{
  "commandOutputHover.commandTemplate": "curl -s 'https://api.dictionaryapi.dev/api/v2/entries/en/{{input}}' | jq -r '.[0].meanings[0].definitions[0].definition'",
  "commandOutputHover.shellType": "bash"
}
```

### PowerShell String Length
```json
{
  "commandOutputHover.commandTemplate": "('{{input}}').Length",
  "commandOutputHover.shellType": "powershell"
}
```

## Keyboard Shortcuts

- `Ctrl+Shift+E` (Windows/Linux) or `Cmd+Shift+E` (Mac) - Execute command with selection

You can customize the keyboard shortcut in VS Code's Keyboard Shortcuts settings.

## Requirements

- VS Code 1.80.0 or higher
- Bash (on Unix-like systems) or PowerShell (on Windows)

## Known Limitations

- Command output is limited to prevent memory issues
- Hover data is cleared after 1 hour or when the document is closed
- Document edits may affect hover positioning

## Security Note

Be cautious when executing commands with untrusted input. The extension sanitizes input to prevent command injection, but you should still be careful with the commands you configure.

## Release Notes

### 0.0.1

Initial release with core functionality:
- Command execution with selected text
- Hover tooltip display
- Configurable command templates
- Support for Bash and PowerShell
