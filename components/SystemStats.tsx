
import React from 'react';
import { SystemStats as SystemStatsType } from '../types';

interface SystemStatsProps {
  stats: SystemStatsType | null;
  isConnected: boolean;
}

const SystemStats: React.FC<SystemStatsProps> = ({ stats, isConnected }) => {
  if (!isConnected) {
    return (
      <div className="bg-gray-900/50 rounded-xl border border-red-500/20 p-5 flex flex-col items-center justify-center text-center py-10">
        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-4 text-red-500 animate-pulse">
          <i className="fas fa-unlink"></i>
        </div>
        <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Host Link Offline</p>
        <p className="text-[9px] text-gray-500 mt-1 uppercase">Awaiting bridge activation...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-xl border border-emerald-500/20 p-5 shadow-xl space-y-4">
      <div className="flex justify-between items-center border-b border-gray-800 pb-3">
        <h2 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
          <i className="fas fa-heartbeat animate-pulse"></i> Host Vitals
        </h2>
        <span className="text-[8px] font-mono text-gray-500">{stats?.platform || 'Detecting...'}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-black/40 p-3 rounded-lg border border-gray-800">
          <div className="text-[8px] text-gray-500 uppercase mb-1">CPU Load</div>
          <div className="text-xs font-mono text-emerald-500 font-bold">{stats?.cpu || '0.0%'}</div>
        </div>
        <div className="bg-black/40 p-3 rounded-lg border border-gray-800">
          <div className="text-[8px] text-gray-500 uppercase mb-1">Memory</div>
          <div className="text-xs font-mono text-blue-400 font-bold">{stats?.memory || '0.0GB'}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[8px] text-gray-500 uppercase tracking-widest">Active Processes</div>
        <div className="space-y-1">
          {stats?.processes?.slice(0, 5).map((proc, i) => (
            <div key={i} className="flex justify-between items-center text-[9px] font-mono py-1 px-2 bg-black/20 rounded">
              <span className="text-gray-400 truncate w-32">{proc}</span>
              <span className="text-emerald-500/50">ACTIVE</span>
            </div>
          )) || <div className="text-[9px] text-gray-700 italic">No process data...</div>}
        </div>
      </div>
    </div>
  );
};

export default SystemStats;
