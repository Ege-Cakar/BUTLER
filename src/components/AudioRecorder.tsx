import React, { useState, useEffect } from 'react';

interface AudioRecorderProps {
  onTranscriptionComplete: (text: string) => void;
}

// Define the SpeechRecognition types for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onTranscriptionComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<any>(null);

  // Initialize speech recognition on component mount
  useEffect(() => {
    // Get the SpeechRecognition constructor (handle browser differences)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setErrorMessage('Speech recognition not supported in this browser');
      return;
    }
    
    // Create a new speech recognition instance
    const recognitionInstance = new SpeechRecognition();
    
    // Configure the recognition
    recognitionInstance.continuous = true; // Enable continuous recording
    recognitionInstance.interimResults = true; // Get interim results
    recognitionInstance.lang = 'en-US';
    
    // Track the full transcript during a recording session
    let fullTranscript = '';
    
    // Set up event handlers
    recognitionInstance.onresult = (event: any) => {
      // Get the latest result
      const resultIndex = event.resultIndex;
      const transcript = event.results[resultIndex][0].transcript;
      
      // Check if this is a final result
      const isFinal = event.results[resultIndex].isFinal;
      
      console.log('Transcript update:', transcript, 'isFinal:', isFinal);
      
      if (isFinal) {
        // For final results, add to the full transcript
        fullTranscript += ' ' + transcript;
        fullTranscript = fullTranscript.trim();
        console.log('Updated full transcript:', fullTranscript);
      }
    };
    
    recognitionInstance.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setErrorMessage(`Speech recognition error: ${event.error}`);
      setIsRecording(false);
    };
    
    recognitionInstance.onend = () => {
      console.log('Recognition ended');
      
      // If we're still in recording mode when recognition ends,
      // it means the API timed out, so restart it
      if (isRecording) {
        console.log('Restarting recognition because it ended while still recording');
        try {
          recognitionInstance.start();
        } catch (e) {
          console.error('Error restarting recognition:', e);
          setIsRecording(false);
        }
      } else if (fullTranscript) {
        // Only send the transcript when we're actually stopping recording
        console.log('Sending final transcript:', fullTranscript);
        onTranscriptionComplete(fullTranscript);
        fullTranscript = ''; // Reset for next recording
      }
    };
    
    // Save the recognition instance
    setRecognition(recognitionInstance);
    
    // Clean up on component unmount
    return () => {
      if (recognitionInstance) {
        try {
          recognitionInstance.stop();
        } catch (e) {
          // Ignore errors on cleanup
        }
      }
    };
  }, [onTranscriptionComplete]);

  const toggleRecording = () => {
    if (isRecording) {
      // Stop recording
      if (recognition) {
        try {
          recognition.stop();
          console.log('Manually stopped recording');
        } catch (e) {
          console.error('Error stopping recognition:', e);
        }
      }
      setIsRecording(false);
    } else {
      // Start recording
      setErrorMessage(null);
      if (!recognition) {
        setErrorMessage('Speech recognition not available');
        return;
      }
      
      try {
        recognition.start();
        console.log('Started recording');
        setIsRecording(true);
      } catch (e) {
        console.error('Error starting recognition:', e);
        setErrorMessage('Failed to start speech recognition');
      }
    }
  };

  return (
    <div>
      {errorMessage && <div className="text-red-500 text-sm mb-2">{errorMessage}</div>}
      <button
        onClick={toggleRecording}
        className={`p-2 rounded-full focus:outline-none transition-colors ${isRecording 
          ? 'bg-red-500 hover:bg-red-600 text-white' 
          : 'bg-butler-accent/10 hover:bg-butler-accent/20 text-butler-accent'}`}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      >
        {isRecording ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <rect x="6" y="6" width="12" height="12" strokeWidth="2" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>
    </div>
  );
};

export default AudioRecorder;