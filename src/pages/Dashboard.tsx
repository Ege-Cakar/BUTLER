import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ChatInput from '../components/ChatInput'
import { ChatBubbleLeftRightIcon, FolderIcon } from '@heroicons/react/24/outline'

export default function Dashboard(): React.ReactElement {
  const [input, setInput] = useState('')
  const [fromSpeech, setFromSpeech] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = (speechInput = false) => {
    if (input.trim()) {
      const message = input.trim()
      sessionStorage.setItem('pendingMessage', message)
      sessionStorage.setItem('autoSubmit', 'true')
      sessionStorage.setItem('fromSpeech', speechInput ? 'true' : 'false')
      console.log('[DEBUG] Dashboard sending message with fromSpeech:', speechInput)
  
      navigate('/chat')
    }
  }
  
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="max-w-3xl mx-auto p-4">
          <h1 className="text-3xl">
            <span className="text-butler-primary font-sans">Back at it,</span>{' '}
            <span className="text-butler-primary font-serif font-medium not-italic">BUTLER</span>
          </h1>
      </div>

      {/* Navigation Cards */}
      <div className="max-w-3xl mx-auto w-full px-4 mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Chat Card */}
        <div 
          className="border rounded-lg p-6 hover:bg-butler-accent/5 hover:border-butler-primary/30 cursor-pointer transition-all"
          onClick={() => navigate('/chat')}
        >
          <div className="flex items-center">
            <ChatBubbleLeftRightIcon className="h-8 w-8 text-butler-primary" />
            <h2 className="text-xl font-serif ml-3 text-butler-dark">Chat with BUTLER</h2>
          </div>
          <p className="mt-2 text-butler-dark/70">
            Ask questions, get assistance, or just have a conversation.
          </p>
        </div>
        
        {/* Clean Card */}
        <div 
          className="border rounded-lg p-6 hover:bg-butler-accent/5 hover:border-butler-primary/30 cursor-pointer transition-all"
          onClick={() => navigate('/clean')}
        >
          <div className="flex items-center">
            <FolderIcon className="h-8 w-8 text-butler-primary" />
            <h2 className="text-xl font-serif ml-3 text-butler-dark">Clean & Organize</h2>
          </div>
          <p className="mt-2 text-butler-dark/70">
            Organize your files and folders with natural language commands.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto w-full px-4 mt-8">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onTranscription={(text: string) => {
            console.log('[DEBUG] Dashboard received transcription:', text)
            setInput(text)
            setFromSpeech(true) // Still good for UI feedback etc.
            // Auto-submit with speech flag set to true
            setTimeout(() => {
              handleSubmit(true) // Pass true to indicate this came from speech
            }, 500)
          }}
        />
      </div>
    </div>
  )
}