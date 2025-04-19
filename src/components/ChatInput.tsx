import React from 'react'
import { ChevronUpIcon } from '@heroicons/react/24/outline'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
}

export default function ChatInput({ value, onChange, onSubmit, placeholder = 'How can I help you today?' }: ChatInputProps): React.ReactElement {
  return (
    <div className="relative rounded-lg border border-butler-primary/20 shadow-sm bg-white">
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
        className="block w-full resize-none border-0 bg-transparent py-2.5 px-3.5 text-butler-dark placeholder:text-butler-primary/50 focus:ring-0 sm:text-sm sm:leading-6"
        placeholder={placeholder}
      />
      <div className="absolute right-2 bottom-2">
        <button
          type="button"
          onClick={onSubmit}
          className="inline-flex items-center gap-x-1.5 rounded-md bg-butler-primary px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-butler-secondary transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-butler-primary"
        >
          <ChevronUpIcon className="-ml-0.5 h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
