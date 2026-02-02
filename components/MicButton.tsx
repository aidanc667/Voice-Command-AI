import React from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface MicButtonProps {
  isListening: boolean;
  isProcessing: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export const MicButton: React.FC<MicButtonProps> = ({ isListening, isProcessing, onClick, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isProcessing}
      className={`
        relative group flex items-center justify-center w-20 h-20 rounded-full shadow-xl transition-all duration-300
        ${isListening 
          ? 'bg-red-500 hover:bg-red-600 scale-110' 
          : 'bg-indigo-600 hover:bg-indigo-700'
        }
        ${(disabled || isProcessing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {/* Ripple Effect when listening */}
      {isListening && (
        <>
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-20 animate-pulse delay-75 scale-125"></span>
        </>
      )}

      <div className="relative z-10 text-white">
        {isProcessing ? (
          <Loader2 size={32} className="animate-spin" />
        ) : isListening ? (
          <MicOff size={32} />
        ) : (
          <Mic size={32} />
        )}
      </div>
    </button>
  );
};
