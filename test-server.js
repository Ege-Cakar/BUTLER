import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Debug mode
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

// Claude API endpoint
app.post('/api/claude', async (req, res) => {
  try {
    // For testing, we'll just return a mock response with markdown
    const mockResponse = {
      id: "msg_" + Date.now(),
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Here's a response with markdown formatting to test the renderer:\n\n" +
                "# Heading Level 1\n\n" +
                "## Heading Level 2\n\n" +
                "This is a paragraph with **bold text** and *italic text*.\n\n" +
                "- List item 1\n" +
                "- List item 2\n" +
                "  - Nested list item\n\n" +
                "1. Ordered list item 1\n" +
                "2. Ordered list item 2\n\n" +
                "```javascript\n" +
                "// This is a code block\n" +
                "function testMarkdown() {\n" +
                "  console.log('Hello, markdown!');\n" +
                "}\n" +
                "```\n\n" +
                "> This is a blockquote\n\n" +
                "And here's a [link](https://example.com)"
        }
      ],
      model: "claude-3-7-sonnet-20250219",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 100
      }
    };

    // Add a delay to simulate API call
    setTimeout(() => {
      res.json(mockResponse);
    }, 500);
  } catch (error) {
    console.error('[ERROR] Claude API error:', error);
    res.status(500).json({ error: 'Failed to get response from Claude' });
  }
});

// ElevenLabs TTS endpoint (mocked for testing)
app.post('/api/elevenlabs/tts', (req, res) => {
  // For testing, we'll just return a success message
  res.json({ success: true, message: "TTS request received (mock)" });
});

// Start server
app.listen(port, () => {
  console.log(`[INFO] Test server running on port ${port}`);
  console.log(`[INFO] Use http://localhost:5173 to access the frontend`);
});
