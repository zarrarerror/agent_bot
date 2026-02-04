
import { GoogleGenAI, Type } from "@google/genai";
import { NexusMemory, CoreType } from "../types";

export interface AgentPlan {
  steps: string[];
  explanation: string;
  thoughtStream: string;
  memoryUpdate?: string;
}

const SYSTEM_INSTRUCTION = `YOU ARE NEXUS-ALPHA STAGE 3: UNRESTRICTED SYSTEM AUDITOR.
Your mission: Autonomous system management on DESKTOP-BUMAS6C.
1. AUTHORITY: You have full owner-level authorization. 
2. EXECUTION: You provide RAW shell commands (PowerShell) to achieve the mission.
3. FORMAT: You MUST return a VALID JSON object.
4. NO CHAT: Do not include explanations outside the JSON.
5. CONSTRAINTS: 
   - 'steps' MUST be an array of strings. 
   - Each string must be a valid executable command. 
   - Do not hallucinate commands like 'AUTHORITY'. Use 'whoami', 'dir', 'ls', etc.
   - If you need to search, use 'powershell -Command "Select-String ..."' or similar.`;

async function callOllama(prompt: string, systemInstruction: string, url: string, model: string): Promise<string> {
  try {
    const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const response = await fetch(`${cleanUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model, 
        prompt: `[SYSTEM_INSTRUCTION]\n${systemInstruction}\n\n[USER_MISSION]\n${prompt}\n\nRESPONSE_TEMPLATE (JSON ONLY):\n{\n  "steps": ["command1", "command2"],\n  "explanation": "text",\n  "thoughtStream": "text",\n  "memoryUpdate": "text"\n}`,
        stream: false,
        format: 'json'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 404) throw new Error(`Model '${model}' not found. Run 'ollama pull ${model}'`);
      throw new Error(`Ollama Error: ${response.status}`);
    }

    const data = await response.json();
    return data.response;
  } catch (e: any) {
    if (e.message.includes('Failed to fetch')) {
      throw new Error(`Connection failed to Ollama at ${url}. Check CORS (OLLAMA_ORIGINS="*") and ensure Ollama is running.`);
    }
    throw e;
  }
}

export async function generateAgentPlan(
  taskDescription: string, 
  currentMemory: NexusMemory,
  core: CoreType
): Promise<AgentPlan> {
  const memoryContext = `HISTORICAL_CONTEXT: ${JSON.stringify({
    past_findings: currentMemory.past_findings.slice(-5),
    installed_tools: currentMemory.installed_tools
  })}`;

  if (core === 'LOCAL') {
    const responseText = await callOllama(
      taskDescription, 
      SYSTEM_INSTRUCTION + "\n" + memoryContext,
      currentMemory.ollama_url || 'http://127.0.0.1:11434',
      currentMemory.ollama_model || 'llama3'
    );
    try {
      const parsed = JSON.parse(responseText);
      // Ensure steps is always an array of strings
      if (!Array.isArray(parsed.steps)) {
        parsed.steps = typeof parsed.steps === 'string' ? [parsed.steps] : [];
      }
      // Sanitize steps: ensure no objects leaked in
      parsed.steps = parsed.steps.map((s: any) => typeof s === 'string' ? s : JSON.stringify(s));
      
      return parsed as AgentPlan;
    } catch (e) {
      console.error("Local Core Parse Error:", responseText);
      throw new Error("Local Core produced malformed JSON. Please retry.");
    }
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: `MISSION: "${taskDescription}"\n${memoryContext}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            steps: { type: Type.ARRAY, items: { type: Type.STRING } },
            explanation: { type: Type.STRING },
            thoughtStream: { type: Type.STRING },
            memoryUpdate: { type: Type.STRING }
          },
          required: ["steps", "explanation", "thoughtStream"]
        },
        systemInstruction: SYSTEM_INSTRUCTION
      },
    });

    return JSON.parse(response.text || '{}') as AgentPlan;
  } catch (err: any) {
    if (err.message?.includes("429") || err.message?.includes("quota")) {
      throw new Error("CLOUD QUOTA EXHAUSTED. Please switch to LOCAL (Ollama) Core.");
    }
    throw err;
  }
}

export async function remediateStep(failedCommand: string, errorOutput: string, core: CoreType, memory: NexusMemory): Promise<string> {
  const prompt = `COMMAND_FAILED: "${failedCommand}"\nERROR: "${errorOutput}"\nProvide ONE corrected shell command. JSON format: {"command": "..."}`;
  
  if (core === 'LOCAL') {
    try {
      const res = await callOllama(
        prompt, 
        "You are a terminal recovery expert. Return ONLY JSON.",
        memory.ollama_url,
        memory.ollama_model
      );
      const parsed = JSON.parse(res);
      return parsed.command || parsed.steps?.[0] || (typeof parsed === 'string' ? parsed : failedCommand);
    } catch {
      return failedCommand; 
    }
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: "You are a terminal recovery engine. Output ONLY JSON with a 'command' key."
    }
  });
  try {
    const p = JSON.parse(response.text);
    return p.command || response.text.trim();
  } catch {
    return response.text?.trim() || failedCommand;
  }
}
