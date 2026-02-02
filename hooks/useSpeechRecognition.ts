import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSpeechRecognitionProps {
  onSpeechEnd?: (text: string) => void;
  shouldIgnoreInput?: boolean;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  hasRecognitionSupport: boolean;
  error: string | null;
}

export const useSpeechRecognition = ({ 
  onSpeechEnd, 
  shouldIgnoreInput = false 
}: UseSpeechRecognitionProps = {}): UseSpeechRecognitionReturn => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const silenceTimer = useRef<any>(null);
  
  // Refs to hold latest values without triggering effect updates
  const onSpeechEndRef = useRef(onSpeechEnd);
  const shouldIgnoreInputRef = useRef(shouldIgnoreInput);

  // Update refs
  useEffect(() => {
    onSpeechEndRef.current = onSpeechEnd;
  }, [onSpeechEnd]);

  useEffect(() => {
    shouldIgnoreInputRef.current = shouldIgnoreInput;
  }, [shouldIgnoreInput]);
  
  // Track where we are in the continuous stream results
  const processedIndex = useRef<number>(0);
  
  // Intended state (user wants it on) vs actual state
  const shouldBeListening = useRef(false);

  const hasRecognitionSupport = !!(typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition));

  // Initialize Recognition
  useEffect(() => {
    if (!hasRecognitionSupport) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true; 
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      // GATING LOGIC: If AI is speaking, ignore this input completely
      if (shouldIgnoreInputRef.current) {
        // Advance the cursor to the end of this result set so we never process it
        processedIndex.current = event.results.length;
        setTranscript(''); // Keep visual clean
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        return;
      }

      // Clear silence timer on every new word
      if (silenceTimer.current) clearTimeout(silenceTimer.current);

      let currentSegment = '';
      
      // Only build transcript from results we haven't processed ("soft submitted") yet
      for (let i = processedIndex.current; i < event.results.length; ++i) {
        currentSegment += event.results[i][0].transcript;
      }
      
      setTranscript(currentSegment);

      // Reset timer for 3 seconds of silence
      silenceTimer.current = setTimeout(() => {
        if (currentSegment.trim().length > 0) {
          // Double check gate before submitting (in case it flipped during the wait)
          if (shouldIgnoreInputRef.current) {
             setTranscript('');
             processedIndex.current = event.results.length;
             return;
          }

          // 1. Send the data via Ref
          if (onSpeechEndRef.current) {
             onSpeechEndRef.current(currentSegment);
          }
          
          // 2. Advance the cursor so we ignore this text in future renders
          processedIndex.current = event.results.length;
          
          // 3. Clear local transcript display
          setTranscript('');
        }
        // CRITICAL: We do NOT call recognition.stop() here. 
        // We keep the mic open to prevent mobile browsers from blocking the restart.
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);

      if (event.error === 'not-allowed') {
        setError("Microphone access denied.");
        setIsListening(false);
        shouldBeListening.current = false;
      } else if (event.error === 'no-speech') {
        // Common on mobile when silence is detected. Do NOT set global error state to prevent UI reset.
        // We will simply restart in onend.
      } else if (event.error === 'aborted') {
        // Ignore aborted
      } else {
        // Network or other error, set state but might still try to restart
        setError(event.error);
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      setIsListening(false);

      // Auto-restart if we intended to keep listening
      // On mobile, this needs to happen even if 'no-speech' or 'network' error occurred
      if (shouldBeListening.current) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.warn("Failed to auto-restart recognition", e);
          }
        }, 100);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [hasRecognitionSupport]); 

  const startListening = useCallback(() => {
    if (recognitionRef.current) {
      setError(null);
      shouldBeListening.current = true;
      try {
        // Reset our cursor because a fresh start resets result index to 0
        processedIndex.current = 0;
        setTranscript('');
        recognitionRef.current.start();
      } catch (e) {
        console.warn("Speech recognition already started or failed to start", e);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    shouldBeListening.current = false;
    if (recognitionRef.current) {
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      recognitionRef.current.stop();
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    hasRecognitionSupport,
    error,
  };
};