# Proofly MCP Integration

This document describes two ways to integrate Proofly's deepfake detection capabilities with Model Context Protocol (MCP) compatible clients:

1.  **Via a Hosted MCP Server (`https://mcp.proofly.ai`)**: For clients that connect to MCP servers using a URL (e.g., Cursor, Cascade/Windsurf).
2.  **Via a Local CLI MCP Server (`proofly-mcp` npm package)**: For clients that can execute a local command for an MCP server (e.g., Claude Desktop).

Both integration methods ultimately use the Proofly API (`https://api.proofly.ai`) for analysis.

<a href="https://glama.ai/mcp/servers/@Proofly-AI/mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Proofly-AI/mcp/badge" alt="Proofly Integration MCP server" />
</a>

---

## 1. Using the Hosted MCP Server (`https://mcp.proofly.ai`)

This is the recommended method for MCP clients that connect to servers via HTTP/SSE URLs, such as Cursor, Cascade/Windsurf, etc.

### Configuration Examples (for URL-based clients)

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

**Note:** The `mcp.proofly.ai` server is a separate deployment. This `proofly-mcp` npm package is *not* used to run or configure `mcp.proofly.ai`.

---

## 2. Using the Local CLI MCP Server (`proofly-mcp` npm package)

This `proofly-mcp` npm package provides a command-line tool that acts as an MCP server. It's designed for MCP clients that can execute a local command and communicate with it via stdio (e.g., Claude Desktop).

### Features of `proofly-mcp` CLI

- Acts as a local MCP server communicating via stdio.
- Analyzes images for deepfake detection (from Base64 or URL).
- Checks session status for an analysis.
- Gets detailed information about specific detected faces.

### Installation of `proofly-mcp` CLI

**Global Installation (Recommended for direct use by clients like Claude Desktop):**

```bash
npm install -g proofly-mcp
```

**Local Installation (For programmatic use or if preferred):**

```bash
npm install proofly-mcp
```

### Environment Variables for `proofly-mcp` CLI (Optional)

- `PROOFLY_API_KEY`: Your Proofly API key. The `proofly-mcp` CLI will use this API key if the variable is set when communicating with Proofly API `https://get.proofly.ai`.

### Configuration Examples (for command-based clients using `proofly-mcp`)

**Claude Desktop:**

Add to your Claude Desktop config file (e.g., `claude_desktop_config.json`). The recommended way is to use `npx` to ensure you are running the latest version without requiring a global install:

```json
{
  "mcpServers": {
    "proofly": {
      "command": "npx",
      "args": [
        "-y", // The -y flag might be specific to your npm/npx version or aliasing for auto-confirmation.
              // Alternatively, for most npx versions: "proofly-mcp@latest"
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

- Claude Desktop will execute the specified command, which then acts as the MCP server.

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

## Available MCP Methods

The following methods are supported by **both** the `https://mcp.proofly.ai` hosted server and the `proofly-mcp` CLI server.

### analyze-image

Analyzes an image provided as a base64 string for deepfake detection.

Parameters:
- `imageBase64: string` - Base64 encoded image data.
- `filename: string` - Original filename with extension (e.g., 'image.jpg').
- `format: "text" | "json"` (optional, default: "text") - Output format.

### analyze

Analyzes an image from a URL for deepfake detection.

Parameters:
- `imageUrl: string` - URL of the image to analyze.
- `format: "text" | "json"` (optional, default: "text") - Output format.

### check-session-status

Checks the status of a deepfake analysis session.

Parameters:
- `sessionUuid: string` - Session UUID to check status for.
- `format: "text" | "json"` (optional, default: "text") - Output format.

### get-face-details

Gets detailed information about a specific face detected in an image analysis session.

Parameters:
- `sessionUuid: string` - Session UUID from a previous analysis.
- `faceIndex: number` - Index of the face to get details for (starting from 0).
- `format: "text" | "json"` (optional, default: "text") - Output format.