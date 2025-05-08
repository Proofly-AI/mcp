#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPackageVersion() {
  try {
    const packageJsonPath = path.join(__dirname, 'package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    return packageJson.version || 'unknown';
  } catch (error) {
    logError('Failed to read package.json for version:', error);
    return 'unknown';
  }
}

const PACKAGE_VERSION = getPackageVersion();

const PROOFLY_CONFIG = {
  baseUrl: "https://api.proofly.ai",
  apiKey: process.env.PROOFLY_API_KEY,
  maxRetries: 60, 
  retryInterval: 2000 
};

function logError(...args) {
  console.error(`[${new Date().toISOString()}] [ProoflyMCPError]`, ...args);
}

function logInfo(...args) {
  console.error(`[${new Date().toISOString()}] [ProoflyMCPInfo]`, ...args);
}

// Helper function to determine Content-Type by filename extension
function getContentTypeFromFilename(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  const contentTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'tiff': 'image/tiff',
    'tif': 'image/tiff'
  };
  return contentTypes[extension] || 'application/octet-stream'; 
}

// Helper function to determine verdict based on probability
function getVerdict(probability) {
  if (probability === null || typeof probability === 'undefined') return "Uncertain (no score)";
  if (probability > 0.8) {
    return "Likely Real";
  } else if (probability < 0.2) {
    return "Likely Fake";
  } else {
    return "Uncertain";
  }
}

// Helper function to format results in a human-readable form
function formatResultsToHumanReadable(result) {
  if (!result) return "Error: No result to format.";

  let output = `**Image Analysis Results:**\n`;
  
  output += `* Session UUID: ${result.uuid || 'N/A'}\n`;
  if (result.sha256) {
    output += `* SHA256 hash: ${result.sha256}\n`;
  }
  output += `* Status: ${result.status || 'N/A'}\n`;
  
  if (result.message && (result.status === 'no_faces_found' || result.status === 'no faces found')) {
    output += `* Message: ${result.message}\n`;
  } else if (result.faces && result.faces.length > 0) {
    output += `* Faces detected: ${result.total_faces || result.faces.length}\n\n`;
    
    result.faces.forEach((face, index) => {
      const faceVerdict = getVerdict(face.ansamble);
      output += `**Face ${index + 1}:**\n`;
      output += `* Verdict: **${faceVerdict}**\n`;
      if (typeof face.ansamble !== 'undefined' && face.ansamble !== null) {
        output += `* Probability "real": ${(face.ansamble * 100).toFixed(2)}%, "fake": ${(100 - face.ansamble * 100).toFixed(2)}%\n`;
      }
      if (face.is_real_model_1 !== undefined) { 
        output += `* Individual model results:\n`;
        for (let i = 1; i <= 10; i++) {
          if (face[`is_real_model_${i}`] !== undefined) {
            output += `  - Model ${i}: ${(face[`is_real_model_${i}`] * 100).toFixed(2)}%\n`;
          }
        }
      }
      if (face.face_path) {
        let faceImageUrl = `${PROOFLY_CONFIG.baseUrl}${face.face_path}`;
        if (faceImageUrl.includes('ai./')) {
          faceImageUrl = faceImageUrl.replace('ai./', 'ai/');
        }
        output += `* Face image URL: ${faceImageUrl}\n`;
      }
      output += `\n`;
    });
  } else if (result.status === 'done' || result.status === 'completed') { // If status is done but no faces
    output += `* No faces detected in the image\n\n`;
  } else if (!result.message) { // If there is no message and no faces (just in case)
    output += `* No specific face data available or an issue occurred during processing.\n\n`;
  }
  

  output += `For unlimited speed access and additional features, register at check.proofly.ai\n`;
  return output;
}

class ProoflyMcpServer {
  constructor() {
    logInfo(`Proofly MCP Server v${PACKAGE_VERSION} starting...`);
    logInfo(`Node.js version: ${process.version}`);
    logInfo(`PID: ${process.pid}`);

    if (!PROOFLY_CONFIG.apiKey) {
      logInfo("Warning: PROOFLY_API_KEY environment variable is not set. This might be required for some configurations or future use.");
    }

    this.mcpServer = new Server(
      {
        name: "proofly",
        version: PACKAGE_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupErrorHandlers();
    this.setupSignalHandlers();
    this.setupToolHandlers();
  }

  setupErrorHandlers() {
    this.mcpServer.onerror = (error) => {
      logError("MCP Server internal error:", error);
    };

    process.on('uncaughtException', (err, origin) => {
      logError('Uncaught Exception:', err, 'Origin:', origin);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logError('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  setupSignalHandlers() {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        logInfo(`Received ${signal}. Shutting down gracefully.`);
        try {
          await this.mcpServer.close();
          logInfo("MCP Server closed successfully.");
        } catch (e) {
          logError("Error during MCP server shutdown:", e);
        } finally {
          process.exit(0);
        }
      });
    });
  }

  setupToolHandlers() {
    const tools = [
      {
        name: "analyze-image",
        description: "Analyzes an image provided as a base64 string for deepfake detection.",
        inputSchema: {
          type: "object",
          properties: {
            imageBase64: { type: "string", description: "Base64 encoded image data." },
            filename: { type: "string", description: "Original filename with extension (e.g., 'image.jpg')." },
            format: { type: "string", enum: ["json", "text"], default: "text", description: "Output format." },
          },
          required: ["imageBase64", "filename"],
        },
      },
      {
        name: "analyze",
        description: "Analyzes an image from a URL for deepfake detection.",
        inputSchema: {
          type: "object",
          properties: {
            imageUrl: { type: "string", description: "URL of the image to analyze." },
            format: { type: "string", enum: ["json", "text"], default: "text", description: "Output format." },
          },
          required: ["imageUrl"],
        },
      },
      {
        name: "check-session-status",
        description: "Check the status of a deepfake analysis session.",
        inputSchema: {
          type: "object",
          properties: {
            sessionUuid: { type: "string", description: "Session UUID to check status for." },
            format: { type: "string", enum: ["json", "text"], default: "text", description: "Output format." },
          },
          required: ["sessionUuid"],
        },
      },
      {
        name: "get-face-details",
        description: "Get detailed information about a specific face detected in an image.",
        inputSchema: {
          type: "object",
          properties: {
            sessionUuid: { type: "string", description: "Session UUID from the analyze-image result." },
            faceIndex: { type: "number", description: "Index of the face to get details for (starting from 0)." },
            format: { type: "string", enum: ["json", "text"], default: "text", description: "Output format." },
          },
          required: ["sessionUuid", "faceIndex"],
        },
      },
    ];

    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      logInfo(`Received callTool request for: ${request.params.name}`, request.params.arguments);
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case "analyze-image":
            return await this.handleAnalyzeImage(args);
          case "analyze":
            return await this.handleAnalyzeImageUrl(args);
          case "check-session-status":
            return await this.handleCheckSessionStatus(args);
          case "get-face-details":
            return await this.handleGetFaceDetails(args);
          default:
            throw new McpError(ErrorCode.InvalidTool, `Unknown tool: ${name}`);
        }
      } catch (error) {
        logError(`Error calling Proofly API for tool ${name}:`, error.message, error.stack);
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.INTERNAL_ERROR, `Failed to execute tool ${name}: ${error.message}`);
      }
    });
  }

  async handleAnalyzeImage(params) {
    logInfo("Handling analyze-image with params:", params);
    const { imageBase64, filename, format = 'text' } = params;

    if (!PROOFLY_CONFIG.apiKey) {
        logInfo("Warning: PROOFLY_API_KEY not set. Proceeding without API key for analyze-image.");
    }
    if (!imageBase64 || !filename) {
      throw new McpError(ErrorCode.InvalidParams, "Missing imageBase64 or filename parameter");
    }

    try {
      let actualImageBase64 = imageBase64;
      if (imageBase64.startsWith('data:image')) {
        actualImageBase64 = imageBase64.split(',')[1];
        logInfo('Removed data URI prefix from base64 string');
      }
      const imageBuffer = Buffer.from(actualImageBase64, 'base64');
      logInfo(`Decoded image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);

      const formData = new FormData();
      formData.append('file', imageBuffer, { 
        filename: filename, 
        contentType: getContentTypeFromFilename(filename)
      });

      logInfo(`Uploading image to ${PROOFLY_CONFIG.baseUrl}/api/upload...`);
      const uploadResponse = await axios.post(`${PROOFLY_CONFIG.baseUrl}/api/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
        }
      });

      logInfo('Upload response:', uploadResponse.data);
      const { uuid } = uploadResponse.data;
      if (!uuid) {
        throw new Error('No session UUID returned from Proofly API after upload');
      }
      logInfo(`Received UUID: ${uuid}`);

      let status = 'in progress'; 
      let attempts = 0;
      let analysisResult;

      while (status === 'in progress' || status === 'processing' || status === 'pending') { 
        if (attempts >= PROOFLY_CONFIG.maxRetries) {
          throw new Error('Maximum retry attempts reached for status check.');
        }
        await new Promise(res => setTimeout(res, PROOFLY_CONFIG.retryInterval));
        attempts++;
        logInfo(`Checking status for UUID ${uuid}, attempt ${attempts}`);
        const statusResp = await axios.get(`${PROOFLY_CONFIG.baseUrl}/api/${uuid}/status`);
        status = statusResp.data.status;
        logInfo(`Status: ${status}`);
        if (statusResp.data.result) { 
            analysisResult = statusResp.data.result;
        }
      }

      if (status !== 'done' && status !== 'completed' && !analysisResult) {
        if (status === 'no_faces_found' || status === 'no faces found') {
            logInfo('No faces found in the image as per status update.');
            analysisResult = { 
                uuid: uuid,
                status: 'no_faces_found', 
                message: 'No faces detected in the image.',
                faces: [],
                total_faces: 0
            };
        } else {
             throw new Error(`Analysis did not complete successfully. Last status: ${status}`);
        }
      }

      if (!analysisResult) {
        logInfo(`Fetching final result for UUID ${uuid}`);
        const resultResp = await axios.get(`${PROOFLY_CONFIG.baseUrl}/api/${uuid}`);
        analysisResult = resultResp.data;
      }
      
      logInfo('Final analysis result:', analysisResult);

      if (format === 'json') {
        return { content: [{ type: "text", text: JSON.stringify(analysisResult, null, 2) }] }; 
      } else {
        return { content: [{ type: "text", text: formatResultsToHumanReadable(analysisResult) }] };
      }

    } catch (error) {
      logError("Error in handleAnalyzeImage:", error.message);
      if (error.response) {
        logError("Error response data:", error.response.data);
        logError("Error response status:", error.response.status);
      }
      throw new McpError(ErrorCode.ServerError, `Failed to analyze image: ${error.message}`);
    }
  }

  async handleAnalyzeImageUrl(params) {
    logInfo("Handling analyze with params:", params);
    const { imageUrl, format = 'text' } = params;

    if (!PROOFLY_CONFIG.apiKey) {
        logInfo("Warning: PROOFLY_API_KEY not set. Proceeding without API key for analyze-image-url.");
    }

    if (!imageUrl) {
      throw new McpError(ErrorCode.InvalidParams, "Missing imageUrl parameter");
    }

    try {
      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageResponse.data);
      logInfo(`Image downloaded, size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);

      const urlParts = imageUrl.split('/');
      const originalFilename = urlParts[urlParts.length - 1].split('?')[0] || 'image.jpg'; 

      const formData = new FormData();
      formData.append('file', imageBuffer, { 
        filename: originalFilename, 
        contentType: imageResponse.headers['content-type'] || 'application/octet-stream' 
      });

      logInfo(`Uploading image to ${PROOFLY_CONFIG.baseUrl}/api/upload...`);
      const uploadResponse = await axios.post(`${PROOFLY_CONFIG.baseUrl}/api/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
        }
      });

      logInfo('Upload response:', uploadResponse.data);
      const { uuid } = uploadResponse.data;
      if (!uuid) {
        throw new Error('No session UUID returned from Proofly API after upload');
      }
      logInfo(`Received UUID: ${uuid}`);

      let status = 'in progress'; 
      let attempts = 0;
      let analysisResult;

      while (status === 'in progress' || status === 'processing' || status === 'pending') { 
        if (attempts >= PROOFLY_CONFIG.maxRetries) {
          throw new Error('Maximum retry attempts reached for status check.');
        }
        await new Promise(res => setTimeout(res, PROOFLY_CONFIG.retryInterval));
        attempts++;
        logInfo(`Checking status for UUID ${uuid}, attempt ${attempts}`);
        const statusResp = await axios.get(`${PROOFLY_CONFIG.baseUrl}/api/${uuid}/status`);
        status = statusResp.data.status;
        logInfo(`Status: ${status}`);
        if (statusResp.data.result) { 
          analysisResult = statusResp.data.result;
        }
      }

      if (status !== 'done' && status !== 'completed' && !analysisResult) { 
        if (status === 'no_faces_found' || status === 'no faces found') {
            logInfo('No faces found in the image as per status update.');
            analysisResult = { 
                uuid: uuid, // Add uuid to result for consistency
                status: 'no_faces_found', 
                message: 'No faces detected in the image.',
                faces: [],
                total_faces: 0
            };
        } else {
             throw new Error(`Analysis did not complete successfully. Last status: ${status}`);
        }
      }

      if (!analysisResult) {
        logInfo(`Fetching final result for UUID ${uuid}`);
        const resultResp = await axios.get(`${PROOFLY_CONFIG.baseUrl}/api/${uuid}`);
        analysisResult = resultResp.data;
      }
      
      logInfo('Final analysis result:', analysisResult);

      if (format === 'json') {
        return { content: [{ type: "text", text: JSON.stringify(analysisResult, null, 2) }] }; 
      } else {
        return { content: [{ type: "text", text: formatResultsToHumanReadable(analysisResult) }] };
      }

    } catch (error) {
      logError("Error in handleAnalyzeImageUrl:", error.message);
      if (error.response) {
        logError("Error response data:", error.response.data);
        logError("Error response status:", error.response.status);
      }
      throw new McpError(ErrorCode.ServerError, `Failed to analyze image URL: ${error.message}`);
    }
  }

  async handleCheckSessionStatus(params) {
    logInfo("Handling check-session-status with params:", params);
    const { sessionUuid, format = 'text' } = params;

    if (!sessionUuid) {
      throw new McpError(ErrorCode.InvalidParams, "Missing sessionUuid parameter");
    }

    try {
      logInfo(`Fetching status for UUID ${sessionUuid}`);
      const statusResp = await axios.get(`${PROOFLY_CONFIG.baseUrl}/api/${sessionUuid}/status`);
      const statusData = statusResp.data;
      logInfo(`Status data for ${sessionUuid}:`, statusData);

      if (format === 'json') {
        return { content: [{ type: "text", text: JSON.stringify(statusData, null, 2) }] }; 
      } else {
        // Simple text representation of the status
        let output = `**Session Status for ${sessionUuid}:**\n`;
        output += `* Status: ${statusData.status || 'N/A'}\n`;
        if (statusData.message) {
          output += `* Message: ${statusData.message}\n`;
        }
        if (statusData.result) {
            output += `* Result available: Yes\n`;
        }
        return { content: [{ type: "text", text: output }] };
      }
    } catch (error) {
      logError("Error in handleCheckSessionStatus:", error.message);
      if (error.response) {
        logError("Error response data:", error.response.data);
        logError("Error response status:", error.response.status);
      }
      // If API returns 404 for unknown UUID, this may be expected
      if (error.response && error.response.status === 404) {
        throw new McpError(ErrorCode.NotFound, `Session with UUID ${sessionUuid} not found.`);
      }
      throw new McpError(ErrorCode.ServerError, `Failed to check session status: ${error.message}`);
    }
  }

  async handleGetFaceDetails(params) {
    logInfo("Handling get-face-details with params:", params);
    const { sessionUuid, faceIndex, format = 'text' } = params;

    if (!sessionUuid || typeof faceIndex !== 'number' || faceIndex < 0) {
      throw new McpError(ErrorCode.InvalidParams, "Missing or invalid sessionUuid or faceIndex parameter");
    }

    try {
      logInfo(`Fetching full analysis data for UUID ${sessionUuid} to get face details`);
      const resultResp = await axios.get(`${PROOFLY_CONFIG.baseUrl}/api/${sessionUuid}`);
      const analysisResult = resultResp.data;
      logInfo(`Full analysis data for ${sessionUuid}:`, analysisResult);

      if (!analysisResult.faces || faceIndex >= analysisResult.faces.length) {
        throw new McpError(ErrorCode.NotFound, `Face with index ${faceIndex} not found in session ${sessionUuid}. Total faces: ${analysisResult.faces ? analysisResult.faces.length : 0}.`);
      }

      const specificFace = analysisResult.faces[faceIndex];

      if (format === 'json') {
        return { content: [{ type: "text", text: JSON.stringify(specificFace, null, 2) }] }; 
      } else {
        // Format only a single face
        let output = `**Details for Face ${faceIndex + 1} (Session: ${sessionUuid}):**\n`;
        const faceVerdict = getVerdict(specificFace.ansamble);
        output += `* Verdict: **${faceVerdict}**\n`;
        if (typeof specificFace.ansamble !== 'undefined' && specificFace.ansamble !== null) {
         output += `* Probability "real": ${(specificFace.ansamble * 100).toFixed(2)}%, "fake": ${(100 - specificFace.ansamble * 100).toFixed(2)}%\n`;
        }
        if (specificFace.is_real_model_1 !== undefined) {
          output += `* Individual model results:\n`;
          for (let i = 1; i <= 10; i++) {
            if (specificFace[`is_real_model_${i}`] !== undefined) {
              output += `  - Model ${i}: ${(specificFace[`is_real_model_${i}`] * 100).toFixed(2)}%\n`;
            }
          }
        }
        if (specificFace.face_path) {
          let faceImageUrl = `${PROOFLY_CONFIG.baseUrl}${specificFace.face_path}`;
          if (faceImageUrl.includes('ai./')) {
            faceImageUrl = faceImageUrl.replace('ai./', 'ai/');
          }
          output += `* Face image URL: ${faceImageUrl}\n`;
        }
        return { content: [{ type: "text", text: output }] };
      }

    } catch (error) {
      logError("Error in handleGetFaceDetails:", error.message);
      if (error.response) {
        logError("Error response data:", error.response.data);
        logError("Error response status:", error.response.status);
      }
      if (error.response && error.response.status === 404) {
        throw new McpError(ErrorCode.NotFound, `Session with UUID ${sessionUuid} not found when fetching face details.`);
      }
      throw new McpError(ErrorCode.ServerError, `Failed to get face details: ${error.message}`);
    }
  }

  async start() {
    logInfo(`Proofly MCP Server (v${PACKAGE_VERSION}) instance created and handlers configured. Ready for connections.`);
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
  }
}

const serverInstance = new ProoflyMcpServer();
serverInstance.start().catch(err => {
  logError("Failed to start ProoflyMcpServer:", err);
  process.exit(1);
});

export { ProoflyMcpServer }; 
