import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ChatInput from '../components/ChatInput'



export default function Dashboard(): React.ReactElement {
  const [input, setInput] = useState('')
  const navigate = useNavigate()

  const handleSubmit = () => {
    if (input.trim()) {
      // Send the message directly to chat and navigate
      const message = input.trim()
      sessionStorage.setItem('pendingMessage', message)
      sessionStorage.setItem('autoSubmit', 'true')
      navigate('/chat')
    }
  }
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="max-w-3xl mx-auto p-4">
          <h1 className="text-3xl font-playfair italic">
            <span className="text-butler-primary">Back at it,</span>{' '}
            <span className="font-semibold not-italic text-butler-primary">BUTLER</span>
          </h1>
      </div>

      <div className="max-w-3xl mx-auto w-full px-4 mt-8">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  )
}