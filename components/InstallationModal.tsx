
import React, { useState } from 'react';

interface InstallationModalProps {
  isOpen: boolean;
  onClose: () => void;
  bridgeStatus: 'DISCONNECTED' | 'CONNECTED' | 'CONNECTING';
}

const InstallationModal: React.FC<InstallationModalProps> = ({ isOpen, onClose, bridgeStatus }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'windows' | 'ollama'>('windows');

  if (!isOpen) return null;

  const windowsOneLiner = `npm install ws && powershell -Command "Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; [System.IO.File]::WriteAllText('nexus_core.js', 'const WebSocket=require(''ws'');const {exec}=require(''child_process'');const wss=new WebSocket.Server({port:8080});wss.on(''connection'',ws=>{console.log(''Agent Linked.'');ws.on(''message'',m=>{try{const d=JSON.parse(m);if(d.type===''PING'')return ws.send(JSON.stringify({type:''PONG''}));if(d.type===''STATS'')return exec(''powershell -Command (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'',(e,o)=>ws.send(JSON.stringify({type:''STATS_RESULT'',output:(o||'''').trim()+''KB Free'',platform:''Windows'' })));if(d.type===''EXECUTE''){console.log(''EXEC:'',d.command);exec(d.command,(e,o,se)=>{ws.send(JSON.stringify({type:''RESULT'',output:o||se,success:!e}));});}}catch(err){console.error(''Parse Error'',err);}});});console.log(''NEXUS BRIDGE ACTIVE ON PORT 8080'');'); node nexus_core.js"`;

  const ollamaInstructions = `1. Install Ollama from ollama.com
2. Set OLLAMA_ORIGINS env var to "*"
   - Win: [System.Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', '*', 'User')
3. COMPLETELY RESTART OLLAMA (Quit from system tray first)
4. Pull your model: 'ollama pull llama3'
5. Ensure Ollama is running at http://127.0.0.1:11434`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[600] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4">
      <div className="bg-[#0d1117] border border-purple-500/40 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        <div className="px-8 py-6 border-b border-gray-800 flex justify-between items-center bg-purple-900/10">
          <h2 className="text-xs font-bold uppercase tracking-widest">Host Integration Console</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><i className="fas fa-times"></i></button>
        </div>

        <div className="p-8">
          <div className="flex gap-4 mb-8 border-b border-gray-800">
            <button onClick={() => setActiveTab('windows')} className={`pb-4 px-2 text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'windows' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500'}`}>Bridge Bridge</button>
            <button onClick={() => setActiveTab('ollama')} className={`pb-4 px-2 text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'ollama' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-500'}`}>Local Core (Ollama)</button>
          </div>

          <div className="bg-black p-6 rounded-2xl border border-white/5 font-mono text-[11px] text-purple-300 break-all relative group shadow-inner min-h-[150px]">
            {activeTab === 'windows' ? (
              <div className="leading-relaxed">
                {windowsOneLiner}
              </div>
            ) : (
              <pre className="whitespace-pre-wrap text-emerald-300 leading-relaxed">{ollamaInstructions}</pre>
            )}
            <button onClick={() => copyToClipboard(activeTab === 'windows' ? windowsOneLiner : ollamaInstructions)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                <i className={`fas ${copied ? 'fa-check text-emerald-500' : 'fa-copy'}`}></i>
            </button>
          </div>
          
          <p className="mt-6 text-[10px] text-gray-500 leading-relaxed italic uppercase tracking-tighter">
            {activeTab === 'windows' 
              ? "This command starts the local execution bridge. Keep the terminal open." 
              : "Ollama must be configured with OLLAMA_ORIGINS='*' or the browser will block requests."}
          </p>
        </div>

        <div className="p-8 border-t border-gray-800 flex justify-end bg-black/40">
           <button onClick={onClose} className="bg-purple-600 hover:bg-purple-500 px-10 py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all">Close Console</button>
        </div>
      </div>
    </div>
  );
};

export default InstallationModal;
