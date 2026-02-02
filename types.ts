// Message Types
export enum MessageType {
  USER_TEXT = 'USER_TEXT',
  AI_TEXT = 'AI_TEXT',
  AI_PROPOSAL = 'AI_PROPOSAL',
  SYSTEM_INFO = 'SYSTEM_INFO',
  EXECUTION_SUCCESS = 'EXECUTION_SUCCESS',
}

export interface ExtractedCommand {
  summary: string;     // Human readable summary "Turn on the kitchen lights"
  action: string;      // machine key "turn_on"
  parameters: Record<string, any>; // { device: "lights", location: "kitchen" }
  missingInfo?: string; // If the AI needs more info, it can populate this (optional feature)
}

export interface Message {
  id: string;
  role: 'user' | 'ai' | 'system';
  type: MessageType;
  text?: string;
  commandData?: ExtractedCommand[]; // Changed to array to support multiple commands
  timestamp: number;
}

// Browser Speech API Types (Augmentation)
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}