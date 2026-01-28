
/**
 * Cloud-Native Database Adapter
 * v5.3.2 Upgrade: Robust Memory Caching for Environment Compatibility
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 辅助：延迟函数
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 单例缓存
let supabaseInstance: SupabaseClient | null = null;

// 内存级配置缓存 (解决部分环境下 localStorage 读取延迟或失效的问题)
let memoryCloudConfig: { url: string; key: string } | null = null;

// 获取客户端 (优先读取内存，其次 localStorage)
const getClient = (): SupabaseClient | null => {
    // 1. 如果已有活跃实例，直接返回
    if (supabaseInstance) return supabaseInstance;

    // 2. 尝试获取配置 (内存 -> 本地存储)
    let config = memoryCloudConfig;

    if (!config) {
        try {
            const raw = localStorage.getItem('yunzhou_cloud_config');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.url && parsed.key) {
                    // 修正：去除可能存在的空格
                    config = { url: parsed.url.trim(), key: parsed.key.trim() };
                    // 回写到内存缓存，供后续调用
                    memoryCloudConfig = config;
                }
            }
        } catch (e) {
            console.error("[Yunzhou DB] Config Load Error:", e);
        }
    }

    if (!config || !config.url || !config.key) {
        console.warn("[Yunzhou DB] No valid cloud config found in Memory or LocalStorage.");
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
      memoryCloudConfig = null; // 清除内存缓存，强制重新读取
  },

  getDB(): Promise<any> { return Promise.resolve(true); },

  async getSupabase(): Promise<SupabaseClient | null> {
    return getClient();
  },

  async syncPull(): Promise<boolean> { return true; },

  async bulkAdd(tableName: string, rows: any[], onProgress?: (percent: number) => void): Promise<void> {
    const supabase = getClient();
    
    // 强化错误提示：区分是完全没配置，还是配置了但无效
    if (!supabase) {
        const hasLocal = !!localStorage.getItem('yunzhou_cloud_config');
        const hasMemory = !!memoryCloudConfig;
        const debugInfo = `Mem:${hasMemory}, Loc:${hasLocal}`;
        throw new Error(`无法建立云端连接 (${debugInfo})。这通常是因为配置未保存或网络受限。请尝试刷新页面或重新保存[云端同步]配置。`);
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
                if (retries === 0) throw new Error(`云端写入失败 (网络或权限): ${e.message}`);
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
        // 优先返回内存中的配置，确保一致性
        if (memoryCloudConfig) return memoryCloudConfig as unknown as T;
        try {
            const raw = localStorage.getItem('yunzhou_cloud_config');
            return raw ? JSON.parse(raw) : defaultValue;
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
        // 同时写入内存和本地存储
        memoryCloudConfig = data; 
        localStorage.setItem('yunzhou_cloud_config', JSON.stringify(data));
        
        // 重置客户端实例，强制下次请求使用新配置
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
