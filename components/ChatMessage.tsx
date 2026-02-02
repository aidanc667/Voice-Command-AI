import React from 'react';
import { Message, MessageType } from '../types';
import { Check, User, Bot, Mic } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isLast }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem && message.type === MessageType.EXECUTION_SUCCESS) {
     return (
        <div className="flex justify-center my-4 animate-fade-in">
           <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full flex items-center space-x-2 text-sm font-medium border border-green-200 shadow-sm">
              <Check className="w-4 h-4" />
              <span>{message.text}</span>
           </div>
        </div>
     );
  }

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[95%] md:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
        
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mb-1 ${
          isUser ? 'bg-indigo-500 text-white' : 'bg-emerald-500 text-white'
        }`}>
          {isUser ? <User size={16} /> : <Bot size={16} />}
        </div>

        {/* Bubble */}
        <div className={`flex flex-col space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
          
          <div className={`px-5 py-3 rounded-2xl shadow-sm text-base leading-relaxed break-words relative
            ${isUser 
              ? 'bg-indigo-600 text-white rounded-br-none' 
              : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'
            }`}>
            {message.type === MessageType.USER_TEXT && <p>{message.text}</p>}
            {message.type === MessageType.AI_TEXT && <p>{message.text}</p>}
            
            {message.type === MessageType.AI_PROPOSAL && message.commandData && message.commandData.length > 0 && (
               <div className="space-y-3">
                 <p className="font-medium text-slate-900 text-lg">
                   I heard:
                 </p>
                 <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                    {message.commandData.map((cmd, idx) => (
                      <div key={idx} className="border-b border-slate-200 last:border-0 pb-3 last:pb-0">
                        <div className="flex items-start gap-2">
                           <span className="bg-slate-200 text-slate-600 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-1 flex-shrink-0">
                             {idx + 1}
                           </span>
                           <div className="w-full">
                              <p className="text-lg font-semibold text-slate-800">
                                {cmd.summary}
                              </p>
                              <div className="text-xs text-slate-500 font-mono mt-1 overflow-x-auto bg-slate-100 p-2 rounded">
                                <span className="font-bold text-slate-600">ACT:</span> {cmd.action}
                                <span className="mx-2">|</span>
                                <span className="font-bold text-slate-600">PARAMS:</span> {JSON.stringify(cmd.parameters)}
                              </div>
                           </div>
                        </div>
                      </div>
                    ))}
                 </div>
                 
                 {/* Confirmation Prompt */}
                 {isLast && (
                   <div className="pt-2 flex items-center text-indigo-600 font-medium animate-pulse">
                     <Mic className="w-4 h-4 mr-2" />
                     <span className="text-sm">Listening for "Yes" or correction...</span>
                   </div>
                 )}
               </div>
            )}
            
            {message.type === MessageType.AI_PROPOSAL && (!message.commandData || message.commandData.length === 0) && (
                <p>I couldn't understand that command. Could you try phrasing it differently?</p>
            )}
            
            {message.type === MessageType.SYSTEM_INFO && <p>{message.text}</p>}
          </div>
          
          <span className="text-xs text-slate-400 px-1">
             {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};