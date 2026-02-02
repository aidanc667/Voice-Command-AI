import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { analyzeCommand, initializeGemini, resetSession, areCommandsEqual } from './services/geminiService';
import { Message, MessageType, ExtractedCommand } from './types';
import { ChatMessage } from './components/ChatMessage';
import { MicButton } from './components/MicButton';
import { SmartHomeDashboard, SmartHomeState } from './components/SmartHomeDashboard';
import { Sparkles, Terminal, Trash2, Volume2, VolumeX } from 'lucide-react';

// Initialize Gemini on load
initializeGemini();

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // State to track the flow
  const [pendingCommands, setPendingCommands] = useState<ExtractedCommand[] | null>(null);
  
  // Controls the "Always On" loop
  const [isActiveSession, setIsActiveSession] = useState(false);

  // Text-to-Speech State - Defaulting to TRUE
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // --- SIMULATED SMART HOME STATE ---
  const [smartHomeState, setSmartHomeState] = useState<SmartHomeState>({
    livingRoomLight: false,
    frontDoorLocked: true,
    thermostatTemp: 72
  });

  // Scroll to top on mount to fix mobile address bar issues
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load voices for natural sounding speech
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };

    loadVoices();
    
    // Chrome requires this event to load voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Handle TTS Toggle off cleanup
  useEffect(() => {
    if (!isTtsEnabled) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [isTtsEnabled]);

  // --- TTS HELPER ---
  const speak = (text: string) => {
    if (!isTtsEnabled) return;

    // NOTE: We do NOT stop listening here anymore. 
    // We allow the mic to stay open, but we use the 'isSpeaking' flag passed 
    // to the hook to gate input ("Software Echo Cancellation").
    setIsSpeaking(true);
    
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Attempt to pick a natural sounding voice
    const preferredVoice = availableVoices.find(v => v.name.includes('Google US English')) 
      || availableVoices.find(v => v.name.includes('Samantha')) 
      || availableVoices.find(v => v.lang === 'en-US' && !v.name.includes('Microsoft')); 

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    // Slight tweaks for better prosody
    utterance.pitch = 1.0;
    utterance.rate = 1.0; 

    utterance.onend = () => {
      // Small delay to ensure we don't pick up the very end of the echo
      setTimeout(() => setIsSpeaking(false), 500);
    };
    
    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  // --- MAIN HANDLER ---
  const handleUserMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Safety check - though the hook shouldn't send data if isSpeaking is true due to the new gate.
    if (isSpeaking) {
      console.log("Ignored input during speech (Safety Gate):", text);
      return;
    }

    const cleanedText = text.toLowerCase().trim().replace(/[.,!?;]/g, '');

    // --- 1. RESTART COMMAND ---
    if (cleanedText === 'restart') {
      resetData();
      return;
    }

    // Add user message to UI
    const newUserMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      type: MessageType.USER_TEXT,
      text: text,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newUserMsg]);

    // --- 2. NO / REJECTION LOGIC ---
    if (pendingCommands) {
      const rejectionKeywords = ['no', 'nope', 'cancel', 'wrong', 'incorrect', 'stop'];
      if (rejectionKeywords.includes(cleanedText)) {
        setPendingCommands(null);
        const responseText = "Ok, please tell me some instructions you want me to perform.";
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          type: MessageType.AI_TEXT,
          text: responseText,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, aiMsg]);
        speak(responseText);
        return;
      }
    }

    // --- 3. PRE-PROCESSING CHECK: SIMPLE CONFIRMATION ---
    // If we have pending commands and the user just says "Yes", skip Gemini entirely and execute.
    // This fixes loops and latency.
    const confirmationKeywords = [
      'yes', 'yeah', 'yep', 'correct', 'right', 'sure', 'ok', 'okay', 
      'do it', 'execute', 'confirm', 'exactly', 'perfect', 'go ahead', 
      'proceed', 'agree', 'sounds good'
    ];
    
    // Check if the input contains a confirmation keyword
    const isAffirmative = confirmationKeywords.some(keyword => 
       new RegExp(`\\b${keyword}\\b`, 'i').test(cleanedText)
    );
    
    const wordCount = cleanedText.split(/\s+/).length;
    
    // Heuristic: If it's affirmative and short (< 5 words), it's likely a direct confirmation
    // e.g., "Yes please", "Yes execute it", "Okay do it"
    const isSimpleConfirmation = pendingCommands && isAffirmative && wordCount <= 4;

    if (isSimpleConfirmation && pendingCommands) {
      // IMMEDIATE EXECUTION - Bypass AI
      executeCommands(pendingCommands);
      setPendingCommands(null);
      return;
    }

    // --- 4. AI PROCESSING ---
    setIsProcessing(true);

    try {
      const newCommands = await analyzeCommand(text);
      
      if (newCommands && newCommands.length > 0) {
        
        // Strict Match: AI returns exactly the same JSON as before
        const isStrictMatch = pendingCommands && areCommandsEqual(pendingCommands, newCommands) && isAffirmative;

        if (isStrictMatch) {
          executeCommands(pendingCommands || newCommands);
          setPendingCommands(null); 
        } else {
          // New proposal or revision
          setPendingCommands(newCommands);
          
          const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'ai',
            type: MessageType.AI_PROPOSAL,
            commandData: newCommands,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, aiMsg]);

          const speechParts = newCommands.map((cmd, i) => `${i + 1}... ${cmd.summary}`);
          const speechText = `I heard: ${speechParts.join('. ')}. Should I execute?`;
          speak(speechText);
        }
      } else {
        // --- NO COMMANDS EXTRACTED ---
        
        // GREETING FALLBACK
        const greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'hi there'];
        const isGreeting = greetings.some(g => cleanedText === g || cleanedText.startsWith(g + ' '));

        if (isGreeting) {
          const greetingText = "Hello! Please give me some instructions you want me to perform.";
          const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'ai',
            type: MessageType.AI_TEXT,
            text: greetingText,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, aiMsg]);
          speak(greetingText);
        } else {
          // Genuine failure
          const errorMsg: Message = {
             id: (Date.now() + 1).toString(),
             role: 'ai',
             type: MessageType.AI_PROPOSAL, 
             timestamp: Date.now()
          };
          setMessages(prev => [...prev, errorMsg]);
          speak("I couldn't understand that command. Could you try phrasing it differently?");
        }
      }

    } catch (err) {
      console.error(err);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        type: MessageType.SYSTEM_INFO,
        text: "Sorry, I had trouble connecting. Please try again.",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
      speak("Sorry, I had trouble connecting. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [pendingCommands, isSpeaking, isTtsEnabled, availableVoices]); // Dependencies

  // --- SPEECH HOOK ---
  const { 
    isListening, 
    transcript, 
    startListening, 
    stopListening, 
    resetTranscript,
    hasRecognitionSupport,
    error: speechError 
  } = useSpeechRecognition({
    onSpeechEnd: handleUserMessage,
    shouldIgnoreInput: isSpeaking // BLOCK INPUT WHILE SPEAKING
  });

  // Sync active session state with speech errors
  // Filter out minor "no-speech" errors that are common on mobile loops
  useEffect(() => {
    if (speechError && speechError !== 'no-speech' && speechError !== 'aborted') {
      setIsActiveSession(false);
    }
  }, [speechError]);

  const executeCommands = (commands: ExtractedCommand[]) => {
    setSmartHomeState(prevState => {
      const newState = { ...prevState };
      
      commands.forEach(cmd => {
        const action = cmd.action.toUpperCase();
        const device = cmd.parameters.device ? String(cmd.parameters.device).toLowerCase() : '';
        
        const isLivingRoomLight = device === 'living_room_light' || (device.includes('living') && (device.includes('light') || device.includes('lamp')));
        const isFrontDoorLock = device === 'front_door_lock' || (device.includes('front') && (device.includes('door') || device.includes('lock')));
        const isThermostat = device === 'thermostat' || action === 'SET_TEMPERATURE';

        if (isLivingRoomLight) {
          if (action === 'TURN_ON' || action === 'TURN_ON_DEVICE') newState.livingRoomLight = true;
          if (action === 'TURN_OFF' || action === 'TURN_OFF_DEVICE') newState.livingRoomLight = false;
        }

        if (isFrontDoorLock) {
          if (action === 'LOCK') newState.frontDoorLocked = true;
          if (action === 'UNLOCK') newState.frontDoorLocked = false;
        }

        if (isThermostat) {
          const val = cmd.parameters.temperature || cmd.parameters.value;
          if (val && !isNaN(Number(val))) {
            newState.thermostatTemp = Number(val);
          }
        }
      });
      
      return newState;
    });

    const summaryText = commands.length === 1 
      ? commands[0].summary 
      : `${commands.length} actions executed.`;

    const successMsg: Message = {
      id: Date.now().toString(),
      role: 'system',
      type: MessageType.EXECUTION_SUCCESS,
      text: `Executed: ${summaryText}`,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, successMsg]);
    speak("Executed.");
  };

  const resetData = () => {
    setMessages([]);
    resetSession();
    resetTranscript();
    setPendingCommands(null);
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const handleManualReset = () => {
    resetData();
    setIsActiveSession(false);
    stopListening();
  };

  const toggleSession = () => {
    if (isActiveSession) {
      setIsActiveSession(false);
      stopListening();
    } else {
      // UNLOCK MOBILE TTS: Play a silent sound on explicit user interaction
      if (isTtsEnabled) {
         const utter = new SpeechSynthesisUtterance('');
         utter.volume = 0;
         window.speechSynthesis.speak(utter);
      }
      setIsActiveSession(true);
      startListening();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 max-w-3xl mx-auto shadow-2xl overflow-hidden relative">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center space-x-2">
           <div className="bg-indigo-600 p-2 rounded-lg">
             <Terminal className="text-white w-5 h-5" />
           </div>
           <div>
             <h1 className="text-lg font-bold text-slate-800 leading-none">Voice Command AI</h1>
             <p className="text-xs text-slate-500 font-medium">Continuous Voice Mode</p>
           </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* TTS Toggle */}
          <button
            onClick={() => setIsTtsEnabled(!isTtsEnabled)}
            className={`p-2 rounded-full transition-colors ${
              isTtsEnabled ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'
            }`}
            title={isTtsEnabled ? "Mute Voice Response" : "Enable Voice Response"}
          >
            {isTtsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>

          <button 
            onClick={handleManualReset}
            className="text-slate-400 hover:text-red-500 transition-colors p-2"
            title="Reset Session"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
        
        {/* Mock Smart Home Dashboard */}
        <SmartHomeDashboard deviceState={smartHomeState} />

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center text-slate-400 opacity-60 mt-10">
            <Sparkles size={48} className="mb-4 text-indigo-300" />
            <p className="text-lg font-medium">Tap the mic to start</p>
            <p className="text-sm font-medium mt-2 max-w-sm">
              Speak a command. Pause to submit. Confirm with "Yes" or correct it naturally.
            </p>
            <p className="text-xs max-w-xs mt-4">
              Try saying "Turn on the living room light" or "Set thermostat to 75".
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <ChatMessage 
            key={msg.id} 
            message={msg} 
            isLast={idx === messages.length - 1}
          />
        ))}
        
        {/* Live Transcript Bubble (while speaking) */}
        {isListening && transcript && !isSpeaking && (
           <div className="flex w-full justify-end mb-6 animate-pulse">
              <div className="flex max-w-[85%] md:max-w-[70%] flex-row-reverse items-end gap-2">
                 <div className="w-8 h-8 rounded-full bg-indigo-400 flex items-center justify-center flex-shrink-0 mb-1">
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                 </div>
                 <div className="bg-indigo-500/50 text-white/90 px-5 py-3 rounded-2xl rounded-br-none text-base">
                    {transcript}
                 </div>
              </div>
           </div>
        )}
        
        {speechError && (
          <div className="flex justify-center my-2">
            <span className="text-xs text-red-500 bg-red-50 px-3 py-1 rounded-full border border-red-100">
              {speechError === 'no-speech' ? 'Listening...' : speechError}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Footer / Controls */}
      <div className="bg-white/80 backdrop-blur-md border-t border-slate-200 p-6 pb-8 flex flex-col items-center justify-center relative z-20 shrink-0">
        
        {/* Helper Text */}
        <div className={`absolute top-[-30px] transition-all duration-300 ${isListening && !isSpeaking ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
           <span className="bg-slate-800 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
             <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
             Listening... (Pause 3s to send)
           </span>
        </div>
        
        {/* Speaking Indicator */}
        {isSpeaking && (
           <div className="absolute top-[-30px] opacity-100 translate-y-0">
             <span className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-bounce">
               <Volume2 size={12} />
               Speaking... (Mic ignoring input)
             </span>
           </div>
        )}

        <div className="flex items-center gap-6">
           {/* Fallback Text Input (Optional, hidden on small screens) */}
           {!isActiveSession && !isProcessing && !isSpeaking && (
             <div className="hidden md:flex absolute left-6 bottom-8 right-32">
                <input 
                  type="text" 
                  placeholder="Or type command..." 
                  className="w-full bg-slate-100 border-none rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUserMessage(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
             </div>
           )}

           <MicButton 
             isListening={isActiveSession && !isSpeaking} 
             isProcessing={isProcessing} 
             onClick={toggleSession}
             disabled={!hasRecognitionSupport}
           />
        </div>
        
        <p className={`text-xs mt-4 font-medium transition-colors ${speechError ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
          {speechError 
            ? "Microphone access denied or failed. Tap button to retry." 
            : isActiveSession 
              ? "Tap to stop session" 
              : "Tap to start continuous mode"
          }
        </p>

        {!hasRecognitionSupport && (
           <p className="text-red-500 text-sm mt-4 text-center">
             Voice recognition not supported in this browser. Please use Chrome/Edge.
           </p>
        )}
      </div>
    </div>
  );
};

export default App;