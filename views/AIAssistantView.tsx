import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MessageCircle, Bot, ChevronDown, Sparkles, LoaderCircle, AlertCircle, Clipboard, UserCircle, ShieldCheck, Brain, Search, Plus, Trash2, Edit3, UploadCloud, Download, BookOpen, Send, X, CheckCircle2, Zap, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { ProductSKU, Shop, KnowledgeBaseItem } from '../lib/types';
import { callQwen } from '../lib/ai';
import { DB } from '../lib/db';

export const AIAssistantView = ({ skus, shops, addToast }: { skus: ProductSKU[], shops: Shop[], addToast: any }) => {
    const [activeTab, setActiveTab] = useState<'chat' | 'viki'>('chat');
    const [selectedSkuId, setSelectedSkuId] = useState<string>('');
    const [question, setQuestion] = useState('');
    const [chatResponse, setChatResponse] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [vikiItems, setVikiItems] = useState<KnowledgeBaseItem[]>([]);

    const handleAsk = async () => {
        if (!question) return;
        setIsLoading(true);
        setChatResponse('');
        try {
            const matchedViki = vikiItems.find(i => question.includes(i.question) || i.question.includes(question));
            const sku = skus.find(s => s.id === selectedSkuId);
            const prompt = `你是金牌客服。背景: ${sku ? `${sku.name}, 价格 ¥${sku.sellingPrice}` : '通用'}。知识库参考: ${matchedViki?.answer || '无'}。提问: "${question}"。请礼貌简短回复：`;
            const result = await callQwen(prompt);
            setChatResponse(result || '');
        } catch (err: any) { 
            addToast('error', 'Gemini 引擎离线', err.message); 
        } finally { setIsLoading(false); }
    };

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-10 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">智能客服助手 (Gemini)</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Neural CS Copilot Powered by Google Gemini</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-2xl">
                    <button onClick={() => setActiveTab('chat')} className={`px-8 py-2.5 rounded-xl text-xs font-black ${activeTab === 'chat' ? 'bg-white shadow-md' : 'text-slate-400'}`}>智能会话</button>
                    <button onClick={() => setActiveTab('viki')} className={`px-8 py-2.5 rounded-xl text-xs font-black ${activeTab === 'viki' ? 'bg-white shadow-md' : 'text-slate-400'}`}>VIKI 知识库</button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-4 space-y-8">
                    <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 space-y-8">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">挂载资产</label>
                         <select value={selectedSkuId} onChange={e => setSelectedSkuId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-[24px] px-6 py-4 text-sm font-black text-slate-700 outline-none">
                             <option value="">-- 通用模式 --</option>
                             {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                         </select>
                    </div>
                </div>
                <div className="lg:col-span-8 h-[600px] flex flex-col bg-white rounded-[48px] shadow-sm border border-slate-100 overflow-hidden relative">
                     <div className="flex-1 overflow-y-auto p-10 space-y-8 no-scrollbar">
                        {chatResponse ? (<div className="flex gap-4 animate-fadeIn"><div className="w-10 h-10 rounded-2xl bg-brand flex items-center justify-center text-white shrink-0"><Bot size={24} /></div><div className="bg-white border border-slate-100 px-6 py-5 rounded-3xl text-[15px] font-bold text-slate-700 leading-loose">{chatResponse}</div></div>) : <div className="h-full flex items-center justify-center text-slate-200 font-black uppercase tracking-widest opacity-20">Ready to assist</div>}
                     </div>
                     <div className="p-8 bg-white border-t border-slate-50">
                         <div className="relative">
                            <input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAsk()} placeholder="输入客户问题..." className="w-full bg-slate-50 border border-slate-200 rounded-[32px] pl-8 pr-40 py-6 text-sm font-black outline-none focus:border-brand" />
                            <button onClick={handleAsk} disabled={isLoading || !question} className="absolute right-3 top-3 bottom-3 px-10 rounded-[24px] bg-brand text-white font-black text-xs hover:bg-[#5da035] shadow-xl disabled:opacity-30">
                                {isLoading ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />} 建议回复
                            </button>
                         </div>
                     </div>
                </div>
            </div>
        </div>
    );
};
