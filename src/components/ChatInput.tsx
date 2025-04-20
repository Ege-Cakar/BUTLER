import React, { useRef } from 'react'
import { ChevronUpIcon } from '@heroicons/react/24/outline'
import AudioRecorder from './AudioRecorder'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onTranscription?: (text: string) => void
  placeholder?: string
}

export default function ChatInput({ value, onChange, onSubmit, onTranscription, placeholder = 'How can I help you today?' }: ChatInputProps): React.ReactElement {
  // Create a ref for the submit button
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  const handleTranscription = (text: string) => {
    console.log('Transcription received in ChatInput:', text);
    
    // Update the input field
    onChange(text);
    
    // Only proceed if we have valid text
    if (text && text.trim().length > 0) {
      // If the parent component provided an onTranscription handler, use it
      if (onTranscription) {
        console.log('Calling parent onTranscription handler');
        onTranscription(text);
      }
      
      // Use a short delay to ensure the input state is updated
      setTimeout(() => {
        console.log('Auto-submitting transcribed message by clicking submit button');
        // Directly click the submit button
        if (submitButtonRef.current) {
          submitButtonRef.current.click();
        } else {
          // Fallback if ref isn't available
          onSubmit();
        }
      }, 800);
    }
  };
  return (
    <div className="relative mt-2 flex-grow">
      <textarea
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
        }}
        className="block w-full resize-none rounded-2xl border-0 bg-butler-accent/10 py-2.5 px-3.5 text-butler-dark placeholder:text-butler-primary/50 focus:bg-butler-accent/20 focus:ring-1 focus:ring-butler-accent/30 focus:outline-none transition-colors duration-200 ease-in-out sm:text-sm sm:leading-6"
        placeholder={placeholder}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex space-x-2 items-center">
        <AudioRecorder onTranscriptionComplete={handleTranscription} />
        <button
          type="button"
          ref={submitButtonRef}
          onClick={onSubmit}
          className="inline-flex items-center gap-x-1.5 rounded-md bg-butler-primary px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-butler-secondary transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-butler-primary"
        >
          <ChevronUpIcon className="-ml-0.5 h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}