
import React from 'react';
import { Heart } from 'lucide-react';

export const CustomerLifecycleHubView = () => (
  <div className="p-8 md:p-10 w-full animate-fadeIn space-y-8">
    {/* Header - Standardized */}
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
        <div>
            <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                <span className="text-[10px] font-black text-brand uppercase tracking-widest">存量用户价值分发就绪</span>
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">客户生命周期管理</h1>
            <p className="text-slate-500 font-medium text-xs mt-1 italic">Customer Lifecycle Hub & Retention Engine</p>
        </div>
    </div>

    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 h-96 flex flex-col items-center justify-center text-slate-300 font-bold text-lg">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-6">
            <Heart size={32} className="text-slate-400" />
        </div>
        <h3 className="text-slate-600 font-bold text-xl mb-2">深耕客户价值，提升复购忠诚</h3>
        <p className="text-slate-400 text-sm">此模块正在全力开发中，敬请期待！</p>
        <p className="text-slate-400 text-sm mt-1">未来将提供智能客户分群、自动化营销旅程设计，以及客户流失预警与激活功能。</p>
    </div>
  </div>
);
