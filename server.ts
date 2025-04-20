import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Debug environment variables
console.log('[DEBUG] Environment variables loaded from:', process.env.DOTENV_PATH || '.env.local');
console.log('[DEBUG] CLAUDE_API_KEY present:', !!process.env.CLAUDE_API_KEY);
if (process.env.CLAUDE_API_KEY) {
  process.env.CLAUDE_API_KEY = process.env.CLAUDE_API_KEY.trim();
  console.log('[DEBUG] CLAUDE_API_KEY format:', process.env.CLAUDE_API_KEY.substring(0, 5) + '...');
}

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

    return res.json(openaiResponse.data);
  } catch (error) {
    console.error('Speech-to-text error:', error);
    return res.status(500).json({ error: 'Failed to convert speech to text' });
  }
});

// Claude API endpoint
app.post('/api/claude', async (req, res) => {
  console.log('[DEBUG] Claude API endpoint called');
  try {
    const apiKey = process.env.CLAUDE_API_KEY?.trim();
    console.log('[DEBUG] Claude API key format:', apiKey ? apiKey.substring(0, 5) + '...' : 'not found');
    
    if (!apiKey) {
      console.error('[ERROR] Claude API key not configured or empty');
      return res.status(500).json({ error: 'TEST-NODEMON: Claude API key not configured' });
    }

    const { messages, model = 'claude-3-7-sonnet-20250219' } = req.body;

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

    console.log('[DEBUG] Claude API response received');
    return res.json(response.data);
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

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
