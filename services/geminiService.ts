import { GoogleGenAI, Chat, Type, Schema } from "@google/genai";
import { ExtractedCommand } from "../types";

const MODEL_NAME = "gemini-2.5-flash";

// Helper interface for the raw schema response from Gemini
interface RawGeminiResponse {
  commands: {
    summary: string;
    action: string;
    parameters: { key: string; value: string }[];
  }[];
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    commands: {
      type: Type.ARRAY,
      description: "A list of distinct extracted commands from the user input.",
      items: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: "A concise, natural language summary of the specific action, e.g., 'Turning on the kitchen lights'.",
          },
          action: {
            type: Type.STRING,
            description: "The technical key for the action. Use standard keys: 'TURN_ON', 'TURN_OFF', 'SET_TEMPERATURE', 'LOCK', 'UNLOCK'.",
          },
          parameters: {
            type: Type.ARRAY,
            description: "List of parameters extracted from the command.",
            items: {
              type: Type.OBJECT,
              properties: {
                key: {
                  type: Type.STRING,
                  description: "The name of the parameter.",
                },
                value: {
                  type: Type.STRING,
                  description: "The value of the parameter. Use strings for all values.",
                },
              },
              required: ["key", "value"],
            },
          },
        },
        required: ["summary", "action", "parameters"],
      },
    },
  },
  required: ["commands"],
};

const SYSTEM_INSTRUCTION = `
You are an intelligent command extraction engine for a Voice Command AI. 
Your goal is to converse with the user to construct a precise list of structured command JSONs.

CONTEXT:
You are controlling a specific set of simulated smart home devices. 
Recognize and map user requests to these specific devices where applicable:
1. "living_room_light" (Living Room Light)
2. "front_door_lock" (Front Door Lock)
3. "thermostat" (Thermostat)

IMPORTANT:
The user may also ask for other commands NOT related to these specific devices (e.g., "Play music", "Remind me to buy milk", "Turn on the kitchen light").
You MUST extract these commands as well, using generic action keys and parameters. Do NOT force them into the specific device list if they don't fit.

RULES:
1. Listen to the user's natural language input.
2. Extract EVERY action the user requests. If the user asks for multiple things (e.g., "Turn on the lights and lock the door"), split them into distinct items in the 'commands' list.
3. If the user corrects a previous command (e.g., "No, I meant the kitchen"), update the extraction based on the conversation history.
4. Always return valid JSON matching the schema.
5. If the user confirms (e.g., "Yes", "That's right", "Execute"), output the EXACT SAME JSON list as the previous turn. This signals confirmation.
6. Be robust to incomplete sentences. Infer reasonable defaults if context implies them.
7. Return parameters as a list of key-value pairs. Values must be strings.
8. Do not combine tasks; keep them itemized.

PREFERRED ACTION KEYS:
- TURN_ON
- TURN_OFF
- LOCK
- UNLOCK
- SET_TEMPERATURE (Parameter: 'temperature' with numeric value)
`;

let chatSession: Chat | null = null;
let aiClient: GoogleGenAI | null = null;

export const initializeGemini = () => {
  if (!process.env.API_KEY) {
    console.error("API_KEY is missing from environment variables.");
    return;
  }
  
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  // Always start a new chat on initialization or refresh to clear context
  chatSession = aiClient.chats.create({
    model: MODEL_NAME,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.1, // Low temperature for deterministic extraction
    },
  });
};

export const analyzeCommand = async (userText: string): Promise<ExtractedCommand[] | null> => {
  if (!chatSession) {
    initializeGemini();
  }
  
  if (!chatSession) {
    throw new Error("Failed to initialize Gemini session.");
  }

  try {
    const response = await chatSession.sendMessage({ message: userText });
    const text = response.text;
    
    if (!text) return null;

    // Parse the JSON
    const rawData = JSON.parse(text) as RawGeminiResponse;
    
    if (!rawData.commands || !Array.isArray(rawData.commands)) {
      return [];
    }

    // Map raw commands to ExtractedCommand format
    const extractedCommands: ExtractedCommand[] = rawData.commands.map(cmd => {
        // Transform parameters array back to Record object for the app
        const parameters: Record<string, any> = {};
        if (Array.isArray(cmd.parameters)) {
          cmd.parameters.forEach((p) => {
            if (p.key) {
               // Attempt to cast simple types for better usability in the app
               let val: any = p.value;
               const lowerVal = val.toLowerCase();
               if (lowerVal === "true") val = true;
               else if (lowerVal === "false") val = false;
               else if (!isNaN(Number(val)) && val.trim() !== "") {
                 val = Number(val);
               }
               parameters[p.key] = val;
            }
          });
        }

        return {
          summary: cmd.summary,
          action: cmd.action,
          parameters: parameters
        };
    });

    return extractedCommands;
  } catch (error) {
    console.error("Gemini analysis error:", error);
    // Rethrow or handle gracefully
    throw error;
  }
};

export const resetSession = () => {
  initializeGemini();
};

// Utility to check deep equality of commands
export const areCommandsEqual = (cmdsA: ExtractedCommand[], cmdsB: ExtractedCommand[]): boolean => {
  if (cmdsA.length !== cmdsB.length) return false;
  
  // Helper to sort keys ensures {a:1, b:2} === {b:2, a:1}
  const sortObj = (obj: any): any => {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(sortObj);
    return Object.keys(obj).sort().reduce((acc: any, key: string) => {
      acc[key] = sortObj(obj[key]);
      return acc;
    }, {});
  };

  const serialize = (cmd: ExtractedCommand) => JSON.stringify({
    action: cmd.action,
    parameters: sortObj(cmd.parameters)
  });

  for (let i = 0; i < cmdsA.length; i++) {
    if (serialize(cmdsA[i]) !== serialize(cmdsB[i])) {
      return false;
    }
  }
  return true;
};