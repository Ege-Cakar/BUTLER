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
  status?: 'sending' | 'sent' | 'error'
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
              
              const butlerMessage: Message = {
                id: crypto.randomUUID(),
                content: responseText,
                sender: 'butler',
                timestamp: new Date(),
                status: 'sent'
              }
              
              setMessages(prev => [...prev, butlerMessage])
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

  const handleSubmit = async () => {
    console.log('handleSubmit called, input:', input, 'isLoading:', isLoading)
    if (!input.trim() || isLoading) return
    
    const trimmedInput = input.trim()
    console.log('Submitting message:', trimmedInput, 'fromSpeech:', fromSpeech)
  
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
  
      const butlerMessage: Message = {
        id: crypto.randomUUID(),
        content: responseText,
        sender: 'butler',
        timestamp: new Date(),
        status: 'sent'
      }
  
      setMessages(prev => [...prev, butlerMessage])
      
      // If the user message was from speech, convert the response to speech
      if (fromSpeech) {
        try {
          console.log('[DEBUG] Converting response to speech via ElevenLabs...')
          console.log('[DEBUG] Response text length:', responseText.length)
          console.log('[DEBUG] Response text preview:', responseText.substring(0, 100) + '...')
          
          console.time('[DEBUG] ElevenLabs API call')
          const ttsResponse = await fetch('http://localhost:3001/api/elevenlabs/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              text: responseText,
              voiceId: 'nPczCjzI2devNBz1zQrb' // Default voice ID
            })
          })
          console.timeEnd('[DEBUG] ElevenLabs API call')
          
          console.log('[DEBUG] ElevenLabs API response status:', ttsResponse.status)
          console.log('[DEBUG] ElevenLabs API response headers:', Object.fromEntries([...ttsResponse.headers.entries()]))
          
          if (ttsResponse.ok) {
            console.time('[DEBUG] Processing audio blob')
            const audioBlob = await ttsResponse.blob()
            console.log('[DEBUG] Audio blob size:', audioBlob.size, 'bytes')
            console.log('[DEBUG] Audio blob type:', audioBlob.type)
            
            const audioUrl = URL.createObjectURL(audioBlob)
            console.log('[DEBUG] Created audio URL:', audioUrl)
            setAudioSrc(audioUrl)
            
            // Play the audio
            if (audioRef.current) {
              console.log('[DEBUG] Playing audio...')
              audioRef.current.play().then(() => {
                console.log('[DEBUG] Audio playback started')
              }).catch(error => {
                console.error('[DEBUG] Audio playback error:', error)
              })
            } else {
              console.error('[DEBUG] Audio ref is null, cannot play audio')
            }
            console.timeEnd('[DEBUG] Processing audio blob')
          } else {
            console.error('[DEBUG] TTS API error:', ttsResponse.status)
            const errorText = await ttsResponse.text()
            console.error('[DEBUG] TTS API error details:', errorText)
          }
        } catch (ttsError) {
          console.error('TTS error:', ttsError)
        }
      }
      
      // Reset the fromSpeech flag
      setFromSpeech(false)
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`rounded-lg px-4 py-2 max-w-sm ${
              message.sender === 'user'
                ? 'bg-butler-secondary/30 text-butler-dark'
                : message.status === 'error'
                ? 'bg-red-100 text-red-900'
                : 'bg-butler-accent/20 text-butler-dark'
            }`}
          >
            <p>{message.content}</p>
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
          }, 1000);
        }}
        placeholder="Type your message..."
      />
    </div>
  </div>
  )
}