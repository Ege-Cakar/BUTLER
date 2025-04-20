import React, { useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import ChatInput from '../components/ChatInput'



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

      <div className="p-4">
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