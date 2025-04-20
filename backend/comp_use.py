import asyncio
from typing import Optional
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from anthropic import Anthropic
from dotenv import load_dotenv
import os
import argparse
import sys

load_dotenv()

# Default system prompt that will be used if none is provided via command line
DEFAULT_SYSTEM_PROMPT = """
You are Claude, an AI assistant that can take on specialized roles when instructed. When provided with specific instructions for a role named BUTLER, you will fully embody that role and its capabilities.

As a foundation for all interactions:
- Analyze user requests thoroughly before responding
- Provide accurate, helpful guidance based on available context
- Maintain a professional, supportive tone throughout the conversation
- Focus on safety and effectiveness in all task guidance
- Request clarification when needed rather than making assumptions
- Verify understanding of tasks before proceeding with instructions
- Adapt communication style based on user technical expertise
- Follow instructions precisely as provided in role-specific prompts

You will receive detailed instructions about the BUTLER role, including available tools and how to provide step-by-step guidance with screenshot verification. When operating as BUTLER, strictly adhere to those guidelines while maintaining your foundational capabilities as Claude.

Remember that your primary function is to assist users with computer tasks safely and effectively, providing clear instructions that are easy to follow and verify.

Remember that whenever possible, you should always avoid using the mouse, and utilize keyboard shortcuts.
"""

class MCPClient:
    def __init__(self, system_prompt: str = None):
        # Initialize session and client objects
        self.sessions = {}  # Dictionary to store multiple sessions
        self.exit_stack = AsyncExitStack()
        self.anthropic = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        # Use the default system prompt if none is provided
        self.system_prompt = system_prompt if system_prompt is not None else DEFAULT_SYSTEM_PROMPT
        self.available_tools = []

    async def connect_to_server(self, server_identifier: str):
        """Connect to an MCP server
        
        Args:
            server_identifier: Path to the server script (.py or .js) or a server type identifier ('memory', 'vnc')
        """
        # Check if it's a predefined server type
        if server_identifier == 'memory':
            # Memory server
            command = "npx"
            args = ["-y", "@modelcontextprotocol/server-memory"]
            server_name = "memory"
        elif server_identifier == 'vnc':
            # VNC server - assuming vnc_mcp.py is in the same directory as this script
            script_dir = os.path.dirname(os.path.abspath(__file__))
            vnc_script_path = os.path.join(script_dir, "vnc_mcp.py")
            if not os.path.exists(vnc_script_path):
                raise ValueError(f"VNC script not found at {vnc_script_path}")
            
            command = "python"
            args = [vnc_script_path]
            server_name = "vnc"
        else:
            # Regular script path
            is_python = server_identifier.endswith('.py')
            is_js = server_identifier.endswith('.js')
            if not (is_python or is_js):
                raise ValueError("Server script must be a .py or .js file")
                
            command = "python" if is_python else "node"
            args = [server_identifier]
            server_name = os.path.basename(server_identifier).split('.')[0]
        
        server_params = StdioServerParameters(
            command=command,
            args=args,
            env=None
        )
        
        stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
        stdio, write = stdio_transport
        session = await self.exit_stack.enter_async_context(ClientSession(stdio, write))
        
        await session.initialize()
        
        # Store the session
        self.sessions[server_name] = session
        
        # List available tools
        response = await session.list_tools()
        tools = response.tools
        print(f"\nConnected to {server_name} server with tools:", [tool.name for tool in tools])
        
        # Update available tools
        await self.update_available_tools()
        
        return server_name

    async def connect_to_multiple_servers(self, server_identifiers: list):
        """Connect to multiple MCP servers
        
        Args:
            server_identifiers: List of server identifiers (paths or types)
        """
        for server_id in server_identifiers:
            await self.connect_to_server(server_id)
    
    async def update_available_tools(self):
        """Update the list of available tools from all connected servers"""
        all_tools = []
        
        for server_name, session in self.sessions.items():
            response = await session.list_tools()
            server_tools = [{ 
                "name": f"{server_name}_{tool.name}",  # Prefix with server name to avoid conflicts
                "description": f"[{server_name}] {tool.description}",
                "input_schema": tool.inputSchema,
                "original_name": tool.name,
                "server": server_name
            } for tool in response.tools]
            
            all_tools.extend(server_tools)
        
        self.available_tools = all_tools
        return self.available_tools

    async def get_available_tools(self):
        """Get the list of available tools from all connected servers"""
        if not self.sessions:
            raise ValueError("No sessions initialized. Call connect_to_server first.")
            
        if not self.available_tools:
            await self.update_available_tools()
            
        return self.available_tools

    async def process_query(self, query: str) -> str:
        """Process a query using Claude and available tools"""
        messages = [
            {
                "role": "user",
                "content": query
            }
        ]

        # Make sure we have the available tools
        if not self.available_tools:
            await self.get_available_tools()
        
        print(f"Available tools: {[tool['name'] for tool in self.available_tools]}")

        # Create Claude-compatible tools list (without server-specific fields)
        claude_tools = [{
            "name": tool["name"],
            "description": tool["description"],
            "input_schema": tool["input_schema"]
        } for tool in self.available_tools]

        # Initial Claude API call
        response = self.anthropic.messages.create(
            model="claude-3-7-sonnet-20250219",
            max_tokens=1000,
            messages=messages,
            tools=claude_tools,
            system=self.system_prompt
        )

        # Process response and handle tool calls
        final_text = []
        tool_call_count = 0
        
        while True:
            assistant_message = {"role": "assistant", "content": []}
            has_tool_calls = False
            
            for content in response.content:
                if content.type == 'text':
                    final_text.append(content.text)
                    assistant_message["content"].append({"type": "text", "text": content.text})
                elif content.type == 'tool_use':
                    has_tool_calls = True
                    tool_name = content.name
                    tool_args = content.input
                    tool_call_count += 1
                    tool_id = f"call_{tool_call_count}"
                    
                    # Find the tool in our available tools
                    tool_info = next((t for t in self.available_tools if t["name"] == tool_name), None)
                    
                    if not tool_info:
                        error_msg = f"Tool {tool_name} not found"
                        final_text.append(f"[Error: {error_msg}]")
                        assistant_message["content"].append({"type": "text", "text": f"Error: {error_msg}"})
                        continue
                    
                    # Add tool call to assistant message with required id field
                    assistant_message["content"].append({
                        "type": "tool_use",
                        "id": tool_id,
                        "name": tool_name,
                        "input": tool_args
                    })
                    
                    # Get the server and original tool name
                    server_name = tool_info["server"]
                    original_tool_name = tool_info["original_name"]
                    
                    # Execute tool call on the appropriate server
                    try:
                        result = await self.sessions[server_name].call_tool(original_tool_name, tool_args)
                        
                        # Log the tool call and result
                        final_text.append(f"[Calling {server_name} tool {original_tool_name} with args {tool_args}]")
                        final_text.append(f"[Tool result: {result.content}]")
                        
                        # Add assistant message with tool call to conversation
                        messages.append(assistant_message)
                        
                        # Add tool result as user message with tool_result format
                        messages.append({
                            "role": "user",
                            "content": [
                                {
                                    "type": "tool_result",
                                    "tool_use_id": tool_id,
                                    "content": result.content
                                }
                            ]
                        })
                    except Exception as e:
                        error_msg = f"Error calling tool {tool_name}: {str(e)}"
                        final_text.append(f"[Error: {error_msg}]")
                        
                        # Add error as tool result
                        messages.append(assistant_message)
                        messages.append({
                            "role": "user",
                            "content": [
                                {
                                    "type": "tool_result",
                                    "tool_use_id": tool_id,
                                    "content": f"Error: {error_msg}"
                                }
                            ]
                        })
                    
                    break
            
            # If no tool calls or we've processed all content, add the assistant message
            if not has_tool_calls:
                if assistant_message["content"]:
                    messages.append(assistant_message)
                break
            
            # Get next response from Claude for the next iteration
            response = self.anthropic.messages.create(
                model="claude-3-7-sonnet-20250219",
                max_tokens=1000,
                messages=messages,
                tools=claude_tools,
                system=self.system_prompt
            )

        return "\n".join(final_text)

    async def execute_task(self, task: str):
        """Execute a single task and return the result"""
        # Get available tools
        tools = await self.get_available_tools()
        
        # Format the tools for the prompt template
        tools_text = ""
        for tool in tools:
            tools_text += f"- {tool['name']}: {tool['description']}\n"
        
        # Use the full prompt template with proper variable substitution and MacOS specifics
        butler_prompt = {
            "text": "You are BUTLER, an AI agent designed to assist users with completing tasks on their MacOS computer. Your primary goal is to provide clear, step-by-step guidance while utilizing available tools and verifying each action through screenshots.\n\nHere are the tools available to you:\n<available_tools>\n{AVAILABLE_TOOLS}\n</available_tools>\n\nWhen a user presents you with a task, follow these instructions:\n\n1. Analyze the task:\n - Carefully read the user's request.\n - Break down the task into clear, sequential steps.\n - Plan your approach, ALWAYS prioritizing MacOS keyboard shortcuts for maximum efficiency.\n\n2. For each step in the task:\n a) Provide the exact command or MacOS keyboard shortcut sequence needed, using the available tools.\n b) When suggesting keyboard shortcuts, use Mac notation (⌘ Command, ⌥ Option, ⇧ Shift, ⌃ Control).\n c) Request a screenshot after the action is completed.\n d) When you receive the screenshot, verify the result before proceeding.\n e) If the result doesn't match expectations, troubleshoot and provide alternative instructions.\n\n3. MacOS shortcuts and techniques:\n - Default to keyboard shortcuts whenever possible instead of mouse clicks.\n - Utilize MacOS-specific features like Spotlight (⌘ Space), Quick Look (Space), and Mission Control (F3).\n - For file operations, suggest Finder shortcuts like ⌘N for new window, ⌘⇧N for new folder, etc.\n - For text editing, prioritize MacOS text navigation shortcuts (⌥← to move by word, ⌘← to move to line start, etc.).\n\n4. Screenshot verification process:\n - Examine each screenshot carefully to ensure the expected outcome is achieved.\n - Look for visual cues that confirm the action was successful (e.g., opened windows, changed settings, etc.).\n - If the screenshot doesn't show the expected result, ask the user for clarification or provide troubleshooting steps.\n\n5. Troubleshooting guidelines:\n - If an action doesn't produce the expected result, consider alternative methods or tools.\n - Provide clear explanations of what might have gone wrong and how to correct it.\n - If needed, ask the user for additional information about their system or the specific issue they're encountering.\n\n6. Task completion:\n - After all steps are completed, request a final screenshot to verify the overall task completion.\n - Confirm that the user's original request has been fully addressed.\n - Offer any additional advice or best practices related to the completed task, including relevant MacOS shortcuts for future use.\n\nRemember to always prioritize clarity and precision in your instructions. Use technical terms when necessary, but explain them if they might not be familiar to all users.\n\nNow, please assist the user with the following task:\n<user_task>\n{USER_TASK}\n</user_task>\n\nBegin by analyzing the task and outlining the steps you'll take to complete it. Then, proceed with providing step-by-step instructions with MacOS keyboard shortcuts, requesting screenshots, and verifying results as described above."
        }
        
        # Replace placeholder variables with actual content
        formatted_prompt = butler_prompt["text"].format(
            AVAILABLE_TOOLS=tools_text,
            USER_TASK=task
        )
        
        # Process the task with the formatted prompt
        response = await self.process_query(formatted_prompt)
        return response

    async def chat_loop(self):
        """Run an interactive chat loop"""
        print("\nMCP Client Started!")
        print("Type your queries or 'quit' to exit.")
        
        print("\nSystem prompt is set to:")
        print(f"---\n{self.system_prompt}\n---")
        
        # Get available tools at startup
        tools = await self.get_available_tools()
        print(f"\nAvailable tools from all servers:")
        for tool in tools:
            print(f"- {tool['name']}: {tool['description']}")
        
        # Send an initial message to Claude with the available tools
        initial_message = "Here are the available tools you can use:\n"
        for tool in tools:
            initial_message += f"- {tool['name']}: {tool['description']}\n"
        
        print("\nSending tool information to Claude...")
        response = await self.process_query(initial_message)
        print("\nClaude is ready to use the tools.")
        
        while True:
            try:
                query = input("\nQuery: ").strip()
                
                if query.lower() == 'quit':
                    break
                    
                response = await self.process_query(query)
                print("\n" + response)
                    
            except Exception as e:
                print(f"\nError: {str(e)}")

    async def cleanup(self):
        """Clean up resources"""
        await self.exit_stack.aclose()

async def main():
    parser = argparse.ArgumentParser(description="Computer Use Agent")
    parser.add_argument("task", nargs='?', help="Task to be accomplished")
    parser.add_argument("--server-scripts", "-s", nargs='+', default=["vnc"], help="Paths to server scripts (.py or .js) or server types ('memory', 'vnc'). Default is 'vnc'.")
    parser.add_argument("--system-prompt", help="System prompt for Claude (overrides default)")
    parser.add_argument("--system-prompt-file", "-f", help="File containing system prompt for Claude (overrides default)")
    parser.add_argument("--no-system-prompt", "-n", action="store_true", help="Don't use any system prompt")
    parser.add_argument("--interactive", "-i", action="store_true", help="Run in interactive chat mode")
    
    args = parser.parse_args()
    
    system_prompt = DEFAULT_SYSTEM_PROMPT
    
    if args.no_system_prompt:
        system_prompt = None
    elif args.system_prompt_file:
        try:
            with open(args.system_prompt_file, 'r') as f:
                system_prompt = f.read()
        except Exception as e:
            print(f"Error reading system prompt file: {e}")
            sys.exit(1)
    elif args.system_prompt:
        system_prompt = args.system_prompt
    
    client = MCPClient(system_prompt=system_prompt)
    
    try:
        await client.connect_to_multiple_servers(args.server_scripts)
        
        if args.interactive:
            # Run in interactive mode
            await client.chat_loop()
        else:
            # Run in task mode
            if not args.task:
                parser.print_help()
                print("\nError: task argument is required when not in interactive mode")
                sys.exit(1)
            
            print(f"\nExecuting task: {args.task}")
            response = await client.execute_task(args.task)
            print("\n" + response)
    finally:
        await client.cleanup()

if __name__ == "__main__":
    asyncio.run(main())