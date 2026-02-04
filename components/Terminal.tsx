
import React, { useEffect, useRef } from 'react';
import { LogEntry, LogType } from '../types';

interface TerminalProps {
  logs: LogEntry[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogColor = (type: LogType) => {
    switch (type) {
      case LogType.INFO: return 'text-blue-400';
      case LogType.WARNING: return 'text-yellow-400';
      case LogType.ERROR: return 'text-red-400';
      case LogType.SUCCESS: return 'text-emerald-400';
      case LogType.COMMAND: return 'text-purple-400 font-bold';
      case LogType.SYSTEM: return 'text-gray-400 italic';
      default: return 'text-gray-300';
    }
  };

  const getLogIcon = (type: LogType) => {
    switch (type) {
      case LogType.INFO: return <i className="fas fa-info-circle mr-2 opacity-70"></i>;
      case LogType.WARNING: return <i className="fas fa-exclamation-triangle mr-2"></i>;
      case LogType.ERROR: return <i className="fas fa-times-circle mr-2"></i>;
      case LogType.SUCCESS: return <i className="fas fa-check-circle mr-2"></i>;
      case LogType.COMMAND: return <i className="fas fa-chevron-right mr-2"></i>;
      case LogType.SYSTEM: return <i className="fas fa-microchip mr-2 opacity-50"></i>;
      default: return null;
    }
  };

  return (
    <div className="bg-black/80 backdrop-blur-md rounded-lg border border-gray-800 h-full flex flex-col shadow-2xl overflow-hidden">
      <div className="bg-gray-900 px-4 py-2 border-b border-gray-800 flex items-center justify-between">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
          <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
        </div>
        <div className="text-xs font-mono text-gray-500 flex items-center gap-2">
          <i className="fas fa-terminal"></i>
          NEXUS-ALPHA_v1.0.4_SHELL
        </div>
        <div className="w-10"></div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 p-4 font-mono text-sm overflow-y-auto space-y-1 custom-scrollbar"
      >
        {logs.length === 0 && (
          <div className="text-gray-600 animate-pulse">Waiting for system initialization...</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex flex-col group">
            <div className="flex items-start">
              <span className="text-[10px] text-gray-700 mr-3 w-16 shrink-0 mt-1 select-none">
                [{log.timestamp}]
              </span>
              <span className={`${getLogColor(log.type)} break-all`}>
                {getLogIcon(log.type)}
                {log.message}
              </span>
            </div>
          </div>
        ))}
        <div className="flex items-center text-emerald-500 animate-pulse mt-2">
          <i className="fas fa-caret-right mr-2"></i>
          <span className="w-2 h-4 bg-emerald-500"></span>
        </div>
      </div>
    </div>
  );
};

export default Terminal;
