import { useState, useRef, useEffect } from 'react'
import ChatInput from '../components/ChatInput'

interface ClaudeContent {
  text: string
  type: string
}

interface Message {
  id: string
  content: string
  sender: 'user' | 'butler'
  timestamp: Date
  status?: 'sending' | 'sent' | 'error' | 'thinking'
}

// Animated ellipsis component
function AnimatedEllipsis() {
  const [dots, setDots] = useState('');
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '') return '.';
        if (prev === '.') return '..';
        if (prev === '..') return '...';
        return '';
      });
    }, 500);
    
    return () => clearInterval(interval);
  }, []);
  
  // Fixed-width container to prevent text shifting
  return <span className="inline-block w-[24px]">{dots}</span>;
}

export default function Chat() {
  console.log('[DEBUG] Chat component rendering');
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [fromSpeech, setFromSpeech] = useState(false)
  const [audioSrc, setAudioSrc] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])



  // Check for pending message from Dashboard
  useEffect(() => {
    const pendingMessage = sessionStorage.getItem('pendingMessage')
    const autoSubmit = sessionStorage.getItem('autoSubmit')
    const speechInput = sessionStorage.getItem('fromSpeech') === 'true'
    console.log('Checking pending message:', { pendingMessage, autoSubmit, speechInput })
    
    if (pendingMessage) {
      // First set the input for visual feedback, then clear it
      setInput(pendingMessage)
      sessionStorage.removeItem('pendingMessage')
      
      // Set the fromSpeech flag based on sessionStorage
      if (speechInput) {
        console.log('[DEBUG] Message was from speech input, setting fromSpeech flag')
        setFromSpeech(true)
        sessionStorage.removeItem('fromSpeech')
      }
      
      // If autoSubmit is set, submit the message immediately
      if (autoSubmit) {
        sessionStorage.removeItem('autoSubmit')
        
        // Use a timeout to ensure state is updated before submitting
        setTimeout(() => {
          console.log('Auto-submitting message:', pendingMessage)
          
          const userMessage: Message = {
            id: crypto.randomUUID(),
            content: pendingMessage,
            sender: 'user',
            timestamp: new Date(),
            status: 'sent'
          }
          
          // Clear the input field immediately
          setInput('')
          setMessages(prev => [...prev, userMessage])
          setIsLoading(true)
          
          // Send to Claude API
          setTimeout(async () => {
            try {
              console.log('Sending auto-submitted message to Claude API...')
              
              // Prepare placeholder message ID
              const placeholderId = crypto.randomUUID();
              
              // Only show placeholder if response takes longer than 1.5 seconds
              const placeholderTimeout = setTimeout(() => {
                setMessages(prev => [...prev, {
                  id: placeholderId,
                  content: 'Allow me to consider your request',
                  sender: 'butler',
                  timestamp: new Date(),
                  status: 'thinking'
                }]);
              }, 1500);
              
              // Send request to our Claude API endpoint
              const response = await fetch('http://localhost:3001/api/claude', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  model: 'claude-3-7-sonnet-20250219',
                  messages: [
                    { role: 'user', content: pendingMessage }
                  ]
                })
              })
              
              // Clear the timeout and remove placeholder message if it was added
              clearTimeout(placeholderTimeout);
              setMessages(prev => prev.filter(msg => msg.id !== placeholderId))
              
              if (!response.ok) {
                const errorText = await response.text()
                console.error('API error:', response.status, errorText)
                throw new Error(`API error: ${response.status} ${errorText}`)
              }
              
              const data = await response.json()
              console.log('Claude API response for auto-submit:', data)
              
              const content = data.content as ClaudeContent[]
              const responseText = content[0].text
                ? content[0].text
                : 'Sorry, I could not generate a response.'
              console.log('Auto-submit response:', responseText)
              
              // Create a message with a unique ID
              const butlerId = crypto.randomUUID();
              
              // Add empty message that will be streamed into
              setMessages(prev => [...prev, {
                id: butlerId,
                content: '',
                sender: 'butler',
                timestamp: new Date(),
                status: 'sending'
              }]);
              
              // Simulate streaming by updating the message character by character
              let currentText = '';
              for (let i = 0; i < responseText.length; i++) {
                setTimeout(() => {
                  currentText += responseText[i];
                  setMessages(prev => 
                    prev.map(msg => 
                      msg.id === butlerId 
                        ? { ...msg, content: currentText } 
                        : msg
                    )
                  );
                  
                  // When we reach the end, update status to sent
                  if (i === responseText.length - 1) {
                    setMessages(prev => 
                      prev.map(msg => 
                        msg.id === butlerId 
                          ? { ...msg, status: 'sent' } 
                          : msg
                      )
                    );
                  }
                }, i * 15); // 15ms per character
              }
            } catch (error) {
              console.error('Error in auto-submit response:', error)
              console.error('Error details:', JSON.stringify(error, null, 2))
              
              const errorMessage: Message = {
                id: crypto.randomUUID(),
                content: 'Sorry, I encountered an error. Please try again. Error: ' + (error instanceof Error ? error.message : 'Unknown error'),
                sender: 'butler',
                timestamp: new Date(),
                status: 'error'
              }
              
              setMessages(prev => [...prev, errorMessage])
            } finally {
              setIsLoading(false)
            }
          }, 1000)
        }, 100)
      }
    }
  }, [])

  const handleCommand = async (command: string, _args: string) => {
    try {
      if (command === 'help') {
        return `Available commands:\n- /help: Show this help message`;
      } else {
        return `Unknown command: ${command}. Type /help for available commands.`;
      }
    } catch (error) {
      console.error(`Error executing command ${command}:`, error);
      return `Error executing command ${command}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  };

  const handleSubmit = async () => {
    console.log('handleSubmit called, input:', input, 'isLoading:', isLoading)
    if (!input.trim() || isLoading) return
    
    const trimmedInput = input.trim()
    console.log('Submitting message:', trimmedInput, 'fromSpeech:', fromSpeech)
    
    // Check if input is a command
    if (trimmedInput.startsWith('/')) {
      const parts = trimmedInput.substring(1).split(' ');
      const command = parts[0];
      const args = parts.slice(1).join(' ');
      
      const userMessage: Message = {
        id: crypto.randomUUID(),
        content: trimmedInput,
        sender: 'user',
        timestamp: new Date(),
        status: 'sent'
      };
      
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);
      
      try {
        const response = await handleCommand(command, args);
        
        const commandResponse: Message = {
          id: crypto.randomUUID(),
          content: response,
          sender: 'butler',
          timestamp: new Date(),
          status: 'sent'
        };
        
        setMessages(prev => [...prev, commandResponse]);
      } catch (error) {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          content: 'Error processing command: ' + (error instanceof Error ? error.message : 'Unknown error'),
          sender: 'butler',
          timestamp: new Date(),
          status: 'error'
        };
        
        setMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
      
      return;
    }
  
    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: trimmedInput,
      sender: 'user',
      timestamp: new Date(),
      status: 'sent'
    }
  
    setMessages(prev => {
      console.log('Adding user message to messages array')
      return [...prev, userMessage]
    })
    setInput('')
    setIsLoading(true)
  
    try {
      console.log('Sending request to Claude API...')
      
      // Prepare placeholder message ID
      const placeholderId = crypto.randomUUID();
      
      // Only show placeholder if response takes longer than 1.5 seconds
      const placeholderTimeout = setTimeout(() => {
        setMessages(prev => [...prev, {
          id: placeholderId,
          content: 'Allow me to consider your request',
          sender: 'butler',
          timestamp: new Date(),
          status: 'thinking'
        }]);
      }, 1500);
      

      
      // Send request to our Claude API endpoint
      const response = await fetch('http://localhost:3001/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-7-sonnet-20250219',
          messages: [
            { role: 'user', content: trimmedInput }
          ]
        })
      })
      
      // Clear the timeout and remove placeholder message if it was added
      clearTimeout(placeholderTimeout);
      setMessages(prev => prev.filter(msg => msg.id !== placeholderId))
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('API error:', response.status, errorText)
        throw new Error(`API error: ${response.status} ${errorText}`)
      }
      
      
      const data = await response.json()
      console.log('Claude API response:', data)
      
      const content = data.content as ClaudeContent[]
      const responseText = Array.isArray(content)
        ? content[0].text
        : 'Sorry, I could not generate a response.'
        // Create a message with a unique ID
      const butlerId = crypto.randomUUID();
      
      // Add empty message that will be streamed into
      setMessages(prev => [...prev, {
        id: butlerId,
        content: '',
        sender: 'butler',
        timestamp: new Date(),
        status: 'sending'
      }]);
      
      // Simulate streaming by updating the message character by character
      let currentText = '';
      for (let i = 0; i < responseText.length; i++) {
        setTimeout(() => {
          currentText += responseText[i];
          setMessages(prev => 
            prev.map(msg => 
              msg.id === butlerId 
                ? { ...msg, content: currentText } 
                : msg
            )
          );
          
          // When we reach the end, update status to sent and handle text-to-speech
          if (i === responseText.length - 1) {
            setMessages(prev => 
              prev.map(msg => 
                msg.id === butlerId 
                  ? { ...msg, status: 'sent' } 
                  : msg
              )
            );
            
            // If the user message was from speech, convert the response to speech
            if (fromSpeech) {
              try {
                console.log('[DEBUG] Converting response to speech via ElevenLabs...')
                console.log('[DEBUG] Response text length:', responseText.length)
                console.log('[DEBUG] Response text preview:', responseText.substring(0, 100) + '...')
                
                console.time('[DEBUG] ElevenLabs API call')
                fetch('http://localhost:3001/api/elevenlabs/tts', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    text: responseText,
                    voiceId: 'nPczCjzI2devNBz1zQrb' // Default voice ID
                  })
                })
                .then(ttsResponse => {
                  console.timeEnd('[DEBUG] ElevenLabs API call')
                  console.log('[DEBUG] ElevenLabs API response status:', ttsResponse.status)
                  
                  if (ttsResponse.ok) {
                    return ttsResponse.blob()
                  } else {
                    throw new Error(`TTS API error: ${ttsResponse.status}`)
                  }
                })
                .then(audioBlob => {
                  console.log('[DEBUG] Audio blob size:', audioBlob.size, 'bytes')
                  const audioUrl = URL.createObjectURL(audioBlob)
                  setAudioSrc(audioUrl)
                })
                .catch(error => {
                  console.error('[DEBUG] TTS error:', error)
                })
              } catch (ttsError) {
                console.error('TTS error:', ttsError)
              }
            }
            
            // Reset the fromSpeech flag
            setFromSpeech(false)
          }
        }, i * 15); // 15ms per character
      }
    } catch (error) {
      console.error('Claude API error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
  
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        content: 'Sorry, I encountered an error. Please try again. Error: ' + (error instanceof Error ? error.message : 'Unknown error'),
        sender: 'butler',
        timestamp: new Date(),
        status: 'error'
      }
  
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }
  

  console.log('[DEBUG] Chat component messages:', messages);

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col">
      {/* Audio player for TTS responses */}
      {audioSrc && (
        <audio 
          ref={audioRef}
          src={audioSrc} 
          className="hidden" // Hidden but functional
          controls={false} 
          autoPlay={true}
          onEnded={() => setAudioSrc(null)}
        />
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
        {/* Regular messages */}
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`rounded-lg px-4 py-2 max-w-sm break-words ${
              message.sender === 'user'
                ? 'bg-butler-secondary/30 text-butler-dark'
                : message.status === 'error'
                ? 'bg-red-100 text-red-900'
                : 'bg-butler-accent/20 text-butler-dark'
            }`}
          >
            <p>
              {message.content}
              {message.status === 'thinking' && <AnimatedEllipsis />}
            </p>
            <p className="text-xs mt-1 text-butler-dark/70">
              {message.timestamp.toLocaleTimeString()}
            </p>
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
    
    <div className="p-4 border-t">
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}

        onTranscription={(text: string) => {
          console.log('Transcription received in Chat component:', text);
          setInput(text);
          // Set the fromSpeech flag to true
          setFromSpeech(true);
          // Directly call handleSubmit after a short delay
          setTimeout(() => {
            console.log('Auto-submitting from Chat component');
            handleSubmit();
          }, 1);
        }}
        placeholder="Send a message..."
      />

    </div>
  </div>
  )
}