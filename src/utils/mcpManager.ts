// MCP Manager - Handles MCP server connections and tool execution
import { spawn, ChildProcess } from 'child_process';
import axios, { AxiosError } from 'axios';
import * as path from 'path'; // Import path module
import { fileURLToPath } from 'url'; // Needed for ES Modules __dirname equivalent
import { v4 as uuidv4 } from 'uuid'; // For request IDs
import Readline from 'readline'; // To read lines from stdout

// Interfaces for MCP Tool Communication
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any; 
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: any;
}

export interface ToolReference {
  serverName: string;
  originalName: string;
}

export interface ServerConfig {
  type: 'builtin' | 'command' | 'python' | 'stdio'; // Added type
  command: string;
  args: string[];
  port?: number;
  stdio?: boolean; // if true, treat server as stdio-based MCP
}

export interface ToolResult {
  content: string;
}

interface ServerSession {
  name: string;
  process: ChildProcess | null;
  port: number | null; // Null for stdio
  tools: MCPTool[];
  isStdio: boolean; // Flag to indicate stdio communication
  pendingRequests?: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; timer: NodeJS.Timeout }>; // For stdio request/response mapping
  responseBuffer?: string; // Buffer for incoming stdio data
}

// MCP Manager Class (Singleton)
class MCPManager {
  private static instance: MCPManager;
  private sessions: Map<string, ServerSession> = new Map();
  private toolMap: Map<string, ToolReference> = new Map();
  private nextPort: number = 3002;
  private stdioRequestTimeout = 10000; // 10 seconds timeout for stdio requests
  
  // Set to false to disable debug logging
  private static DEBUG_MODE = false;
  
  // Helper to get project root directory
  private getProjectRoot(): string {
      // ES Module equivalent for __dirname
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      // Assumes this file is in build/src/utils/ or src/utils/
      // Resolve relative to the current directory to find the project root
      // Adjust '../..' if the output structure is different (e.g., in a 'dist' folder)
      return path.resolve(__dirname, '..', '..'); 
  }
  
  private constructor() {}
  
  // Get singleton instance
  public static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }
  
  // Start an MCP server based on config
  async startServer(serverName: string, config: ServerConfig): Promise<string> {
    let port: number | null = null;
    let serverProcess: ChildProcess | null = null;
    let isStdio = false;

    const projectRoot = this.getProjectRoot();

    try {
      switch (config.type) {
        case 'builtin':
          port = config.port || 3001;
          console.log(`[INFO] Server "${serverName}" is built-in, using port ${port}.`);
          break;

        case 'command':
        case 'python':
          port = this.nextPort++;
          let commandPath: string;
          let commandArgs: string[];

          if (config.type === 'python') {
            commandPath = 'python';
            const scriptPath = path.isAbsolute(config.command)
              ? config.command
              : path.join(projectRoot, config.command);
            // Add port only if NOT stdio (though python type implies HTTP for now)
            commandArgs = [scriptPath, '--port', port.toString(), ...config.args];
            console.log(`[INFO] Starting Python server "${serverName}" on port ${port}: ${commandPath} ${commandArgs.join(' ')}`);
          } else { // 'command'
            commandPath = config.command;
            // Add port only if NOT stdio 
            commandArgs = [...config.args, '--port', port.toString()]; 
            console.log(`[INFO] Starting Command server "${serverName}" on port ${port}: ${commandPath} ${commandArgs.join(' ')}`);
          }
          serverProcess = spawn(commandPath, commandArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
          break;

        case 'stdio':
          isStdio = true;
          port = null; // No HTTP port for stdio
          console.log(`[INFO] Starting Stdio server "${serverName}": ${config.command} ${config.args.join(' ')}`);
          serverProcess = spawn(config.command, config.args, { stdio: ['pipe', 'pipe', 'pipe'] }); // Ensure pipes for stdio
          break;

        default:
          throw new Error(`Unsupported server type: ${(config as any).type}`);
      }

      const session: ServerSession = {
        name: serverName,
        process: serverProcess,
        port: port,
        tools: [],
        isStdio: isStdio,
        pendingRequests: isStdio ? new Map() : undefined,
        responseBuffer: isStdio ? '' : undefined,
      };
      this.sessions.set(serverName, session);

      if (serverProcess) {
        this.setupProcessHandlers(serverName, serverProcess);
        if (isStdio) {
            this.setupStdioCommunication(serverName, serverProcess);
        }
      }

      return `Server "${serverName}" started (type: ${config.type}, port: ${port ?? 'stdio'})`;
    } catch (error: any) {
      console.error(`[ERROR] Failed to start server "${serverName}": ${error.message}`);
      // Clean up if process started but failed later
      if (serverProcess && !serverProcess.killed) {
          serverProcess.kill();
      }
      this.sessions.delete(serverName);
      throw error; // Re-throw to indicate failure
    }
  }

  // Setup handlers for process exit and stderr
  private setupProcessHandlers(serverName: string, process: ChildProcess): void {
    process.on('exit', (code, signal) => {
      console.log(`[INFO] Server "${serverName}" process exited with code ${code}, signal ${signal}`);
      const session = this.sessions.get(serverName);
      // Clean up pending requests on exit - Add null check
      if (session?.pendingRequests) { 
          session.pendingRequests.forEach((req) => {
              clearTimeout(req.timer);
              req.reject(new Error(`Server process exited with code ${code}`));
          });
          session.pendingRequests.clear();
      }
      this.sessions.delete(serverName);
    });

    process.stderr?.on('data', (data) => {
      console.error(`[${serverName} stderr] ${data.toString().trim()}`);
    });
    
    process.on('error', (err) => {
        console.error(`[ERROR] Failed to start or communicate with server "${serverName}" process: ${err.message}`);
        process.kill(); // Ensure process is killed on error
        this.sessions.delete(serverName);
    });
  }
  
  // Setup communication handlers for stdio servers
  private setupStdioCommunication(serverName: string, process: ChildProcess): void {
    const session = this.sessions.get(serverName);
    if (!session || !process.stdout) return; // Should not happen

    const rl = Readline.createInterface({
        input: process.stdout,
        crlfDelay: Infinity
    });

    rl.on('line', (line) => {
        try {
            // console.log(`[${serverName} stdout raw] ${line}`); // DEBUG
            const response: any = JSON.parse(line); // Cast to any to access properties
            const requestId = response.id;

            if (requestId && session.pendingRequests?.has(requestId)) {
                const pending = session.pendingRequests.get(requestId)!;
                clearTimeout(pending.timer);
                if (response.error) {
                    console.error(`[${serverName} error response id=${requestId}] ${JSON.stringify(response.error)}`);
                    pending.reject(new Error(response.error.message || JSON.stringify(response.error)));
                } else {
                    // console.log(`[${serverName} success response id=${requestId}]`); // DEBUG
                    pending.resolve(response.result);
                }
                session.pendingRequests.delete(requestId);
            } else {
                console.warn(`[${serverName}] Received stdio message without matching pending request ID or ID field:`, line);
            }
        } catch (e) {
            console.error(`[${serverName}] Error parsing stdio line: '${line}'. Error: ${e}`);
        }
    });

    rl.on('close', () => {
        console.log(`[INFO] Stdout stream closed for server "${serverName}".`);
    });
  }

  // Send a request to an stdio server
  private sendStdioRequest<T>(serverName: string, method: string, params: any): Promise<T> {
    const session = this.sessions.get(serverName);
    // Add explicit null checks for process and stdin
    if (!session || !session.isStdio || !session.process || !session.process.stdin || !session.pendingRequests) {
        return Promise.reject(new Error(`Server ${serverName} is not a running stdio server or stdin is not available.`));
    }

    return new Promise((resolve, reject) => {
        const requestId = uuidv4();
        
        // Handle special case for tool listing - use the standard tools/list endpoint
        const actualMethod = method === '' ? 'tools/list' : method;
        
        const request = {
            jsonrpc: '2.0',
            id: requestId,
            method: actualMethod,
            params: params
        };

        const timer = setTimeout(() => {
            session.pendingRequests?.delete(requestId);
            reject(new Error(`Request ${requestId} (${actualMethod}) to server ${serverName} timed out after ${this.stdioRequestTimeout}ms`));
        }, this.stdioRequestTimeout);

        session.pendingRequests.set(requestId, { resolve, reject, timer });

        const requestString = JSON.stringify(request) + '\n';
        // console.log(`[${serverName} stdin] ${requestString.trim()}`); // DEBUG
        // Check stdin again before writing (though covered by initial check)
        if (!session.process?.stdin?.writable) {
             clearTimeout(timer);
             session.pendingRequests?.delete(requestId);
             return reject(new Error(`Stdin for ${serverName} is not writable.`));
        }
        session.process.stdin.write(requestString, (err) => {
            if (err) {
                clearTimeout(timer);
                session.pendingRequests?.delete(requestId);
                console.error(`[ERROR] Failed to write to stdin for ${serverName}: ${err}`);
                reject(new Error(`Failed to write to stdin: ${err.message}`));
            }
        });
    });
  }

  // Discover tools from a single MCP server
  async discoverTools(serverName: string): Promise<MCPTool[]> {
    const session = this.sessions.get(serverName);
    if (!session) {
      console.warn(`[WARN] Attempted to discover tools for non-existent session: ${serverName}`);
      return [];
    }

    // Skip built-in servers (no process means built-in)
    if (!session.process && session.port) {
      console.log(`[INFO] Server "${serverName}" is built-in, skipping tool discovery.`);
      return [];
    }

    if (session.isStdio) {
      console.log(`[INFO] Discovering tools for stdio server "${serverName}"...`);
      try {
        // Try all possible MCP variants for tool discovery
        // Tools might be available directly in the response
        console.log(`[INFO] Attempting to discover tools for "${serverName}" using direct access...`);
        
        try {
          // Method 1: Request directly using empty method (some implementations)
          console.log(`[DEBUG] ${serverName}: Trying empty method for tool discovery`);
          const emptyResult: any = await this.sendStdioRequest(serverName, '', {});
          
          if (emptyResult && Array.isArray(emptyResult.tools) && emptyResult.tools.length > 0) {
            console.log(`[INFO] ${serverName}: Found ${emptyResult.tools.length} tools using empty method`);
            session.tools = emptyResult.tools;
            
            // Register tools in the tool map
            for (const tool of session.tools) {
              const toolKey = `${serverName}_${tool.name}`;
              this.toolMap.set(toolKey, { serverName, originalName: tool.name });
              console.log(`[DEBUG] Registered tool: ${toolKey}`);
            }
            
            return session.tools;
          }
        } catch (error: unknown) {
          console.log(`[DEBUG] ${serverName}: Empty method failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Method 2: Try tools/list endpoint (standard MCP)
        try {
          console.log(`[DEBUG] ${serverName}: Trying tools/list endpoint`);
          const listResult: any = await this.sendStdioRequest(serverName, 'tools/list', {});
          
          if (listResult && Array.isArray(listResult.tools) && listResult.tools.length > 0) {
            console.log(`[INFO] ${serverName}: Found ${listResult.tools.length} tools using tools/list`);
            session.tools = listResult.tools;
            
            // Register tools in the tool map
            for (const tool of session.tools) {
              const toolKey = `${serverName}_${tool.name}`;
              this.toolMap.set(toolKey, { serverName, originalName: tool.name });
              console.log(`[DEBUG] Registered tool: ${toolKey}`);
            }
            
            return session.tools;
          }
        } catch (error: unknown) {
          console.log(`[DEBUG] ${serverName}: tools/list failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Method 3: If all fails, manually define the tools based on the original TypeScript file
        console.log(`[INFO] ${serverName}: No tools discovered through automatic methods, adding manually defined tools`);
        
        // Define the memory MCP tools based on the TypeScript file you provided
        const memoryTools = [
          {
            name: "create_entities",
            description: "Create multiple new entities in the knowledge graph",
            inputSchema: {
              type: "object",
              properties: {
                entities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "The name of the entity" },
                      entityType: { type: "string", description: "The type of the entity" },
                      observations: { 
                        type: "array", 
                        items: { type: "string" },
                        description: "An array of observation contents associated with the entity"
                      },
                    },
                    required: ["name", "entityType", "observations"],
                  },
                },
              },
              required: ["entities"],
            }
          },
          {
            name: "read_graph",
            description: "Read the entire knowledge graph",
            inputSchema: {
              type: "object",
              properties: {},
            }
          },
          {
            name: "search_nodes",
            description: "Search for nodes in the knowledge graph based on a query",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", description: "The search query to match against entity names, types, and observation content" },
              },
              required: ["query"],
            }
          }
        ];
        
        session.tools = memoryTools;
        console.log(`[INFO] Using ${memoryTools.length} manually defined tools for "${serverName}"`);
        
        // Register tools in the tool map
        for (const tool of session.tools) {
          const toolKey = `${serverName}_${tool.name}`;
          this.toolMap.set(toolKey, { serverName, originalName: tool.name });
          console.log(`[DEBUG] Registered tool: ${toolKey}`);
        }
        
        return session.tools;
      } catch (error: unknown) {
        console.error(`[ERROR] Error discovering tools from stdio server "${serverName}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        session.tools = [];
        return [];
      }
    } else if (session.port) {
      // HTTP-based discovery (existing logic)
      const url = `http://localhost:${session.port}/tools`;
      console.log(`[INFO] Discovering tools for server "${serverName}" at ${url}...`);
      const maxRetries = 5;
      let attempt = 0;
      while (attempt < maxRetries) {
        attempt++;
        try {
          const response = await axios.get(url, { timeout: 5000 }); // Added timeout
          if (response.data && Array.isArray(response.data.tools)) {
            session.tools = response.data.tools;
            console.log(`[INFO] Discovered ${session.tools.length} tools from server "${serverName}".`);
            
            // Populate the toolMap for discovered HTTP server tools
            for (const tool of session.tools) {
              const toolKey = `${serverName}_${tool.name}`;
              // Ensure the tool has a name before registering
              if (tool.name) { 
                this.toolMap.set(toolKey, { serverName, originalName: tool.name });
                console.log(`[DEBUG] Registered HTTP tool: ${toolKey}`);
              } else {
                console.warn(`[WARN] Skipping HTTP tool from ${serverName} with no name:`, tool);
              }
            }
            
            return session.tools;
          } else {
            console.warn(`[WARN] Invalid tool response format from ${serverName}:`, response.data);
            session.tools = [];
            return [];
          }
        } catch (error) {
          const axiosError = error as AxiosError;
           if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ECONNRESET' || axiosError.response?.status === 503) {
             if (attempt < maxRetries) {
                console.warn(`[WARN] Attempt ${attempt} failed to connect to ${serverName} at ${url}. Retrying in ${attempt * 1000}ms...`);
                await new Promise(resolve => setTimeout(resolve, attempt * 1000)); // Exponential backoff
            } else {
                console.error(`[ERROR] Failed to discover tools from server "${serverName}" after ${maxRetries} attempts: Connection refused/reset.`);
                 // Kill the process if we can't connect after retries
                if(session.process && !session.process.killed) {
                    console.log(`[INFO] Killing process for unresponsive server "${serverName}"`);
                    session.process.kill();
                }
                session.tools = [];
                return [];
            }
           } else {
            console.error(`[ERROR] Failed to discover tools from server "${serverName}":`, axiosError.message);
            // Also kill here? Maybe not if it's a different error (e.g., 404)
            session.tools = [];
            return [];
          }
        }
      }
      console.error(`[ERROR] Exhausted retries discovering tools from "${serverName}".`);
      session.tools = [];
      return [];
    } else {
      // Built-in or other types might not support discovery this way
      console.log(`[INFO] Tool discovery not applicable for server type of "${serverName}".`);
      return [];
    }
  }

  // Discover tools from all running MCP servers
  async discoverToolsFromAllServers(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];
    const toolsByServer: Record<string, number> = {};
    
    for (const serverName of this.sessions.keys()) { // Iterate only keys
      try {
        const tools = await this.discoverTools(serverName);
        allTools.push(...tools);
        toolsByServer[serverName] = tools.length;
      } catch (error: unknown) {
        console.error(`[ERROR] Failed to discover tools from server "${serverName}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        toolsByServer[serverName] = 0;
      }
    }
    
    // Log summary of tools discovered
    console.log(`[INFO] Total tools discovered: ${allTools.length}`);
    for (const [server, count] of Object.entries(toolsByServer)) {
      console.log(`[INFO] - Server "${server}": ${count} tools`);
    }
    
    return allTools;
  }

  // Execute a tool using the appropriate MCP server
  async executeTool(toolName: string, args: any): Promise<any> {
    const toolRef = this.toolMap.get(toolName);
    if (!toolRef) {
      // Ensure tool name exists in the map before trying to execute
      // Re-populate map in case discoverTools failed previously but server is now running
      await this.discoverToolsFromAllServers(); 
      const updatedToolRef = this.toolMap.get(toolName);
      if (!updatedToolRef) {
         throw new Error(`Tool "${toolName}" not found after rediscovery attempt.`);
      }
      // Use the updated ref from here
      return this.executeToolInternal(updatedToolRef.serverName, toolName, args);
    } else {
       return this.executeToolInternal(toolRef.serverName, toolName, args);
    }
  }

  // Internal execution logic after server name is resolved
  private async executeToolInternal(serverName: string, toolName: string, args: any): Promise<any> {
    const session = this.sessions.get(serverName);
    if (!session) {
      throw new Error(`Server "${serverName}" for tool "${toolName}" is not running.`);
    }

    if (session.isStdio) {
        console.log(`[INFO] Executing stdio tool "${toolName}" on server "${session.name}"...`);
        try {
            // Extract original tool name without server prefix
            const originalToolName = this.toolMap.get(toolName)?.originalName || toolName;
            
            // Use standard MCP endpoint for tool execution
            const result = await this.sendStdioRequest<any>(session.name, 'tools/call', { 
                name: originalToolName, 
                arguments: args
            });
            return result; // Return the direct result
        } catch (error: unknown) {
            console.error(`[ERROR] Failed to execute stdio tool "${toolName}" on server "${session.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error; // Re-throw the specific error
        }
    }
     else if (session.port) {
      // HTTP-based execution (existing logic)
      const url = `http://localhost:${session.port}/execute`;
      console.log(`[INFO] Executing tool "${toolName}" via HTTP on server "${session.name}" at ${url}...`);
      try {
        const response = await axios.post(url, {
          tool_name: toolName,
          arguments: args,
        }, { timeout: 30000 }); // Added timeout
        return response.data;
      } catch (error) {
         const axiosError = error as AxiosError;
         console.error(`[ERROR] Failed to execute tool "${toolName}" on server "${session.name}": ${axiosError.message}`);
         if (axiosError.response) {
            console.error(`[ERROR] Server response: ${JSON.stringify(axiosError.response.data)}`);
            throw new Error(`Tool execution failed: ${axiosError.response.data?.error || axiosError.message}`);
         } else {
             throw new Error(`Tool execution failed: ${axiosError.message}`);
         }
      }
    } else {
        throw new Error(`Server "${session.name}" does not support tool execution (not stdio or http).`);
    }
  }

  // Get all discovered tools formatted for Claude
  getToolsForClaude(): ClaudeTool[] {
    const claudeTools: ClaudeTool[] = [];

    // Collect tools from all sessions
    for (const [serverName, session] of this.sessions.entries()) {
      if (MCPManager.DEBUG_MODE) console.log(`[INFO] Getting tools from server "${serverName}": ${session.tools.length} tools found`);
      
      for (const tool of session.tools) {
        if (MCPManager.DEBUG_MODE) console.log(`[TRACE] Processing tool from ${serverName}: Name='${tool.name}', Desc='${tool.description}'`);
        
        // Validate the tool has required properties
        if (!tool.name || !tool.description || !tool.inputSchema) {
          console.warn(`[WARN] Skipping invalid tool from ${serverName}: Missing required properties`, tool);
          continue;
        }
        
        // Create properly formatted tool for Claude
        claudeTools.push({
          name: `${serverName}_${tool.name}`,
          description: `[${serverName}] ${tool.description}`,
          input_schema: tool.inputSchema // Keep camelCase in code but property name is snake_case for Claude
        });
      }
    }
    
    // Log detailed info about tools being sent to Claude
    if (MCPManager.DEBUG_MODE) {
      console.log(`[INFO] Total tools for Claude: ${claudeTools.length}`);
      claudeTools.forEach(tool => {
        console.log(`[DEBUG] Registered Claude tool: ${tool.name}, Description: ${tool.description}`);
        // Log the schema structure for debugging
        console.log(`[DEBUG] Schema for ${tool.name}:`, JSON.stringify(tool.input_schema, null, 2)); 
      });
    }
    
    return claudeTools;
  }

  // Process content with tool calls
  async processToolCalls(content: any[]): Promise<{ toolResults: any[]; hasToolCalls: boolean }> {
    const toolResults: any[] = [];
    let hasToolCalls = false;
    
    for (const item of content) {
      if (item.type === 'tool_use') {
        // Support both 'tool_name' (our preferred) and 'name' (Claude's response)
        const incomingToolName = item.tool_name || item.name;
        
        // Skip tool calls with undefined names
        if (!incomingToolName) {
          console.log(`[WARN] Skipping tool call with undefined name`);
          toolResults.push({
            type: 'tool_result',
            tool_name: 'unknown',
            tool_call_id: item.id || 'unknown',
            content: 'Error: Tool name was undefined'
          });
          continue;
        }
        
        hasToolCalls = true;
        const toolName = incomingToolName;
        if (MCPManager.DEBUG_MODE) console.log(`[INFO] Processing tool call: ${toolName}`);

        try {
          // Extract tool info
          const toolInput = item.tool_input ?? item.input ?? item.arguments ?? {};

          if (MCPManager.DEBUG_MODE) console.log(`[INFO] Processing tool call: ${toolName} with arguments:`, toolInput);
          
          // Execute the tool
          const result = await this.executeTool(toolName, toolInput);
          
          // Add the result
          toolResults.push({
            type: 'tool_result',
            tool_name: toolName,
            tool_call_id: item.id,
            content: result.content
          });
        } catch (error: unknown) {
          console.error(`[ERROR] Tool execution error:`, error instanceof Error ? error.message : 'Unknown error');
          
          // Add error result
          toolResults.push({
            type: 'tool_result',
            tool_name: item.tool_name,
            tool_call_id: item.id,
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }
    }
    
    return { toolResults, hasToolCalls };
  }
  
  // Stop all servers
  cleanup(): void {
    for (const [serverName, session] of this.sessions.entries()) {
      if (session.process) { // Only kill if it's a real process (not built-in)
        console.log(`Stopping server "${serverName}"...`);
        session.process.kill();
      }
    }

    this.sessions.clear();
    this.toolMap.clear();
  }
}

// Export singleton instance
export const mcpManager = MCPManager.getInstance();
