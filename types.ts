
export enum LogType {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
  COMMAND = 'COMMAND',
  SYSTEM = 'SYSTEM'
}

export type CoreType = 'CLOUD' | 'LOCAL';

export interface LogEntry {
  id: string;
  timestamp: string;
  type: LogType;
  message: string;
}

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'planning' | 'executing' | 'completed' | 'failed';
  plan?: string[];
  explanation?: string;
  createdAt: number;
}

export interface NexusMemory {
  user_preferences: Record<string, string>;
  known_files: string[];
  past_findings: string[];
  environment_details: Record<string, string>;
  installed_tools: string[];
  // AI Config
  ollama_url: string;
  ollama_model: string;
}

export interface SystemStats {
  cpu?: string;
  memory?: string;
  uptime?: string;
  processes?: string[];
  platform: string;
}
