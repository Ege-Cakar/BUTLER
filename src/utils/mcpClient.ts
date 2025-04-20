// MCP Client implementation for the web interface
import axios from 'axios';

// Define types for Claude API and MCP tools
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContent[];
}

export interface ClaudeContent {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: Record<string, any>;
  content?: string;
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ClaudeToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ClaudeToolResult {
  tool_call_id: string;
  content: string;
  error?: string;
}

// MCP Client class for handling tool interactions
export class MCPClient {
  private tools: ClaudeTool[] = [];
  private serverUrl: string;
  
  constructor(serverUrl = 'http://localhost:3001') {
    this.serverUrl = serverUrl;
  }
  
  // Initialize by fetching available tools from the server
  async initialize(): Promise<ClaudeTool[]> {
    try {
      const response = await axios.get(`${this.serverUrl}/api/mcp/tools`);
      this.tools = response.data.tools;
      return this.tools;
    } catch (error) {
      console.error('Failed to initialize MCP tools:', error);
      return [];
    }
  }
  
  // Get available tools for Claude API
  getToolsForClaude(): ClaudeTool[] {
    return this.tools;
  }
  
  // Process a Claude response to extract and handle tool calls
  async processClaudeResponse(claudeResponse: any): Promise<ClaudeMessage[]> {
    if (!claudeResponse || !claudeResponse.content) {
      return [];
    }
    
    const content = claudeResponse.content;
    const followupMessages: ClaudeMessage[] = [];
    
    // Look for tool calls in the response
    for (const item of content) {
      if (item.type === 'tool_use') {
        // We found a tool call - execute it
        const toolCall: ClaudeToolCall = {
          id: item.tool_use_id,
          name: item.tool_name,
          input: item.tool_input
        };
        
        // Execute the tool
        const result = await this.executeTool(toolCall);
        
        // Add the tool result as a new message
        followupMessages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: result.content
          }]
        });
      }
    }
    
    return followupMessages;
  }
  
  // Execute a tool call
  async executeTool(toolCall: ClaudeToolCall): Promise<ClaudeToolResult> {
    try {
      // Send the tool call to the server
      const response = await axios.post(`${this.serverUrl}/api/mcp/execute`, {
        toolCall: {
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.input
        }
      });
      
      return {
        tool_call_id: toolCall.id,
        content: response.data.result
      };
    } catch (error: any) {
      console.error('Error executing tool:', error);
      return {
        tool_call_id: toolCall.id,
        content: '',
        error: error.message || 'Unknown error executing tool'
      };
    }
  }
}

// Create a singleton instance
export const mcpClient = new MCPClient();

// Example tools that could be implemented - these will be replaced
// by actual tools defined on the server side
export const exampleTools: ClaudeTool[] = [
  {
    name: 'take_screenshot',
    description: 'Takes a screenshot of the current screen',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'search_files',
    description: 'Search for files on the system',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        path: {
          type: 'string',
          description: 'Path to search in'
        }
      },
      required: ['query']
    }
  }
];
