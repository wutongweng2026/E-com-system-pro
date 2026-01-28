
/**
 * Cloud-Native Database Adapter
 * v5.3.4 Upgrade: Zero-Config Fallback Strategy
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 默认演示配置 (兜底策略)
// 当用户既没有设置环境变量，也没有手动配置时，使用此公开演示库
const DEFAULT_FALLBACK_URL = "https://stycaaqvjbjnactxcvyh.supabase.co";
const DEFAULT_FALLBACK_KEY = "sb_publishable_m4yyJRlDY107a3Nkx6Pybw_6Mdvxazn";

// 辅助：延迟函数
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 单例缓存
let supabaseInstance: SupabaseClient | null = null;

// 内存级配置缓存
let memoryCloudConfig: { url: string; key: string } | null = null;

// 获取客户端 (优先读取内存 -> 环境变量 -> 本地存储 -> 默认演示库)
const getClient = (): SupabaseClient | null => {
    // 1. 如果已有活跃实例，直接返回
    if (supabaseInstance) return supabaseInstance;

    // 2. 尝试获取配置
    let config = memoryCloudConfig;

    // 2.1 如果内存没有，检查环境变量 (Vercel Deployment)
    if (!config) {
        const envUrl = process.env.SUPABASE_URL;
        const envKey = process.env.SUPABASE_KEY;
        if (envUrl && envKey) {
            config = { url: envUrl.trim(), key: envKey.trim() };
            memoryCloudConfig = config; 
            console.log("[Yunzhou DB] Connected via Environment Variables.");
        }
    }

    // 2.2 如果环境变量也没有，尝试 localStorage (手动配置模式)
    if (!config) {
        try {
            const raw = localStorage.getItem('yunzhou_cloud_config');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.url && parsed.key) {
                    config = { url: parsed.url.trim(), key: parsed.key.trim() };
                    memoryCloudConfig = config;
                }
            }
        } catch (e) {
            console.error("[Yunzhou DB] LocalStorage Config Load Error:", e);
        }
    }

    // 2.3 【关键修复】如果还是没有配置，使用默认演示库
    if (!config) {
        console.warn("[Yunzhou DB] No custom config found. Using Fallback Demo Database.");
        config = { url: DEFAULT_FALLBACK_URL, key: DEFAULT_FALLBACK_KEY };
        memoryCloudConfig = config; // 存入内存，避免重复警告
    }

    // 3. 最终检查 (理论上不会触发，因为有 Default)
    if (!config || !config.url || !config.key) {
        return null;
    }

    try {
        supabaseInstance = createClient(config.url, config.key);
        return supabaseInstance;
    } catch (e: any) {
        console.error("[Yunzhou DB] Client Create Failed:", e);
        return null;
    }
};

export const DB = {
  // 强制重置连接
  resetClient() {
      supabaseInstance = null;
      memoryCloudConfig = null;
  },

  getDB(): Promise<any> { return Promise.resolve(true); },

  async getSupabase(): Promise<SupabaseClient | null> {
    return getClient();
  },

  async syncPull(): Promise<boolean> { return true; },

  async bulkAdd(tableName: string, rows: any[], onProgress?: (percent: number) => void): Promise<void> {
    const supabase = getClient();
    
    if (!supabase) {
        // 这一步理论上不可达，除非 Supabase SDK 初始化崩溃
        throw new Error(`云端连接初始化失败。请检查浏览器控制台日志。`);
    }

    let conflictKey = undefined;
    if (tableName === 'fact_shangzhi') conflictKey = 'date,sku_code';
    else if (tableName === 'fact_jingzhuntong') conflictKey = 'date,tracked_sku_id,account_nickname';
    else if (tableName === 'fact_customer_service') conflictKey = 'date,agent_account';
    else if (tableName === 'app_config') conflictKey = 'key';
    else if (tableName === 'dim_skus') conflictKey = 'id';

    const cleanData = rows.map(({ id, ...rest }: any) => {
        const clean = { ...rest };
        if (tableName.startsWith('fact_')) { delete clean.id; }
        if (clean.date instanceof Date) clean.date = clean.date.toISOString().split('T')[0];
        if (typeof clean.date === 'string' && clean.date.includes('T')) { clean.date = clean.date.split('T')[0]; }
        clean.updated_at = new Date().toISOString(); 
        Object.keys(clean).forEach(key => { if (clean[key] === undefined) clean[key] = null; });
        return clean;
    });

    const BATCH_SIZE = 1000;
    const total = cleanData.length;
    
    console.log(`[Cloud] 开始上传 ${tableName}, 共 ${total} 条...`);
    if (onProgress) onProgress(0);

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const chunk = cleanData.slice(i, i + BATCH_SIZE);
        let retries = 3;
        let success = false;
        
        while (retries > 0 && !success) {
            try {
                const { error } = await supabase.from(tableName).upsert(chunk, { onConflict: conflictKey, ignoreDuplicates: false });
                if (error) throw error;
                success = true;
            } catch (e: any) {
                console.error(`[Cloud] Upload Failed (Retry ${retries}):`, e.message);
                retries--;
                await sleep(1500); 
                if (retries === 0) throw new Error(`云端写入失败: ${e.message}`);
            }
        }

        if (onProgress) {
            const percent = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
            onProgress(percent);
        }
    }
  },

  async loadConfig<T>(key: string, defaultValue: T): Promise<T> {
    if (key === 'cloud_sync_config') {
        if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
            return { 
                url: process.env.SUPABASE_URL, 
                key: process.env.SUPABASE_KEY, 
                isEnv: true 
            } as unknown as T;
        }
        
        if (memoryCloudConfig) return memoryCloudConfig as unknown as T;
        try {
            const raw = localStorage.getItem('yunzhou_cloud_config');
            // 如果本地没存，返回默认演示配置，确保 UI 显示正常
            return raw ? JSON.parse(raw) : { url: DEFAULT_FALLBACK_URL, key: DEFAULT_FALLBACK_KEY };
        } catch { return defaultValue; }
    }

    const supabase = getClient();
    if (!supabase) return defaultValue;

    try {
        const { data, error } = await supabase.from('app_config').select('data').eq('key', key).single();
        if (error || !data) return defaultValue;
        return data.data as T;
    } catch (e) { return defaultValue; }
  },

  async saveConfig(key: string, data: any): Promise<void> {
    if (key === 'cloud_sync_config') {
        memoryCloudConfig = data; 
        localStorage.setItem('yunzhou_cloud_config', JSON.stringify(data));
        supabaseInstance = null;
        return;
    }

    const supabase = getClient();
    if (!supabase) return; 

    const payload = { key, data, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('app_config').upsert(payload, { onConflict: 'key' });
    if (error) console.error("Config Save Error:", error);
  },

  async getTableRows(tableName: string): Promise<any[]> {
    const supabase = getClient();
    if (!supabase) return [];
    let allRows: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
        const { data, error } = await supabase.from(tableName).select('*').range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) { hasMore = false; } 
        else if (data && data.length > 0) {
            allRows = allRows.concat(data);
            if (data.length < pageSize) hasMore = false;
            page++;
        } else { hasMore = false; }
    }
    return allRows;
  },

  async getRange(tableName: string, startDate: string, endDate: string): Promise<any[]> {
    const supabase = getClient();
    if (!supabase) return [];
    let allRows: any[] = [];
    let page = 0;
    const pageSize = 2000;
    let hasMore = true;
    while (hasMore) {
        const { data, error } = await supabase.from(tableName).select('*').gte('date', startDate).lte('date', endDate).range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) { hasMore = false; } 
        else if (data && data.length > 0) {
            allRows = allRows.concat(data);
            if (data.length < pageSize) hasMore = false;
            page++;
        } else { hasMore = false; }
    }
    return allRows;
  },

  async deleteRows(tableName: string, ids: any[]): Promise<void> {
    const supabase = getClient();
    if (!supabase) return;
    if (ids.length === 0) return;
    const { error } = await supabase.from(tableName).delete().in('id', ids);
    if (error) throw error;
  },

  async clearTable(tableName: string): Promise<void> {
    const supabase = getClient();
    if (!supabase) return;
    const { error } = await supabase.from(tableName).delete().gt('id', 0);
    if (error) throw error;
  },
  
  async getAllKeys(tableName: string): Promise<any[]> { return []; },
  async getBatch(tableName: string, keys: any[]): Promise<any[]> { return []; }
};
