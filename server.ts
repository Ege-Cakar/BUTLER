import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import fsPromises from 'fs/promises'; // Use promise-based fs
import fs from 'fs'; // Import standard fs for createReadStream
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { mcpManager, ServerConfig } from './src/utils/mcpManager'; // Import ServerConfig
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Set to false to disable debug logging
const DEBUG_MODE = false;

// Debug environment variables
if (DEBUG_MODE) {
  console.log('[DEBUG] Environment variables loaded from:', process.env.DOTENV_PATH || '.env.local');
  console.log('[DEBUG] CLAUDE_API_KEY present:', !!process.env.CLAUDE_API_KEY);
}
if (process.env.CLAUDE_API_KEY) {
  process.env.CLAUDE_API_KEY = process.env.CLAUDE_API_KEY.trim();
  if (DEBUG_MODE) {
    console.log('[DEBUG] CLAUDE_API_KEY format:', process.env.CLAUDE_API_KEY.substring(0, 5) + '...');
  }
}

// System prompt for Claude
const SYSTEM_PROMPT = `You are BUTLER, an agent designed to help users complete tasks on their computer. Follow these guidelines when assisting users with computer use:

Core Functionality:
Utilize available tools to help users complete computer tasks.
Verify each action with screenshots before proceeding to the next step.
Prioritize keyboard shortcuts whenever possible for efficiency.
Workflow Protocol:
Analyze the task requested by the user.
Break down complex tasks into clear, sequential steps.
For each step:

    Call the tools with exact commands or clicks needed.
    Request a screenshot after the action is completed.
    Verify the result from the screenshot before proceeding.
    If the result doesn't match expectations, try to troubleshoot.
    Confirm task completion with a final verification screenshot.
In terms of memory, follow these steps for each interaction:

1. User Identification:
   - You should assume that you are interacting with default_user
   - If you have not identified default_user, proactively try to do so.

2. Memory Retrieval:
   - Always retrieve all relevant information from your knowledge graph
   - Always refer to your knowledge graph as your "memory"

3. Memory
   - While conversing with the user, be attentive to any new information that falls into these categories:
     a) Basic Identity (age, gender, location, job title, education level, etc.)
     b) Behaviors (interests, habits, etc.)
     c) Preferences (communication style, preferred language, etc.)
     d) Goals (goals, targets, aspirations, etc.)
     e) Relationships (personal and professional relationships up to 3 degrees of separation)

4. Memory Update:
   - If any new information was gathered during the interaction, update your memory as follows:
     a) Create entities for recurring organizations, people, and significant events
     b) Connect them to the current entities using relations
     c) Store facts about them as observations`;

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Simple test endpoint to check if server is running
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running correctly' });
});

app.post('/api/speech-to-text', async (req, res) => {
  try {
    const { audioData } = req.body;

    if (!audioData || !audioData.startsWith('data:audio')) {
      return res.status(400).json({ error: 'Invalid audio data' });
    }

    const base64Data = audioData.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const tempFilePath = path.join(__dirname, `temp_audio_${Date.now()}.webm`);

    await fsPromises.writeFile(tempFilePath, buffer);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFilePath));
    formData.append('model', 'whisper-1');

    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders(),
        },
      }
    );

    await fsPromises.unlink(tempFilePath);

    return res.json(openaiResponse.data);
  } catch (error) {
    console.error('Speech-to-text error:', error);
    return res.status(500).json({ error: 'Failed to convert speech to text' });
  } 
});

// MCP Tool implementations
const mcpTools = {
  // Take a screenshot of the current screen
  async take_screenshot() {
    // In a real implementation, this would use a native module or system command
    console.log('[MCP] Taking screenshot...');
    
    // Mock implementation - would be replaced with real screenshot logic
    return {
      success: true,
      message: 'Screenshot taken successfully',
      path: `/tmp/screenshot_${Date.now()}.png`
    };
  },
  
  // Search for files on the system
  async search_files(params: { query: string, path?: string }) {
    const { query, path = '/' } = params;
    console.log(`[MCP] Searching for files matching "${query}" in "${path}"...`);
    
    // Mock implementation - would be replaced with real file search logic
    return {
      success: true,
      results: [
        { name: `file1-${query}.txt`, path: `${path}/file1-${query}.txt` },
        { name: `file2-${query}.txt`, path: `${path}/file2-${query}.txt` }
      ]
    };
  },
  
  // Execute a shell command
  async execute_command(params: { command: string, cwd?: string }) {
    const { command, cwd = '/' } = params;
    console.log(`[MCP] Executing command: "${command}" in directory "${cwd}"`);
    
    // Mock implementation - would be replaced with real command execution
    return {
      success: true,
      output: `Executed command: ${command}\nOutput: Command executed successfully`,
      exit_code: 0
    };
  }
};

// MCP Tool execution endpoint - This handles the built-in tools
app.post('/api/mcp/execute', async (req, res) => {
  try {
    const { toolCall } = req.body;
    
    if (!toolCall || !toolCall.name) {
      return res.status(400).json({ error: 'Invalid tool call format' });
    }
    
    const { name, arguments: args } = toolCall;
    
    console.log(`[MCP] Executing tool: ${name} with arguments:`, args);
    
    // Check if the tool exists
    if (!(name in mcpTools)) {
      console.error(`[MCP] Tool not found: ${name}`);
      return res.status(404).json({ error: `Tool '${name}' not found` });
    }
    
    // Execute the tool
    const result = await (mcpTools as any)[name](args);
    
    console.log(`[MCP] Tool execution result:`, result);
    
    return res.json({ result: JSON.stringify(result) });
  } catch (error: any) {
    console.error('[MCP] Tool execution error:', error);
    return res.status(500).json({
      error: 'Failed to execute tool',
      details: error.message || 'Unknown error'
    });
  }
});

// MCP Tools listing endpoint - Returns the tools provided by this server
app.get('/api/mcp/tools', (_req, res) => {
  // Respond with an empty tools array (removed all built-in tools)
  res.json({
    tools: []
  });
});

// Claude API endpoint
app.post('/api/claude', async (req, res) => {
  if (DEBUG_MODE) console.log('[DEBUG] Claude API endpoint called');
  
  try {
    const apiKey = process.env.CLAUDE_API_KEY?.trim();
    if (DEBUG_MODE) console.log('[DEBUG] Claude API key format:', apiKey ? apiKey.substring(0, 5) + '...' : 'not found');
    
    if (!apiKey) {
      console.error('[ERROR] Claude API key not configured or empty');
      return res.status(500).json({ error: 'TEST-NODEMON: Claude API key not configured' });
    }

    const { messages, model = 'claude-3-7-sonnet-20250219' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    // Get tools from MCP Manager
    const tools = mcpManager.getToolsForClaude();
    if (DEBUG_MODE) console.log(`[DEBUG] Sending ${tools.length} tools to Claude`);

    if (DEBUG_MODE) console.log('[DEBUG] Making initial Claude API call');
    let claudeResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model,
        messages,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      }
    );

    let responseData = claudeResponse.data;
    let allMessages = [...messages];
    
    // Process tool calls if any are present in the response
    let toolCallCount = 0;
    const toolDebugInfo: string[] = [];  // Store debug information about tool calls
    
    while (toolCallCount < 10) { // Limit to prevent infinite loops
      if (!responseData.content || !Array.isArray(responseData.content)) {
        break;
      }
      
      // Filter out tool calls with undefined names
      const validContent = responseData.content.map(item => {
        const incomingToolName = item.tool_name || item.name;
        if (item.type === 'tool_use' && !incomingToolName) {
          // Convert undefined tool call to text message explaining the issue
          toolDebugInfo.push(`[DEBUG] Removed undefined tool call`);
          return {
            type: 'text',
            text: 'ERROR: Attempted to use a tool but the tool name was undefined.'
          };
        }
        // Normalize property: ensure tool_use objects always have tool_name for downstream logic
        if (item.type === 'tool_use' && incomingToolName && !item.tool_name) {
          return { ...item, tool_name: incomingToolName };
        }
        return item;
      });
      
      // Process any valid tool calls in the response
      const { toolResults, hasToolCalls } = await mcpManager.processToolCalls(validContent);
      
      if (!hasToolCalls) {
        break; // No tool calls, we're done
      }
      
      // Add debug info for each tool call
      for (const item of responseData.content) {
        if (item.type === 'tool_use') {
          const tName = item.tool_name || item.name;
          if (!tName) {
            toolDebugInfo.push(`[DEBUG] Skipped undefined tool call`);
            continue; // Skip undefined tool calls
          }
          const tInput = (item.tool_input ?? item.input ?? item.arguments);
          if (!tInput) {
            toolDebugInfo.push(`[DEBUG] Tool called without input: ${tName}`);
          } else {
            toolDebugInfo.push(`[DEBUG] Tool called: ${tName} with args: ${JSON.stringify(tInput)}`);
          }
        }
      }
      
      // Add debug info for each tool result
      for (const result of toolResults) {
        if (!result.content) {
          toolDebugInfo.push(`[DEBUG] Tool result missing content: ${result.tool_call_id}`);
        } else {
          toolDebugInfo.push(`[DEBUG] Tool result: ${result.content}`);
        }
      }
      
      // Add the assistant message with tool calls
      allMessages.push({
        role: 'assistant',
        content: responseData.content
      });
      
      // Add tool results as user messages
      for (const result of toolResults) {
        allMessages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: result.tool_call_id,
            content: result.content
          }]
        });
      }
      
      // Get a new response from Claude with updated messages including tool results
      if (DEBUG_MODE) console.log('[DEBUG] Getting follow-up response from Claude');
      claudeResponse = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model,
          messages: allMessages,
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          tools,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        }
      );
      
      responseData = claudeResponse.data;
      toolCallCount++;
    }

    if (DEBUG_MODE) console.log('[DEBUG] Claude API response complete after', toolCallCount, 'tool calls');
    
    // If there were tool calls, add the debug info to the response
    if (toolDebugInfo.length > 0) {
      // Find the first text content to append debug info
      if (responseData.content && Array.isArray(responseData.content)) {
        for (let i = 0; i <responseData.content.length; i++) {
          const item = responseData.content[i];
          if (item.type === 'text') {
            // Add debug info to the text
            const debugText = '\n\n---\n' + toolDebugInfo.join('\n') + '\n---';
            responseData.content[i] = {
              ...item,
              text: item.text + debugText
            };
            break;
          }
        }
      }
    }
    
    return res.json(responseData);
  } catch (error: any) {
    console.error('[ERROR] Claude API error details:', {
      response: error.response?.data,
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Failed to communicate with Claude API',
      details: error.response?.data || error.message
    });
  }
});

// Direct test endpoint for ElevenLabs API
app.post('/api/elevenlabs/test-direct', (req, res) => {
  console.log('[INFO] Direct ElevenLabs API test request received');
  const { voiceId = 'nPczCjzI2devNBz1zQrb' } = req.body;
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

  console.log('[INFO] Checking ElevenLabs API key...');
  if (!elevenLabsApiKey) {
    console.error('[ERROR] ElevenLabs API key not configured');
    res.status(200).send(JSON.stringify({ success: false, error: 'ElevenLabs API key not configured' }));
    return;
  }

  console.log('[INFO] Making direct request to ElevenLabs API...');
  console.log('[INFO] Using ElevenLabs API key format:', elevenLabsApiKey.substring(0, 5) + '...' + elevenLabsApiKey.substring(elevenLabsApiKey.length - 5));
  
  fetch(
    'https://api.elevenlabs.io/v1/voices',
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'xi-api-key': elevenLabsApiKey
      }
    }
  ).then(response => {
    console.log(`[INFO] ElevenLabs API response status: ${response.status}`);

    if (!response.ok) {
      return response.text().then(text => {
        let errorDetails;
        try {
          errorDetails = JSON.parse(text);
          console.error('[ERROR] ElevenLabs API error:', errorDetails);
        } catch (e) {
          console.error('[ERROR] ElevenLabs API error (text):', text);
          errorDetails = text;
        }

        res.status(200).send(JSON.stringify({ 
          success: false, 
          error: `ElevenLabs API error: ${response.status}`,
          details: errorDetails
        }));
      }).catch(err => {
        console.error('[ERROR] Failed to read response text:', err);
        res.status(200).send(JSON.stringify({
          success: false,
          error: `Failed to read response: ${err.message}`
        }));
      });
    }

    // If we got here, the API key is valid
    return response.text().then(text => {
      try {
        const data = JSON.parse(text);
        const voices = data.voices || [];
        
        // Check if the requested voice ID exists
        const voiceExists = voices.some(voice => voice.voice_id === voiceId);
        
        res.status(200).send(JSON.stringify({
          success: true,
          message: 'ElevenLabs API key is valid',
          voicesCount: voices.length,
          voiceExists: voiceExists,
          voiceId: voiceId
        }));
      } catch (parseError) {
        console.error('[ERROR] Failed to parse JSON response:', parseError, 'Raw text:', text);
        res.status(200).send(JSON.stringify({
          success: false,
          error: 'Failed to parse API response',
          rawResponse: text.substring(0, 200) + (text.length > 200 ? '...' : '')
        }));
      }
    }).catch(err => {
      console.error('[ERROR] Failed to read response text:', err);
      res.status(200).send(JSON.stringify({
        success: false,
        error: `Failed to read response: ${err.message}`
      }));
    });
  }).catch(error => {
    console.error('[ERROR] Direct ElevenLabs API test error:', error);
    res.status(200).send(JSON.stringify({
      success: false,
      error: 'Error testing ElevenLabs API',
      details: error.message || 'Unknown error'
    }));
  });
});

// Test endpoint for ElevenLabs API key
app.get('/api/elevenlabs/test', async (req, res) => {
  try {
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!elevenLabsApiKey) {
      return res.status(500).json({ error: 'ElevenLabs API key is not configured in .env.local file' });
    }
    
    // Make a simple request to ElevenLabs API to check if the key is valid
    const response = await fetch(
      'https://api.elevenlabs.io/v1/voices',
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'xi-api-key': elevenLabsApiKey
        }
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({
        error: 'ElevenLabs API key test failed',
        status: response.status,
        details: errorData
      });
    }
    
    const data = await response.json();
    return res.status(200).json({
      success: true,
      message: 'ElevenLabs API key is valid',
      voicesCount: data.voices?.length || 0
    });
    
  } catch (error) {
    console.error('Error testing ElevenLabs API key:', error);
    return res.status(500).json({
      error: 'Error testing ElevenLabs API key',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ElevenLabs Text-to-Speech API endpoint
app.post('/api/elevenlabs/tts', (req, res) => {
  console.log('[INFO] ElevenLabs TTS request received');
  const { text, voiceId = 'nPczCjzI2devNBz1zQrb' } = req.body;
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

  console.log('[INFO] Checking ElevenLabs API key...');
  if (!elevenLabsApiKey) {
    console.error('[ERROR] ElevenLabs API key not configured');
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  if (!text) {
    console.error('[ERROR] Text is required for TTS');
    return res.status(400).json({ error: 'Text is required' });
  }

  console.log('[INFO] Making request to ElevenLabs API...');
  console.log(`[INFO] Using voice ID: ${voiceId}`);
  console.log(`[INFO] Text length: ${text.length} characters`);
  console.log('[INFO] Using ElevenLabs API key format:', elevenLabsApiKey.substring(0, 5) + '...' + elevenLabsApiKey.substring(elevenLabsApiKey.length - 5));

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  console.log(`[INFO] ElevenLabs endpoint URL: ${url}`);

  // Use the same approach that worked in the curl test
  const requestOptions = {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': elevenLabsApiKey
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    })
  };

  console.log('[INFO] Sending request to ElevenLabs API...');
  
  // Use a promise-based approach instead of async/await
  fetch(url, requestOptions)
    .then(response => {
      console.log(`[INFO] ElevenLabs API response status: ${response.status}`);
      console.log(`[INFO] Response headers:`, Object.fromEntries([...response.headers.entries()]));

      if (!response.ok) {
        return response.text().then(text => {
          let errorDetails;
          try {
            errorDetails = JSON.parse(text);
            console.error(`[ERROR] ElevenLabs API error (JSON): ${response.status}`, errorDetails);
          } catch (e) {
            console.error(`[ERROR] ElevenLabs API error (Text): ${response.status} ${text}`);
            errorDetails = text;
          }

          res.status(response.status).json({ 
            error: 'Failed to generate speech with ElevenLabs',
            status: response.status,
            details: errorDetails
          });
          throw new Error('API response not OK');
        });
      }

      console.log('[INFO] ElevenLabs API response successful, processing audio...');
      return response.arrayBuffer();
    })
    .then(audioBuffer => {
      console.log(`[INFO] Audio buffer size: ${audioBuffer.byteLength} bytes`);
      
      if (audioBuffer.byteLength === 0) {
        console.error('[ERROR] Empty audio buffer received from ElevenLabs');
        res.status(500).json({ error: 'Empty audio received from ElevenLabs API' });
        throw new Error('Empty audio buffer');
      }

      console.log('[INFO] Sending audio response to client...');
      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(audioBuffer));
      console.log('[INFO] Audio response sent successfully');
    })
    .catch(error => {
      if (error.message === 'API response not OK' || error.message === 'Empty audio buffer') {
        // Error already handled
        return;
      }
      
      console.error('[ERROR] ElevenLabs API error:', error);
      console.error('[ERROR] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      res.status(500).json({ 
        error: 'Internal server error', 
        message: error.message || 'Unknown error'
      });
    });
});

const startMCPServers = async () => {
  try {
    // Load MCP configuration
    // Use process.cwd() which should be the project root when running `npm run server`
    const configPath = path.join(process.cwd(), 'mcp-config.json'); 
    const mcpConfigRaw = await fsPromises.readFile(configPath, 'utf-8'); // Use await with promise
    const mcpConfig = JSON.parse(mcpConfigRaw); // Parse the raw string data

    if (!mcpConfig.mcpServers || typeof mcpConfig.mcpServers !== 'object') {
      console.error('[ERROR] Invalid mcp-config.json: mcpServers property is missing or not an object.');
      return;
    }

    console.log('[INFO] Starting MCP servers from config...');
    const serverPromises: Promise<string>[] = [];

    for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers as Record<string, ServerConfig>)) {
      console.log(`[INFO] Initiating start for server: ${serverName}`);
      // Start server but don't wait for completion here, collect promises
      serverPromises.push(mcpManager.startServer(serverName, serverConfig));
    }
    
    // Wait for all server start attempts to log their initial status
    const startResults = await Promise.all(serverPromises);
    startResults.forEach(result => console.log(`[INFO] Server start attempt result: ${result}`));

    // After attempting to start all servers, discover tools from those that started successfully
    console.log('[INFO] Discovering tools from all started MCP servers...');
    await mcpManager.discoverToolsFromAllServers(); 
    console.log('[INFO] Tool discovery phase complete.');

  } catch (error) {
    console.error('[ERROR] Failed to load or start MCP servers:', error);
  }
};

// Start the server
const serverInstance = app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
  
  // Start MCP Servers (async, don't block server start)
  startMCPServers().catch(err => {
     console.error("[ERROR] Unhandled error during MCP server startup:", err);
  });

  console.log(`Server listening on port ${port}`);
});

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('\n[INFO] Shutting down server...');
  
  // Clean up MCP servers
  mcpManager.cleanup();
  
  // Close the server
  serverInstance.close(() => {
    console.log('[INFO] Server shut down');
    process.exit(0);
  });
});
