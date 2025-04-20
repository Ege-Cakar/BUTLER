# backend/local_mcp.py
import asyncio
import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading

# Define a simple tool
TOOLS = [
    {
        "name": "echo",
        "description": "Echoes the input message.",
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The message to echo."
                }
            },
            "required": ["message"]
        }
    }
]

class MCPRequestHandler(BaseHTTPRequestHandler):
    def _send_response(self, status_code, content_type, body):
        self.send_response(status_code)
        self.send_header('Content-Type', content_type)
        self.end_headers()
        self.wfile.write(body.encode('utf-8'))

    def do_GET(self):
        if self.path == '/tools':
            response_body = json.dumps({"tools": TOOLS})
            self._send_response(200, 'application/json', response_body)
        else:
            self._send_response(404, 'text/plain', 'Not Found')

    def do_POST(self):
        if self.path == '/execute':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                request_body = json.loads(post_data.decode('utf-8'))
                tool_name = request_body.get('tool_name')
                arguments = request_body.get('arguments')

                if tool_name == 'echo':
                    message = arguments.get('message', 'No message provided')
                    result = f"Echo: {message}"
                    response_body = json.dumps({"result": result})
                    self._send_response(200, 'application/json', response_body)
                else:
                    self._send_response(400, 'application/json', json.dumps({"error": f"Unknown tool: {tool_name}"}))

            except Exception as e:
                self._send_response(500, 'application/json', json.dumps({"error": str(e)}))
        else:
            self._send_response(404, 'text/plain', 'Not Found')

def run_server(port):
    server_address = ('', port)
    httpd = HTTPServer(server_address, MCPRequestHandler)
    print(f'[INFO] Python MCP Server running on port {port}...')
    httpd.serve_forever()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Simple Python MCP Server.')
    parser.add_argument('--port', type=int, required=True, help='Port number for the server')
    args = parser.parse_args()

    # Run the server in a separate thread to allow potential future asyncio use
    server_thread = threading.Thread(target=run_server, args=(args.port,))
    server_thread.daemon = True
    server_thread.start()

    # Keep the main thread alive (useful if we add asyncio loops later)
    try:
        while True:
            asyncio.sleep(1) # Use asyncio sleep if loop is needed
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down Python MCP server...")

