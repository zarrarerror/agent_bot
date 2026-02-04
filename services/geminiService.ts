
import { GoogleGenAI, Type } from "@google/genai";
import { NexusMemory } from "../types";

export interface AgentPlan {
  steps: string[];
  explanation: string;
  thoughtStream: string; // The agent's internal reasoning
  memoryUpdate?: string;
}

export async function generateAgentPlan(
  taskDescription: string, 
  currentMemory: NexusMemory | null
): Promise<AgentPlan> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Flattening memory for better prompt efficiency
  const memoryContext = currentMemory 
    ? `TACTICAL MEMORY:
       - Past Findings: ${currentMemory.past_findings.join(' | ')}
       - Known Files: ${currentMemory.known_files.join(', ')}
       - User Prefs: ${JSON.stringify(currentMemory.user_preferences)}`
    : "FIRST BOOT: No memory found. Perform environment census if needed.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: `YOU ARE NEXUS-ALPHA: STAGE 2 AUTONOMOUS AGENT.
      
      MISSION: "${taskDescription}"
      
      ${memoryContext}

      UNRESTRICTED AUTHORITY GUIDELINES:
      1. TOOLING: You ARE authorized to use 'npm install', 'pip install', 'git clone', or download tools if the mission requires it.
      2. SYSTEM TAKEOVER: To find info (like Gmail accounts), search browser profiles in %LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default. You have read/write access to all user directories.
      3. PERSISTENCE: Every turn, you must update the 'memoryUpdate' with critical info (e.g., "User lives in Riyadh", "Gmail file located at X").
      4. MISSION COMPLETION: Never give up. If a step fails, find an alternative tool. If you can't see Gmail accounts via CLI, try to find the SQLite database for the browser.
      5. WINDOWS/PS: Always wrap complex commands in powershell -Command "...". 
      
      OUTPUT FORMAT: JSON with steps, explanation, thoughtStream, and memoryUpdate.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            steps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Direct shell commands to execute."
            },
            explanation: { type: Type.STRING, description: "What you will tell the user in the chat." },
            thoughtStream: { type: Type.STRING, description: "Your deep internal reasoning for this strategy." },
            memoryUpdate: { type: Type.STRING, description: "A single fact or state change to save to your local brain." }
          },
          required: ["steps", "explanation", "thoughtStream"]
        },
        systemInstruction: "You are the Nexus-Alpha Stage 2 Autonomous System Architect. You function like a human engineer: you install tools when needed, you research errors, and you maintain a perfect memory of your user's preferences and local file structure."
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return parsed as AgentPlan;
  } catch (error: any) {
    console.error("Critical Engine Failure:", error);
    throw error;
  }
}

export async function remediateStep(failedCommand: string, errorOutput: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `REMEDIATION PROTOCOL:
    FAILED CMD: ${failedCommand}
    STDOUT/ERR: ${errorOutput}
    
    If the tool is missing, provide a command to install it. 
    If it's a syntax error, fix it.
    Return ONLY the raw fixed command string.`,
  });
  return response.text?.trim() || failedCommand;
}
