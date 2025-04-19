#!/usr/bin/env python3
"""
VNC GUI Automation MCP Server

Provides MCP server capabilities for VNC remote control.
"""

import sys
import signal
import asyncio
import traceback
from contextlib import asynccontextmanager
from urllib.parse import urlparse
from typing import Dict, Any, Optional

import asyncvnc
import asyncssh
from PIL import Image

# Import the MCP SDK
from mcp.server.fastmcp import FastMCP

# ─── LOGGING UTILITIES ───────────────────────────────────────────
def log(message):
    """Print log messages to stderr instead of stdout to not interfere with MCP protocol"""
    print(message, file=sys.stderr, flush=True)

# ─── KEY MAPPING ───────────────────────────────────────────────
def map_key(key: str) -> str:
    """Map common key names to VNC key names"""
    aliases = {
        "enter":     "Return",
        "return":    "Return",
        "esc":       "Escape",
        "escape":    "Escape",
        "ctrl":      "Control_L",
        "control":   "Control_L",
        "shift":     "Shift_L",
        "alt":       "Alt_L",
        "tab":       "Tab",
        "backspace": "BackSpace",
        "cmd":       "Super_L",
        "super":     "Super_L",
    }
    return aliases.get(key.lower(), key)

# ─── VNC CONNECTION ───────────────────────────────────────────
@asynccontextmanager
async def connect_vnc(uri: str):
    """Connect to a VNC server using the provided URI"""
    u = urlparse(uri)
    if u.scheme.lower() != "vnc":
        raise ValueError(f"Unsupported scheme: {u.scheme!r}, expected vnc://")
    
    # Extract connection parameters explicitly
    host = u.hostname
    port = u.port or 5900
    username = u.username
    password = u.password
    
    log(f"Connecting to VNC: {host}:{port} as {username}")
    
    try:
        async with asyncvnc.connect(
            host,
            port=port,
            username=username,
            password=password,
        ) as client:
            yield client
    except Exception as e:
        log(f"VNC connection error: {e}")
        raise

# ─── VNC CONNECTION MANAGER ───────────────────────────────────────
class VNCManager:
    def __init__(self):
        self.connections = {}  # Store connection info
        self.active_clients = {}  # Store active VNC clients
        self.active_cm = {}  # Store active context managers
    
    async def register_connection(self, name: str, uri: str, ssh_user: str = None, ssh_password: str = None) -> bool:
        """Register a new VNC connection with the given name and URI"""
        parsed_uri = urlparse(uri)
        host = parsed_uri.hostname
        self.connections[name] = {
            "uri": uri,
            "active": False,
            "host": host,
            "ssh_user": ssh_user or parsed_uri.username,
            "ssh_password": ssh_password or parsed_uri.password
        }
        log(f"Registered connection: {name} -> {uri}")
        return True
    
    async def connect(self, name: str) -> bool:
        """Connect to a registered VNC server"""
        if name not in self.connections:
            log(f"Connection {name} not registered")
            return False
        
        if self.connections[name]["active"]:
            log(f"Connection {name} is already active")
            return True
        
        try:
            uri = self.connections[name]["uri"]
            log(f"Attempting to connect to {name} at {uri}")
            
            # Use the connect_vnc context manager
            cm = connect_vnc(uri)
            client = await cm.__aenter__()
            
            self.active_clients[name] = client
            self.active_cm[name] = cm
            self.connections[name]["active"] = True
            log(f"Connected to: {name}")
            return True
        except Exception as e:
            log(f"Failed to connect to {name}: {e}")
            log(traceback.format_exc())
            return False
    
    async def disconnect(self, name: str) -> bool:
        """Disconnect from a VNC server"""
        if name not in self.active_clients:
            log(f"Connection {name} is not active")
            return False
        
        try:
            cm = self.active_cm[name]
            await cm.__aexit__(None, None, None)
            del self.active_clients[name]
            del self.active_cm[name]
            self.connections[name]["active"] = False
            log(f"Disconnected from: {name}")
            return True
        except Exception as e:
            log(f"Failed to disconnect from {name}: {e}")
            log(traceback.format_exc())
            return False
    
    def get_client(self, name: str):
        """Get the active VNC client for a connection"""
        return self.active_clients.get(name)
    
    async def cleanup(self):
        """Clean up all active connections"""
        for name in list(self.active_clients.keys()):
            await self.disconnect(name)

# ─── VNC ACTIONS ───────────────────────────────────────────────
async def click_at(client, x: int, y: int, button: str = "left"):
    """Click at the specified coordinates"""
    client.mouse.move(x, y)
    if button == "left":
        client.mouse.click()
    elif button == "right":
        client.mouse.right_click()
    else:
        client.mouse.middle_click()

async def send_text(client, text: str, delay: float = 0.0):
    """Type text on the remote system"""
    client.keyboard.write(text)
    if delay:
        await asyncio.sleep(delay)

async def press_key(client, key: str, delay: float = 0.0):
    """Press a key on the remote system"""
    ks = map_key(key)
    try:
        client.keyboard.press(ks)
    except KeyError:
        # fallback for single characters
        if len(key) == 1:
            client.keyboard.write(key)
        else:
            raise
    if delay:
        await asyncio.sleep(delay)

async def hotkey(client, *keys: str):
    """Press a key combination"""
    mkeys = [map_key(k) for k in keys]
    mods, last = mkeys[:-1], mkeys[-1]

    # press modifiers down
    with client.keyboard.hold(*mods):
        # press & release the "real" key
        client.keyboard.press(last)

async def take_screenshot(client, outfile: str = "screenshot.png"):
    """Take a screenshot of the remote system"""
    pixels = await client.screenshot()
    img = Image.fromarray(pixels)
    img.save(outfile)
    log(f"Wrote screenshot: {outfile}")
    return outfile

async def run_ssh_command(host, user, pwd, cmd):
    """Run a command via SSH on the remote system"""
    log(f"SSH connecting to {host} as {user}")
    async with asyncssh.connect(
        host,
        username=user,
        password=pwd,
        known_hosts=None
    ) as conn:
        log(f"Running SSH command: {cmd}")
        result = await conn.run(cmd, check=True)
        return result.stdout, result.stderr

# ─── INITIALIZATION ───────────────────────────────────────────
async def setup_default_connection(vnc_manager):
    """Set up the default VNC connection"""
    try:
        await vnc_manager.register_connection(
            "default",
            "vnc://claude:1234@192.168.64.3",
            ssh_user="claude",
            ssh_password="1234"
        )
        log("Default connection registered")
    except Exception as e:
        log(f"Error setting up default connection: {e}")
        log(traceback.format_exc())

# ─── MCP SERVER ───────────────────────────────────────────────
def create_mcp_server():
    """Create a FastMCP server with VNC automation tools"""
    # Initialize FastMCP server
    mcp = FastMCP("VNC Automation")
    vnc_manager = VNCManager()
    
    # Register signal handlers for cleanup
    def handle_signal(signum, frame):
        log(f"Received signal {signum}, shutting down...")
        # We need to run cleanup in a new event loop
        loop = asyncio.new_event_loop()
        loop.run_until_complete(vnc_manager.cleanup())
        loop.close()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
    
    # Register a default VNC connection
    # We'll run this setup before starting the server
    loop = asyncio.get_event_loop()
    loop.run_until_complete(setup_default_connection(vnc_manager))
    
    # Add a debug tool to test connections directly
    @mcp.tool()
    async def vnc_test_connection(uri: str = "vnc://claude:1234@192.168.64.3") -> dict:
        """
        Test a VNC connection directly using the original method
        
        Args:
            uri: VNC URI to test
            
        Returns:
            Status of the test
        """
        try:
            log(f"Testing direct VNC connection to {uri}")
            async with connect_vnc(uri) as client:
                # Take a quick screenshot to verify connection
                await take_screenshot(client, "test_connection.png")
                return {"success": True, "message": "Connection successful, screenshot saved"}
        except Exception as e:
            log(f"Test connection failed: {e}")
            log(traceback.format_exc())
            return {"success": False, "error": str(e)}
    
    # Define MCP tools
    @mcp.tool()
    async def vnc_register(name: str, uri: str, ssh_user: str = None, ssh_password: str = None) -> bool:
        """
        Register a VNC connection with the given name and URI.
        
        Args:
            name: Name to identify this connection
            uri: VNC URI in the format vnc://user:pass@host:port
            ssh_user: Optional SSH username for remote commands
            ssh_password: Optional SSH password for remote commands
            
        Returns:
            True if registration was successful
        """
        return await vnc_manager.register_connection(name, uri, ssh_user, ssh_password)
    
    @mcp.tool()
    async def vnc_connect(name: str) -> bool:
        """
        Connect to a registered VNC server.
        
        Args:
            name: Name of the connection to connect to
            
        Returns:
            True if connection was successful
        """
        return await vnc_manager.connect(name)
    
    @mcp.tool()
    async def vnc_disconnect(name: str) -> bool:
        """
        Disconnect from a VNC server.
        
        Args:
            name: Name of the connection to disconnect from
            
        Returns:
            True if disconnection was successful
        """
        return await vnc_manager.disconnect(name)
    
    @mcp.tool()
    async def vnc_click(connection: str, x: int, y: int, button: str = "left") -> dict:
        """
        Click at specified coordinates on the remote system.
        
        Args:
            connection: Name of the VNC connection to use
            x: X coordinate to click
            y: Y coordinate to click
            button: Mouse button to use (left, right, middle)
            
        Returns:
            Status of the operation
        """
        client = vnc_manager.get_client(connection)
        if not client:
            success = await vnc_manager.connect(connection)
            if not success:
                return {"success": False, "error": f"Could not connect to {connection}"}
            client = vnc_manager.get_client(connection)
        
        try:
            await click_at(client, x, y, button)
            return {"success": True}
        except Exception as e:
            log(f"Error clicking at {x},{y}: {e}")
            log(traceback.format_exc())
            return {"success": False, "error": str(e)}
    
    @mcp.tool()
    async def vnc_text(connection: str, text: str, delay: float = 0.0) -> dict:
        """
        Type text on the remote system.
        
        Args:
            connection: Name of the VNC connection to use
            text: Text to type
            delay: Optional delay after typing (in seconds)
            
        Returns:
            Status of the operation
        """
        client = vnc_manager.get_client(connection)
        if not client:
            success = await vnc_manager.connect(connection)
            if not success:
                return {"success": False, "error": f"Could not connect to {connection}"}
            client = vnc_manager.get_client(connection)
        
        try:
            await send_text(client, text, delay)
            return {"success": True}
        except Exception as e:
            log(f"Error sending text: {e}")
            log(traceback.format_exc())
            return {"success": False, "error": str(e)}
    
    @mcp.tool()
    async def vnc_key(connection: str, key: str, delay: float = 0.0) -> dict:
        """
        Press a key on the remote system.
        
        Args:
            connection: Name of the VNC connection to use
            key: Key to press
            delay: Optional delay after pressing (in seconds)
            
        Returns:
            Status of the operation
        """
        client = vnc_manager.get_client(connection)
        if not client:
            success = await vnc_manager.connect(connection)
            if not success:
                return {"success": False, "error": f"Could not connect to {connection}"}
            client = vnc_manager.get_client(connection)
        
        try:
            await press_key(client, key, delay)
            return {"success": True}
        except Exception as e:
            log(f"Error pressing key {key}: {e}")
            log(traceback.format_exc())
            return {"success": False, "error": str(e)}
    
    @mcp.tool()
    async def vnc_hotkey(connection: str, keys: list[str]) -> dict:
        """
        Press a key combination on the remote system.
        
        Args:
            connection: Name of the VNC connection to use
            keys: List of keys to press (modifiers first, then main key)
            
        Returns:
            Status of the operation
        """
        client = vnc_manager.get_client(connection)
        if not client:
            success = await vnc_manager.connect(connection)
            if not success:
                return {"success": False, "error": f"Could not connect to {connection}"}
            client = vnc_manager.get_client(connection)
        
        try:
            await hotkey(client, *keys)
            return {"success": True}
        except Exception as e:
            log(f"Error pressing hotkey {keys}: {e}")
            log(traceback.format_exc())
            return {"success": False, "error": str(e)}
    
    @mcp.tool()
    async def vnc_screenshot(connection: str, file: str = "screenshot.png") -> dict:
        """
        Take a screenshot of the remote system.
        
        Args:
            connection: Name of the VNC connection to use
            file: Output file path for the screenshot
            
        Returns:
            Status of the operation and the path to the screenshot file
        """
        client = vnc_manager.get_client(connection)
        if not client:
            success = await vnc_manager.connect(connection)
            if not success:
                return {"success": False, "error": f"Could not connect to {connection}"}
            client = vnc_manager.get_client(connection)
        
        try:
            filepath = await take_screenshot(client, file)
            return {"success": True, "file": filepath}
        except Exception as e:
            log(f"Error taking screenshot: {e}")
            log(traceback.format_exc())
            return {"success": False, "error": str(e)}
    
    @mcp.tool()
    async def vnc_ssh(connection: str, command: str) -> dict:
        """
        Execute an SSH command on the remote system.
        
        Args:
            connection: Name of the VNC connection to use
            command: SSH command to execute
            
        Returns:
            Status of the operation and the command output
        """
        if connection not in vnc_manager.connections:
            return {"success": False, "error": f"Connection {connection} not registered"}
        
        info = vnc_manager.connections[connection]
        host, user, pw = info["host"], info["ssh_user"], info["ssh_password"]
        if not all([host, user, pw]):
            return {"success": False, "error": "Missing SSH credentials"}
        
        try:
            stdout, stderr = await run_ssh_command(host, user, pw, command)
            return {"success": True, "stdout": stdout, "stderr": stderr}
        except Exception as e:
            log(f"Error executing SSH command: {e}")
            log(traceback.format_exc())
            return {"success": False, "error": str(e)}
    
    return mcp

# ─── MAIN FUNCTION ───────────────────────────────────────────────
def main():
    """Run the VNC MCP server"""
    try:
        # Create and run the MCP server
        mcp = create_mcp_server()
        
        # The run method handles both stdio and other transport modes
        mcp.run()
    except Exception as e:
        log(f"Fatal error: {e}")
        log(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()