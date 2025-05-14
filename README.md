# Proofly MCP Integration

Install and just write 'proofly it' `URL to content` or analyze it `URL to content` for deepfake face swap analysis.

1.  **For clients that connect to MCP servers using a URL (e.g., Cursor, Cascade/Windsurf)**

Add one of the following configurations to your MCP client (e.g., in `mcp_config.json`):

**A. Streaming (SSE - Recommended where supported):**

```json
{
  "proofly": {
    "serverUrl": "https://mcp.proofly.ai/sse",
    "supportedMethods": [
      "analyze-image",
      "analyze",
      "get-face-details",
      "check-session-status"
    ],
    "auth": { "type": "none" } // Or your specific auth if Proofly API https:/get.proofly.ai requires it
  }
}
```

**B. Standard HTTP (Non-streaming):**

```json
{
  "proofly": {
    "serverUrl": "https://mcp.proofly.ai/mcp",
    "supportedMethods": [
      "analyze-image",
      "analyze",
      "get-face-details",
      "check-session-status"
    ],
    "auth": { "type": "none" } // Or your specific auth if Proofly API https:/get.proofly.ai requires it
  }
}
```

2.  **For clients that can execute a local command for an MCP server (e.g., Claude Desktop)**

**Claude Desktop:**

1. Run: npx proofly-mcp@latest
2. Add to your Claude Desktop config file (e.g., `claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "proofly": {
      "command": "npx",
      "args": [
        "-y", // The -y flag might be specific to your npm/npx version or aliasing for auto-confirmation.
        "proofly-mcp@latest"
      ],
      "supportedMethods": [
        "analyze-image",
        "analyze",
        "get-face-details",
        "check-session-status"
      ]
    }
  }
}
```

*Alternatively, if you have `proofly-mcp` installed globally (`npm install -g proofly-mcp`), you can use:*

```json
{
  "mcpServers": {
    "proofly": {
      "command": "proofly-mcp",
      "args": [],
      "supportedMethods": [
        "analyze-image",
        "analyze",
        "get-face-details",
        "check-session-status"
      ]
    }
  }
}
```


**Other command-capable MCP Clients:**

If your MCP client can launch a local command, configure it to run `proofly-mcp`.
Conceptual example (actual config varies by client):

```json
{
  "mcpServers": {
    "proofly": {
      "type": "command",
      "command": "proofly-mcp",
      "supportedMethods": [
        "analyze-image",
        "analyze",
        "get-face-details",
        "check-session-status"
      ]
    }
  }
}
```

---

### Environment Variables for `proofly-mcp` CLI (Optional)

- `PROOFLY_API_KEY`: Your Proofly API key. The `proofly-mcp` CLI will use this API key if the variable is set when communicating with Proofly API `https://get.proofly.ai`.

---

## Available MCP Methods

### analyze

Analyzes an image from a URL for deepfake detection.

### analyze-image

Analyzes an image provided as a base64 string for deepfake detection.

### check-session-status

Checks the status of a deepfake analysis session.

### get-face-details

Gets detailed information about a specific face detected in an image analysis session.

