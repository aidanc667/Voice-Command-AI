import React from 'react';
import { Lightbulb, Lock, Unlock, Thermometer } from 'lucide-react';

export interface SmartHomeState {
  livingRoomLight: boolean;
  frontDoorLocked: boolean;
  thermostatTemp: number;
}

interface SmartHomeDashboardProps {
  deviceState: SmartHomeState;
}

export const SmartHomeDashboard: React.FC<SmartHomeDashboardProps> = ({ deviceState }) => {
  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {/* Living Room Light */}
      <div className={`
        relative overflow-hidden rounded-xl p-4 flex flex-col items-center justify-center transition-all duration-500 border
        ${deviceState.livingRoomLight 
          ? 'bg-amber-50 border-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.3)]' 
          : 'bg-slate-50 border-slate-200'
        }
      `}>
        <div className={`p-3 rounded-full mb-2 transition-all duration-500 ${
          deviceState.livingRoomLight ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-400'
        }`}>
          <Lightbulb size={24} className={deviceState.livingRoomLight ? 'fill-current' : ''} />
        </div>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 text-center">Living Room Light</span>
        <span className={`text-lg font-bold ${deviceState.livingRoomLight ? 'text-amber-600' : 'text-slate-400'}`}>
          {deviceState.livingRoomLight ? 'ON' : 'OFF'}
        </span>
      </div>

      {/* Thermostat */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center relative shadow-sm">
        <div className="absolute top-2 right-2 text-slate-300">
          <Thermometer size={16} />
        </div>
        <div className="w-16 h-16 rounded-full border-4 border-indigo-100 flex items-center justify-center mb-2">
           <span className="text-xl font-bold text-slate-700">{deviceState.thermostatTemp}°</span>
        </div>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Thermostat</span>
      </div>

      {/* Front Door Lock */}
      <div className={`
        rounded-xl p-4 flex flex-col items-center justify-center transition-all duration-300 border shadow-sm
        ${deviceState.frontDoorLocked 
          ? 'bg-emerald-50 border-emerald-200' 
          : 'bg-rose-50 border-rose-200'
        }
      `}>
        <div className={`p-3 rounded-full mb-2 transition-colors duration-300 ${
          deviceState.frontDoorLocked ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          {deviceState.frontDoorLocked ? <Lock size={24} /> : <Unlock size={24} />}
        </div>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Front Door</span>
        <span className={`text-lg font-bold ${
          deviceState.frontDoorLocked ? 'text-emerald-600' : 'text-rose-600'
        }`}>
          {deviceState.frontDoorLocked ? 'LOCKED' : 'UNLOCKED'}
        </span>
      </div>
    </div>
  );
};