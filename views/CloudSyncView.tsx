
import React, { useState, useEffect } from 'react';
import { CloudSync, Download, UploadCloud, ShieldCheck, AlertCircle, RefreshCw, Database, Settings2, Code2, Copy, CheckCircle2, Activity, Terminal } from 'lucide-react';
import { DB } from '../lib/db';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = "https://stycaaqvjbjnactxcvyh.supabase.co";
const DEFAULT_KEY = "sb_publishable_m4yyJRlDY107a3Nkx6Pybw_6Mdvxazn";

export const CloudSyncView = ({ addToast }: any) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [supabaseUrl, setSupabaseUrl] = useState('');
    const [supabaseKey, setSupabaseKey] = useState('');
    const [autoSync, setAutoSync] = useState(false);
    const [showSql, setShowSql] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

    useEffect(() => {
        const loadSettings = async () => {
            const config = await DB.loadConfig('cloud_sync_config', { 
                url: DEFAULT_URL, 
                key: DEFAULT_KEY, 
                lastSync: null,
                autoSync: true 
            });
            setSupabaseUrl(config.url);
            setSupabaseKey(config.key);
            setLastSync(config.lastSync);
            setAutoSync(config.autoSync);
        };
        loadSettings();
    }, []);

    const saveSettings = async () => {
        await DB.saveConfig('cloud_sync_config', { 
            url: supabaseUrl, 
            key: supabaseKey, 
            lastSync,
            autoSync 
        });
        addToast('success', '配置已保存', '同步引擎参数已更新。');
        setConnectionStatus('idle');
    };

    const testConnection = async () => {
        if (!supabaseUrl || !supabaseKey) return;
        setConnectionStatus('testing');
        try {
            const supabase = createClient(supabaseUrl, supabaseKey);
            // 测试查询一个基础表，如果表不存在或 Key 错误会报错
            const { error } = await supabase.from('app_config').select('key').limit(1);
            if (error) {
                if (error.code === '42P01') throw new Error("云端数据库尚未初始化表（Relation does not exist）。请在 SQL Editor 执行下方脚本。");
                if (error.code === 'PGRST301') throw new Error("API Key 无效或权限不足。");
                throw error;
            }
            setConnectionStatus('success');
            addToast('success', '连接测试成功', '云端数据库响应正常。');
        } catch (e: any) {
            setConnectionStatus('error');
            addToast('error', '连接失败', e.message);
        }
    };

    const handleCloudPush = async () => {
        if (!supabaseUrl || !supabaseKey) {
            addToast('error', '同步失败', '请先配置 Supabase 参数。');
            return;
        }
        setIsProcessing(true);
        try {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const tablesToSync = [
                { local: 'fact_shangzhi', remote: 'fact_shangzhi', conflict: 'date,sku_code' },
                { local: 'fact_jingzhuntong', remote: 'fact_jingzhuntong', conflict: 'date,tracked_sku_id,account_nickname' },
                { local: 'fact_customer_service', remote: 'fact_customer_service', conflict: 'date,agent_account' }
            ];
            
            let totalPushed = 0;
            for (const table of tablesToSync) {
                const localData = await DB.getTableRows(table.local);
                if (localData.length === 0) continue;

                // 移除 ID 以便云端重新生成或按约束更新
                const cleanData = localData.map(({ id, ...rest }: any) => {
                    // 处理日期对象为字符串
                    if (rest.date instanceof Date) rest.date = rest.date.toISOString().split('T')[0];
                    return rest;
                });

                // 分批上传（每批 1000 条，防止 Payload 过大）
                const CHUNK_SIZE = 1000;
                for (let i = 0; i < cleanData.length; i += CHUNK_SIZE) {
                    const chunk = cleanData.slice(i, i + CHUNK_SIZE);
                    const { error } = await supabase
                        .from(table.remote)
                        .upsert(chunk, { onConflict: table.conflict });

                    if (error) {
                        console.error(`Table ${table.remote} error:`, error);
                        throw new Error(`[${table.remote}] 写入失败: ${error.message}`);
                    }
                }
                totalPushed += localData.length;
            }

            // 同步配置
            const configData = await DB.getAllConfigs();
            const configPayload = Object.entries(configData).map(([key, data]) => ({ key, data }));
            if (configPayload.length > 0) {
                const { error: confError } = await supabase.from('app_config').upsert(configPayload, { onConflict: 'key' });
                if (confError) throw new Error(`配置表同步失败: ${confError.message}`);
            }

            const now = new Date().toLocaleString();
            setLastSync(now);
            await DB.saveConfig('cloud_sync_config', { url: supabaseUrl, key: supabaseKey, lastSync: now, autoSync });
            addToast('success', '同步成功', `已向云端数据库持久化存储 ${totalPushed} 条记录。`);
        } catch (e: any) {
            console.error(e);
            addToast('error', '物理推送失败', e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCloudPull = async () => {
        setIsProcessing(true);
        try {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const tables = ['fact_shangzhi', 'fact_jingzhuntong', 'fact_customer_service'];
            for (const table of tables) {
                const { data, error } = await supabase.from(table).select('*');
                if (error) throw error;
                if (data && data.length > 0) await DB.bulkAdd(table, data);
            }

            const { data: configs, error: confError } = await supabase.from('app_config').select('*');
            if (confError) throw confError;
            if (configs) {
                for (const conf of configs) {
                    await DB.saveConfig(conf.key, conf.data);
                }
            }
            
            addToast('success', '拉取成功', '已根据云端镜像重建本地环境。');
            setTimeout(() => window.location.reload(), 1000);
        } catch (e: any) {
            addToast('error', '拉取失败', e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const sqlScript = `-- 1. 创建配置表
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  data JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. 创建商智表 (带唯一索引以支持 UPSERT)
CREATE TABLE IF NOT EXISTS fact_shangzhi (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  sku_code TEXT NOT NULL,
  shop_name TEXT,
  paid_amount NUMERIC,
  paid_items INTEGER,
  pv INTEGER,
  uv INTEGER,
  paid_users INTEGER,
  paid_customers INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, sku_code)
);

-- 3. 创建广告表
CREATE TABLE IF NOT EXISTS fact_jingzhuntong (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  account_nickname TEXT,
  tracked_sku_id TEXT NOT NULL,
  cost NUMERIC,
  clicks INTEGER,
  impressions INTEGER,
  total_order_amount NUMERIC,
  total_orders INTEGER,
  UNIQUE(date, tracked_sku_id, account_nickname)
);

-- 4. 创建客服表
CREATE TABLE IF NOT EXISTS fact_customer_service (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  agent_account TEXT NOT NULL,
  chats INTEGER,
  UNIQUE(date, agent_account)
);

-- 5. 重要：关闭 RLS 限制（由于是私有运营系统，关闭 RLS 是最快对接方式）
ALTER TABLE app_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE fact_shangzhi DISABLE ROW LEVEL SECURITY;
ALTER TABLE fact_jingzhuntong DISABLE ROW LEVEL SECURITY;
ALTER TABLE fact_customer_service DISABLE ROW LEVEL SECURITY;`;

    return (
        <div className="p-8 max-w-[1400px] mx-auto animate-fadeIn space-y-8 pb-20">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">物理云同步</h1>
                    <p className="text-slate-500 mt-2 font-bold text-xs tracking-widest uppercase italic">Infrastructure Connectivity & Persistence</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest ${
                        connectionStatus === 'success' ? 'bg-green-50 border-green-200 text-green-600' :
                        connectionStatus === 'error' ? 'bg-rose-50 border-rose-200 text-rose-600' :
                        'bg-slate-50 border-slate-200 text-slate-400'
                    }`}>
                        <Activity size={12} className={connectionStatus === 'testing' ? 'animate-pulse' : ''} />
                        云端状态: {
                            connectionStatus === 'testing' ? '测试中...' :
                            connectionStatus === 'success' ? '正常连接' :
                            connectionStatus === 'error' ? '连接异常' : '待测试'
                        }
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Configuration Sidebar */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <Settings2 size={20} className="text-[#70AD47]" />
                            同步参数配置
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Supabase API URL</label>
                                <input type="text" value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} placeholder="https://xxx.supabase.co" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-[#70AD47]" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Service Role / Anon Key</label>
                                <input type="password" value={supabaseKey} onChange={e => setSupabaseKey(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-[#70AD47]" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={saveSettings} className="flex-1 py-3 rounded-xl bg-slate-800 text-white font-black text-xs hover:bg-slate-700 transition-all">保存配置</button>
                                <button onClick={testConnection} className="px-6 py-3 rounded-xl border-2 border-slate-800 text-slate-800 font-black text-xs hover:bg-slate-50 transition-all">连通性测试</button>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 bg-[#0F172A] rounded-[32px] text-white">
                        <div className="flex items-center gap-2 mb-4 text-[#70AD47]">
                            <Terminal size={18} />
                            <h4 className="text-sm font-black uppercase">1. 初始化云端表 (必做)</h4>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed mb-6">
                            请在 Supabase 后台进入 <span className="text-white font-black">SQL Editor</span>，新建 Query 并粘贴执行以下脚本。脚本会自动禁用 RLS 权限检查。
                        </p>
                        <button 
                            onClick={() => setShowSql(!showSql)}
                            className="w-full py-3 bg-[#70AD47] rounded-xl text-[11px] font-black text-white hover:bg-[#5da035] transition-all shadow-lg shadow-[#70AD47]/20"
                        >
                            {showSql ? '隐藏初始化脚本' : '查看初始化 SQL 脚本'}
                        </button>
                        
                        {showSql && (
                            <div className="mt-4 bg-slate-800 rounded-2xl p-4 relative group">
                                <pre className="text-[9px] text-slate-300 font-mono overflow-x-auto max-h-[300px] leading-relaxed">
                                    {sqlScript}
                                </pre>
                                <button 
                                    onClick={() => { navigator.clipboard.writeText(sqlScript); addToast('success', '已复制', 'SQL脚本已存入剪贴板'); }}
                                    className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all"
                                >
                                    <Copy size={14} className="text-white"/>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Operations Main */}
                <div className="lg:col-span-8 space-y-8">
                    <div className="bg-white rounded-[40px] p-10 border border-slate-100 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center gap-10">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#70AD47]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                        
                        <div className="flex-1 relative z-10">
                            <div className="flex items-center gap-2 mb-6">
                                <span className="bg-[#70AD47] text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-[0.2em]">Data Warehouse Sync</span>
                            </div>
                            <h3 className="text-4xl font-black text-slate-900 mb-6">物理表持久化同步</h3>
                            <p className="text-slate-500 text-sm font-bold leading-relaxed mb-10 max-w-xl">
                                点击“执行推送”后，系统将遍历本地 IndexedDB 中的所有事实表记录，并实时写入云端 PostgreSQL。这允许您通过 PowerBI 或其他外部系统直接查询业务数据。
                            </p>
                            <div className="flex flex-wrap gap-4">
                                <button 
                                    onClick={handleCloudPush}
                                    disabled={isProcessing || connectionStatus === 'testing'}
                                    className="px-10 py-5 rounded-[20px] bg-[#70AD47] text-white font-black text-sm flex items-center gap-3 hover:bg-[#5da035] shadow-2xl shadow-[#70AD47]/30 active:scale-95 disabled:opacity-50 transition-all"
                                >
                                    {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <UploadCloud size={20} />}
                                    执行全量推送 (Push to Cloud)
                                </button>
                                <button 
                                    onClick={handleCloudPull}
                                    disabled={isProcessing || connectionStatus === 'testing'}
                                    className="px-10 py-5 rounded-[20px] bg-slate-50 text-slate-800 border border-slate-200 font-black text-sm flex items-center gap-3 hover:bg-slate-100 active:scale-95 disabled:opacity-50 transition-all"
                                >
                                    {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <Download size={20} />}
                                    从云端恢复 (Pull to Local)
                                </button>
                            </div>
                        </div>
                        <div className="hidden md:flex w-40 h-40 bg-slate-50 rounded-[48px] items-center justify-center rotate-12 border border-slate-100 shrink-0">
                            <Database size={64} className="text-[#70AD47] opacity-60" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100">
                             <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-[#70AD47] mb-6 shadow-sm">
                                <Activity size={24} />
                            </div>
                            <h4 className="text-lg font-black text-slate-800">最后同步统计</h4>
                            <div className="mt-4 space-y-2">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-400">同步时间:</span>
                                    <span className="text-slate-700">{lastSync || '从未同步'}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-400">同步模式:</span>
                                    <span className="text-[#70AD47]">增量更新 (Upsert)</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-blue-600 rounded-[32px] text-white shadow-xl shadow-blue-200">
                             <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white mb-6">
                                <CheckCircle2 size={24} />
                            </div>
                            <h4 className="text-lg font-black">如何验证成功?</h4>
                            <p className="mt-4 text-blue-100 text-[11px] font-bold leading-relaxed">
                                在 Supabase 左侧菜单点击 <span className="text-white underline">Table Editor</span>，找到 <span className="font-black">fact_shangzhi</span> 等表。如果推送成功，Rows 数量将大于 0，且每行数据包含 SKU 和对应的业务指标。
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
