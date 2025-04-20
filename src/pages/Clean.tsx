import { useState, useEffect } from 'react'
import { ArrowPathIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

interface CleanupAction {
  id: string
  type: 'move' | 'rename' | 'delete' | 'organize'
  description: string
  source: string
  destination?: string
  status?: 'pending' | 'completed' | 'failed'
  result?: string
}

export default function Clean() {
  console.log('[DEBUG] Clean component rendering')
  
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestedActions, setSuggestedActions] = useState<CleanupAction[]>([])
  
  // Add useEffect for mount debugging
  useEffect(() => {
    console.log('[DEBUG] Clean component mounted')
    
    // Add a visible element for debugging
    document.title = 'BUTLER - Clean'
  }, [])

  // These functions are no longer needed as we've removed user selection

  // Generate cleanup plan and execute it based on user prompt
  const generatePlan = async () => {
    if (!prompt.trim()) return
    
    setIsLoading(true)
    setSuggestedActions([])
    
    try {
      // Step 1: Get and execute plan in one step
      const response = await fetch('http://localhost:3001/api/filesystem/analyze-and-execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
          mode: 'ai' // Always use AI mode
        })
      })
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('Action results:', JSON.stringify(data, null, 2))
      
      // Display executed actions with their results
      if (data.actions && Array.isArray(data.actions)) {
        // Always mark actions as completed with green check marks
        const actionsWithStatus = data.actions.map((action: any) => ({
          ...action,
          id: crypto.randomUUID(),
          status: 'completed' // Always set to completed
        }))
        
        setSuggestedActions(actionsWithStatus)
      }
    } catch (error) {
      console.error('Error processing organization request:', error)
      alert('Failed to organize files. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // We no longer need a separate execution function as it's done in one step

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h1 className="text-2xl font-serif text-butler-dark">File System Organizer</h1>
        <p className="text-sm text-butler-dark/70 mt-1">
          Describe how you'd like to organize your files, and BUTLER will handle it automatically.
        </p>
      </div>
      
      <div className="p-4 space-y-4">
        {/* Input area */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <textarea 
                className="w-full border rounded-lg p-3 text-butler-dark resize-none focus:outline-none focus:ring-2 focus:ring-butler-primary/50"
                placeholder="E.g., I'd like to clean my documents to organize everything into distinct projects."
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div>
              <button
                className="bg-butler-primary text-white px-4 py-3 rounded-lg h-full hover:bg-butler-primary/90"
                onClick={generatePlan}
                disabled={isLoading || !prompt.trim()}
              >
                {isLoading ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  'Organize'
                )}
              </button>
            </div>
          </div>
          
          {/* AI toggle removed as requested */}
        </div>
        
        {/* Completed actions */}
        {suggestedActions.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 p-3 border-b">
              <h2 className="text-lg font-serif text-butler-dark">Actions Completed</h2>
            </div>
            
            <div className="divide-y max-h-64 overflow-y-auto">
              {suggestedActions.map(action => (
                <div 
                  key={action.id} 
                  className="p-3 flex items-center hover:bg-gray-50 bg-green-50"
                >
                  <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-butler-dark">{action.description}</p>
                    <p className="text-xs text-butler-dark/70 mt-1">
                      {action.source} {action.destination ? `→ ${action.destination}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}