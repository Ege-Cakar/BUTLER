import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

dotenv.config();
const app = express();
const port = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/api/speech-to-text', async (req: Request, res: Response) => {
  try {
    const { audioData } = req.body;

    if (!audioData || !audioData.startsWith('data:audio')) {
      return res.status(400).json({ error: 'Invalid audio data' });
    }

    const base64Data = audioData.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const tempFilePath = path.join(__dirname, `temp_audio_${Date.now()}.webm`);

    fs.writeFileSync(tempFilePath, buffer);

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

    fs.unlinkSync(tempFilePath);
    res.json({ text: openaiResponse.data.text });
  } catch (error: any) {
    console.error('Whisper API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Claude API endpoint
app.post('/api/claude', async (req, res) => {
  try {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }

    const { messages, model = 'claude-3-opus-20240229' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model,
        messages,
        max_tokens: 4000,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      }
    );

    return res.json(response.data);
  } catch (error) {
    console.error('Claude API error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to communicate with Claude API' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
