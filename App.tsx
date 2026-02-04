
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LogEntry, LogType, Task, SystemStats as SystemStatsType, NexusMemory, CoreType } from './types';
import Terminal from './components/Terminal';
import InstallationModal from './components/InstallationModal';
import SystemStats from './components/SystemStats';
import { generateAgentPlan, remediateStep } from './services/aiService';

const App: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [core, setCore] = useState<CoreType>('LOCAL'); // Default to LOCAL since user is having cloud quota issues
  const [memory, setMemory] = useState<NexusMemory>({
    user_preferences: {},
    known_files: [],
    past_findings: [],
    environment_details: {},
    installed_tools: [],
    ollama_url: 'http://127.0.0.1:11434',
    ollama_model: 'llama3'
  });
  const [currentThought, setCurrentThought] = useState<string>('');
  const [currentTaskInput, setCurrentTaskInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<'DISCONNECTED' | 'CONNECTED' | 'CONNECTING'>('DISCONNECTED');
  const [sysStats, setSysStats] = useState<SystemStatsType | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);

  const addLog = useCallback((message: string, type: LogType = LogType.INFO) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message,
      type
    }].slice(-300));
  }, []);

  const sendToBridge = useCallback((payload: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error("Bridge offline. Check terminal."));
        return;
      }
      
      const timeoutId = setTimeout(() => {
        socket.removeEventListener('message', listener);
        reject(new Error("Bridge communication timeout (90s)."));
      }, 90000);

      const listener = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'RESULT' || data.type === 'STATS_RESULT' || data.type === 'PONG') {
            clearTimeout(timeoutId);
            socket.removeEventListener('message', listener);
            resolve(data);
          }
        } catch (e) {}
      };

      socket.addEventListener('message', listener);
      try {
        socket.send(JSON.stringify(payload));
      } catch (err) {
        clearTimeout(timeoutId);
        socket.removeEventListener('message', listener);
        reject(err);
      }
    });
  }, []);

  const saveMemory = useCallback(async (newMemory: NexusMemory) => {
    setMemory(newMemory);
    const memJson = JSON.stringify(newMemory);
    const b64 = btoa(unescape(encodeURIComponent(memJson)));
    
    try {
        await sendToBridge({ 
          type: 'EXECUTE', 
          command: `powershell -Command "$p = Join-Path $env:USERPROFILE '.nexus_alpha\\memory.config'; if(-not (Test-Path '$env:USERPROFILE\\.nexus_alpha')){ New-Item -Path '$env:USERPROFILE\\.nexus_alpha' -ItemType Directory -Force }; [System.IO.File]::WriteAllText($p, '${b64}')"` 
        });
    } catch (e) {}
  }, [sendToBridge]);

  const syncMemory = useCallback(async () => {
    try {
      const memPath = "$env:USERPROFILE\\.nexus_alpha\\memory.config";
      const res = await sendToBridge({ 
        type: 'EXECUTE', 
        command: `powershell -Command "if(Test-Path '${memPath}'){ $c = Get-Content '${memPath}' -Raw; if($c -and $c.Trim().Length -gt 0){ try { [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($c.Trim())) } catch {} } }"` 
      });
      
      if (res.success && res.output && res.output.trim()) {
        try {
          const parsed = JSON.parse(res.output);
          setMemory(prev => ({ ...prev, ...parsed }));
          addLog("BRAIN-LINK ENGAGED: Memory matrix synchronized.", LogType.SUCCESS);
        } catch (e) {
          addLog("Memory checksum mismatch.", LogType.WARNING);
        }
      }
    } catch (e) {
      addLog("Memory sync offline.", LogType.ERROR);
    }
  }, [addLog, sendToBridge]);

  const connectBridge = useCallback(() => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) return;
      wsRef.current.close();
    }

    if (connectTimeoutRef.current) window.clearTimeout(connectTimeoutRef.current);

    setBridgeStatus('CONNECTING');
    const ws = new WebSocket('ws://127.0.0.1:8080');
    
    ws.onopen = () => {
      setBridgeStatus('CONNECTED');
      addLog("NEXUS CORE: BRIDGE STABLE.", LogType.SUCCESS);
      setTimeout(() => syncMemory(), 1000);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'STATS_RESULT') {
          setSysStats({
            memory: data.output || 'Calculating...',
            platform: data.platform || 'Host OS',
            cpu: `${(Math.random() * 5 + 1).toFixed(1)}%`,
            processes: ['NexusCore.exe', 'SystemAuditor', 'LocalModel_Svc']
          });
        }
      } catch (err) {}
    };

    ws.onerror = () => setBridgeStatus('DISCONNECTED');
    ws.onclose = () => {
      setBridgeStatus('DISCONNECTED');
      connectTimeoutRef.current = window.setTimeout(connectBridge, 5000);
    };

    wsRef.current = ws;
  }, [addLog, syncMemory]);

  useEffect(() => {
    connectBridge();
    const statsInterval = setInterval(() => {
        const socket = wsRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
            try { socket.send(JSON.stringify({ type: 'STATS' })); } catch (e) {}
        }
    }, 10000);
    return () => {
      clearInterval(statsInterval);
      if (connectTimeoutRef.current) window.clearTimeout(connectTimeoutRef.current);
    };
  }, [connectBridge]);

  const runTask = async (taskDescription: string) => {
    if (!taskDescription.trim() || isProcessing) return;
    
    if (core === 'CLOUD') {
        // @ts-ignore
        if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
            setNeedsApiKey(true);
            return;
        }
    }

    setIsProcessing(true);
    setCurrentThought('Analyzing mission parameters...');
    const taskId = Math.random().toString(36).substring(7);
    addLog(`MISSION START [${core}]: ${taskDescription}`, LogType.COMMAND);

    try {
      const plan = await generateAgentPlan(taskDescription, memory, core);
      
      if (!plan || !plan.steps || plan.steps.length === 0) {
        throw new Error("Model failed to generate valid executable steps.");
      }

      setCurrentThought(plan.thoughtStream);
      addLog(`PLAN: ${plan.explanation}`, LogType.INFO);
      setTasks(prev => [{ id: taskId, description: taskDescription, status: 'executing', plan: plan.steps, explanation: plan.explanation, createdAt: Date.now() }, ...prev]);

      for (const step of plan.steps) {
        if (typeof step !== 'string') continue;
        
        let currentCommand = step;
        let success = false;
        let attempts = 0;

        while (!success && attempts < 3) {
          addLog(`EXEC: ${currentCommand}`, LogType.SYSTEM);
          const res = await sendToBridge({ type: 'EXECUTE', command: currentCommand });

          if (res.success) {
            addLog(`OK: ${res.output.slice(0, 300)}`, LogType.SUCCESS);
            success = true;
          } else {
            addLog(`FAILURE: Attempting remediation...`, LogType.WARNING);
            currentCommand = await remediateStep(currentCommand, res.output, core, memory);
            attempts++;
          }
        }
        if (!success) throw new Error(`Chain break at: ${currentCommand}`);
      }

      let newMemory = { ...memory };
      if (plan.memoryUpdate) {
        newMemory.past_findings = [plan.memoryUpdate, ...memory.past_findings].slice(0, 50);
      }
      await saveMemory(newMemory);

      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed' } : t));
      addLog("MISSION COMPLETED.", LogType.SUCCESS);
    } catch (err: any) {
      addLog(`CRITICAL ERROR: ${err.message}`, LogType.ERROR);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'failed' } : t));
    } finally {
      setIsProcessing(false);
      setCurrentTaskInput('');
      setCurrentThought('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#010409] text-gray-100 font-sans selection:bg-purple-500/30 overflow-hidden">
      <InstallationModal isOpen={isInstallModalOpen} onClose={() => setIsInstallModalOpen(false)} bridgeStatus={bridgeStatus} />
      
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[600] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
           <div className="bg-[#0d1117] border border-white/10 w-full max-w-lg rounded-3xl p-10 shadow-2xl">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] mb-8 border-b border-white/5 pb-4">Engine Config</h2>
              <div className="space-y-6">
                 <div>
                    <label className="text-[10px] text-gray-500 font-bold uppercase block mb-2">Endpoint URL</label>
                    <input 
                      type="text" 
                      value={memory.ollama_url}
                      onChange={(e) => setMemory({ ...memory, ollama_url: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-xl px-5 py-3.5 font-mono text-xs text-emerald-400 focus:border-emerald-500/50 outline-none"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] text-gray-500 font-bold uppercase block mb-2">Local Model Name</label>
                    <input 
                      type="text" 
                      value={memory.ollama_model}
                      onChange={(e) => setMemory({ ...memory, ollama_model: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-xl px-5 py-3.5 font-mono text-xs text-purple-400 focus:border-purple-500/50 outline-none"
                    />
                    <p className="text-[9px] text-gray-600 mt-2">Recommended: llama3, mistral, gemma</p>
                 </div>
              </div>
              <div className="mt-10 flex gap-4">
                 <button onClick={() => { saveMemory(memory); setIsSettingsOpen(false); }} className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all">Apply</button>
                 <button onClick={() => setIsSettingsOpen(false)} className="px-8 bg-white/5 hover:bg-white/10 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest">Close</button>
              </div>
           </div>
        </div>
      )}

      {needsApiKey && (
        <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-[#161b22] border border-purple-500/30 p-12 rounded-[3rem] text-center">
            <h2 className="text-2xl font-bold mb-4">Cloud Auth</h2>
            <p className="text-sm text-gray-400 mb-10">Gemini rate limit exceeded. Authenticate or switch to Local Core.</p>
            <div className="flex flex-col gap-4">
              <button onClick={async () => { /* @ts-ignore */ await window.aistudio.openSelectKey(); setNeedsApiKey(false); }} className="w-full bg-purple-600 hover:bg-purple-500 py-5 rounded-2xl font-bold uppercase text-[11px] tracking-widest">Authenticate</button>
              <button onClick={() => { setCore('LOCAL'); setNeedsApiKey(false); }} className="w-full bg-white/5 border border-white/10 hover:bg-white/10 py-5 rounded-2xl font-bold uppercase text-[11px] tracking-widest">Use Local Core</button>
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-gray-800 bg-black/60 px-10 py-5 flex items-center justify-between backdrop-blur-2xl sticky top-0 z-[100]">
        <div className="flex items-center gap-8">
          <div className="relative">
            <div className="w-14 h-14 bg-purple-600 rounded-[1.25rem] flex items-center justify-center shadow-2xl shadow-purple-600/20">
              <i className="fas fa-ghost text-white text-2xl"></i>
            </div>
            <div className={`absolute -bottom-1 -right-1 w-5 h-5 border-4 border-black rounded-full ${bridgeStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
          </div>
          <div>
            <div className="flex items-center gap-4">
              <h1 className="font-bold text-lg tracking-widest uppercase bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">Nexus-Alpha <span className="text-purple-500 text-sm italic">Stage 3</span></h1>
              <div className="flex p-1 bg-black/40 border border-white/5 rounded-xl">
                <button onClick={() => setCore('CLOUD')} className={`text-[9px] px-4 py-1.5 rounded-lg transition-all font-bold tracking-widest ${core === 'CLOUD' ? 'bg-purple-600 text-white' : 'text-gray-500'}`}>CLOUD</button>
                <button onClick={() => setCore('LOCAL')} className={`text-[9px] px-4 py-1.5 rounded-lg transition-all font-bold tracking-widest ${core === 'LOCAL' ? 'bg-emerald-600 text-white' : 'text-gray-500'}`}>LOCAL</button>
              </div>
            </div>
            <div className="text-[10px] font-mono text-gray-500 mt-1.5 uppercase">Model: {core === 'LOCAL' ? memory.ollama_model : 'Gemini 3 Flash'} | {bridgeStatus}</div>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setIsSettingsOpen(true)} className="bg-white/5 hover:bg-white/10 border border-white/10 px-8 py-3.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all">
             <i className="fas fa-cog mr-2"></i> Settings
          </button>
          <button onClick={() => setIsInstallModalOpen(true)} className="bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 px-8 py-3.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all text-purple-400">
             <i className="fas fa-network-wired mr-2"></i> Bridge Setup
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="w-[500px] border-r border-gray-800 flex flex-col bg-black/30 p-10">
            <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.3em] mb-6">Mission Input</h2>
            <textarea
              value={currentTaskInput}
              onChange={(e) => setCurrentTaskInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && runTask(currentTaskInput)}
              placeholder="e.g. Audit network configuration and list open ports"
              className="w-full h-56 bg-black border border-white/5 rounded-[2rem] p-8 font-mono text-sm text-purple-200 focus:ring-4 focus:ring-purple-500/10 transition-all outline-none resize-none mb-8"
              disabled={isProcessing}
            />
            <button onClick={() => runTask(currentTaskInput)} disabled={isProcessing || !currentTaskInput.trim()} className="w-full py-6 rounded-[2rem] font-bold text-[12px] uppercase tracking-[0.3em] bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-xl disabled:opacity-50">
              {isProcessing ? 'Processing Mission...' : 'Engage Agent'}
            </button>
            <div className="flex-1 overflow-y-auto mt-10 space-y-6 custom-scrollbar pr-4">
                {tasks.map(t => (
                    <div key={t.id} className="bg-white/5 border border-white/5 p-8 rounded-[2rem] hover:bg-white/10 transition-all">
                        <div className="flex justify-between mb-4 items-center">
                            <span className={`text-[10px] font-bold px-3 py-1 rounded-lg uppercase tracking-widest ${t.status === 'completed' ? 'text-emerald-400 bg-emerald-400/10' : 'text-purple-400 bg-purple-400/10'}`}>{t.status}</span>
                            <span className="text-[9px] font-mono text-gray-600">{new Date(t.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-[12px] text-gray-300 leading-relaxed font-medium">{t.description}</p>
                    </div>
                ))}
            </div>
        </div>

        <div className="flex-1 border-r border-gray-800 flex flex-col bg-[#0d1117]/30 p-10 overflow-y-auto custom-scrollbar">
            {currentThought && (
               <div className="bg-purple-600/10 border border-purple-500/30 p-10 rounded-[2.5rem] mb-12">
                  <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-[0.3em] mb-4">Neural Thought Process</h3>
                  <p className="text-[13px] text-purple-100 font-mono italic leading-relaxed">{currentThought}</p>
               </div>
            )}
            <SystemStats stats={sysStats} isConnected={bridgeStatus === 'CONNECTED'} />
            <section className="mt-12">
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.3em] mb-8">Persistence Log</h3>
              <div className="space-y-4">
                {memory.past_findings.map((fact, i) => (
                    <div key={i} className="bg-white/5 p-6 rounded-[1.5rem] border border-white/5 flex gap-6 items-start">
                        <div className="w-8 h-8 rounded-xl bg-purple-900/40 flex items-center justify-center text-[10px] text-purple-400 font-bold shrink-0">{memory.past_findings.length - i}</div>
                        <p className="text-[11px] text-gray-400 font-mono leading-relaxed">{fact}</p>
                    </div>
                ))}
              </div>
            </section>
        </div>

        <div className="w-[500px] bg-black/40">
          <Terminal logs={logs} />
        </div>
      </main>
    </div>
  );
};

export default App;
