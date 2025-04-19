import { useState, useRef, useEffect } from 'react'
import ChatInput from '../components/ChatInput'

interface Message {
  id: string
  content: string
  sender: 'user' | 'butler'
  timestamp: Date
  status?: 'sending' | 'sent' | 'error'
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
    
    if (pendingMessage) {
      setInput(pendingMessage)
      sessionStorage.removeItem('pendingMessage')
      
      // If autoSubmit is set, submit the message immediately
      if (autoSubmit) {
        sessionStorage.removeItem('autoSubmit')
        const message: Message = {
          id: crypto.randomUUID(),
          content: pendingMessage,
          sender: 'user',
          timestamp: new Date(),
          status: 'sending'
        }
        setMessages(prev => [...prev, message])
        setInput('')
        setIsLoading(true)
        // Add your message handling logic here
      }
    }
  }, [])

  const handleSubmit = async () => {

    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: input.trim(),
      sender: 'user',
      timestamp: new Date(),
      status: 'sent'
    }
    
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Simulate BUTLER response
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const butlerMessage: Message = {
        id: crypto.randomUUID(),
        content: 'I am here to assist you. How can I help?',
        sender: 'butler',
        timestamp: new Date(),
        status: 'sent'
      }
      setMessages(prev => [...prev, butlerMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        content: 'Sorry, I encountered an error. Please try again.',
        sender: 'butler',
        timestamp: new Date(),
        status: 'error'
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col">
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
          placeholder="Type your message..."
        />
      </div>
    </div>
  )
}
