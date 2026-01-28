
/**
 * Advanced IndexedDB Wrapper with Real-time Cloud Sync (Hybrid Architecture)
 * v5.2.0 Upgrade: Incremental Sync & Deduplication Logic
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DB_NAME = 'ShujianDB';
const DB_VERSION = 3;

// 缓存 Supabase 客户端实例
let supabaseInstance: SupabaseClient | null = null;

export const DB = {
  getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        const factTables = ['fact_shangzhi', 'fact_jingzhuntong', 'fact_customer_service'];
        factTables.forEach(tableName => {
          if (!db.objectStoreNames.contains(tableName)) {
            const store = db.createObjectStore(tableName, { keyPath: 'id', autoIncrement: true });
            store.createIndex('date', 'date', { unique: false });
            // 复合索引用于业务主键去重
            if (tableName === 'fact_shangzhi') store.createIndex('sku_date', ['sku_code', 'date'], { unique: false });
            if (tableName === 'fact_jingzhuntong') store.createIndex('jzt_key', ['tracked_sku_id', 'date', 'account_nickname'], { unique: false });
            if (tableName === 'fact_customer_service') store.createIndex('cs_key', ['agent_account', 'date'], { unique: false });
          }
        });
        if (!db.objectStoreNames.contains('app_config')) {
          db.createObjectStore('app_config');
        }
      };
    });
  },

  // 获取云端客户端（带缓存）
  async getSupabase(): Promise<SupabaseClient | null> {
    if (supabaseInstance) return supabaseInstance;
    try {
        const config = await this.loadConfig('cloud_sync_config', null);
        if (config && config.url && config.key) {
          supabaseInstance = createClient(config.url, config.key);
          return supabaseInstance;
        }
    } catch(e) { return null; }
    return null;
  },

  // 核心：智能增量拉取 (Smart Incremental Pull)
  async syncPull(): Promise<boolean> {
    const supabase = await this.getSupabase();
    if (!supabase) return false;

    const syncConfig = await this.loadConfig('cloud_sync_config', { lastSync: '1970-01-01T00:00:00.000Z' });
    const lastSync = syncConfig.lastSync || '1970-01-01T00:00:00.000Z';
    // 记录本次同步开始时间，稍微前移一点以防边界遗漏
    const newSyncTime = new Date().toISOString(); 

    console.log(`☁️ [Cloud] 启动增量热同步，起点: ${lastSync}`);

    try {
      // 1. 同步配置项 (Metadata)
      const { data: configs } = await supabase.from('app_config').select('*').gt('updated_at', lastSync);
      if (configs && configs.length > 0) {
        console.log(`[Sync] 更新配置: ${configs.length} 条`);
        for (const item of configs) {
          if (item.key !== 'cloud_sync_config') {
             await this.saveConfig(item.key, item.data, false); 
          }
        }
      }

      // 2. 同步事实表 (Fact Tables)
      const tables = [
          { name: 'fact_shangzhi', indexName: 'sku_date', keyMapper: (r:any) => [r.sku_code, r.date] },
          { name: 'fact_jingzhuntong', indexName: 'jzt_key', keyMapper: (r:any) => [r.tracked_sku_id, r.date, r.account_nickname] },
          { name: 'fact_customer_service', indexName: 'cs_key', keyMapper: (r:any) => [r.agent_account, r.date] }
      ];
      
      const db = await this.getDB();

      for (const t of tables) {
          let hasMore = true;
          let page = 0;
          const pageSize = 1000;
          let totalPulled = 0;

          while (hasMore) {
              // 使用 updated_at 获取变更数据
              const { data, error } = await supabase
                  .from(t.name)
                  .select('*')
                  .gt('updated_at', lastSync)
                  .range(page * pageSize, (page + 1) * pageSize - 1)
                  .order('updated_at', { ascending: true });

              if (error) {
                  // 容错：如果表结构没 updated_at，可能需要全量或忽略
                  if (error.code === '42703') { console.warn(`[Sync] 表 ${t.name} 缺少 updated_at 字段，跳过增量检查。`); }
                  else { console.error(`[Sync Error] ${t.name}:`, error.message); }
                  hasMore = false;
              } else if (data && data.length > 0) {
                  // 开启事务进行“本地去重 + 写入”
                  const tx = db.transaction([t.name], 'readwrite');
                  const store = tx.objectStore(t.name);
                  const index = store.index(t.indexName);

                  for (const cloudRow of data) {
                      // A. 尝试通过业务主键查找本地旧数据
                      // 注意：Index Key 必须严格匹配 keyMapper 的返回结构
                      const bizKey = t.keyMapper(cloudRow);
                      // IndexedDB getRequest 是异步的，不能在 forEach 中简单 await，需用 Promise 包装或游标
                      // 这里简化逻辑：我们假设 Cloud ID 是权威的。
                      // 如果我们能直接找到 Cloud ID 对应的本地 ID 当然好，但本地可能是自增 ID。
                      
                      // 高级策略：先尝试按业务主键删除本地旧数据，再插入 Cloud 数据
                      // 这确保了本地只会有一条（Cloud 那条），且 ID 会被替换为 Cloud ID (如果是整数)
                      // 注意：Supabase ID 通常是 BigInt，IndexedDB 支持。
                      
                      // 由于异步问题，我们在 transaction 中必须小心。
                      // 简单策略：直接 put。但这样会由 IndexedDB 生成新 ID (如果 row.id 不存在或不同)。
                      // 如果 Cloud Row 有 ID，store.put(row) 会尝试使用该 ID。
                      // 如果本地已有 ID=1 (date=A)，Cloud 传来 ID=100 (date=A)。
                      // 直接 put(ID=100) -> 结果：ID=1 和 ID=100 共存。重复！
                      
                      // 必须先删除冲突的业务数据。
                      // 我们使用一个 Promise 包装单个记录的处理
                      await new Promise<void>((resolveRow) => {
                          const getReq = index.get(bizKey);
                          getReq.onsuccess = () => {
                              const localRecord = getReq.result;
                              if (localRecord && localRecord.id !== cloudRow.id) {
                                  // 发现业务冲突（本地有旧数据，且ID不同），删掉旧的
                                  store.delete(localRecord.id); 
                              }
                              // 写入 Cloud 数据 (带 Cloud ID)
                              store.put(cloudRow);
                              resolveRow();
                          };
                          getReq.onerror = () => {
                              // 索引查询失败，直接写入尝试
                              store.put(cloudRow);
                              resolveRow();
                          }
                      });
                  }

                  await new Promise<void>((resolveTx, rejectTx) => {
                      tx.oncomplete = () => resolveTx();
                      tx.onerror = () => rejectTx(tx.error);
                  });

                  totalPulled += data.length;
                  if (data.length < pageSize) hasMore = false; else page++;
              } else {
                  hasMore = false;
              }
          }
          if (totalPulled > 0) console.log(`[Sync] ${t.name}: 同步更新了 ${totalPulled} 条记录`);
      }

      // 3. 更新时间戳
      await this.saveConfig('cloud_sync_config', { ...syncConfig, lastSync: newSyncTime }, false);
      return true;
    } catch (e) {
      console.error("云端同步异常:", e);
      return false;
    }
  },

  // 核心：写入时自动推送到云端 (Write-Through)
  async pushToCloud(tableName: string, data: any | any[], conflictKey?: string) {
    const supabase = await this.getSupabase();
    if (!supabase) return;

    // 异步执行，不阻塞 UI
    setTimeout(async () => {
      try {
        const payload = Array.isArray(data) ? data : [data];
        // 清理: 移除本地临时 ID (如果它是自增的且我们不想干扰云端 ID 生成，
        // 但为了双向同步 ID 一致性，最好的策略是：
        // 1. 如果数据来自云端(有ID)，保留ID。
        // 2. 如果是新数据(无ID或本地ID)，上传。
        // 这里为了简化：我们假设云端由 upsert 管理，我们上传所有字段。
        // 为防止本地 ID (如 1, 2) 覆盖云端 ID，通常建议前端生成 UUID 或不传 ID 让后端生成。
        // 本系统简化处理：上传除 id 外的数据进行匹配，或者上传全部。
        // 考虑到 conflictKey 的存在，我们上传 payload。
        
        const cleanPayload = payload.map(({ ...rest }: any) => {
            const clean = { ...rest };
            // 如果本地ID是数字且很小，可能是本地生成的，不传给云端以免冲突? 
            // 实际上，upsert 需要指定 onConflict。
            // 如果我们不传 ID，Supabase 会生成新 ID。
            // 这会导致下次拉取时，本地又多一条新 ID 的数据。
            // 最佳实践：前端生成 UUID 作为 ID。但现有架构是自增。
            // 妥协方案：上传时不带 ID，靠业务主键 upsert。
            // 下次 syncPull 会把云端生成的 ID 拉回来，本地 dedupe 逻辑会把本地无 ID (或旧 ID) 的记录替换掉。
            delete clean.id; 
            if (clean.date instanceof Date) clean.date = clean.date.toISOString().split('T')[0];
            // 确保更新时间刷新
            clean.updated_at = new Date().toISOString(); 
            return clean;
        });

        const { error } = await supabase.from(tableName).upsert(cleanPayload, { 
            onConflict: conflictKey || undefined
        });
        
        if (error) console.error(`[Cloud Push] ${tableName} 失败:`, error.message);
      } catch (e) {
        console.error(`[Cloud Push] Error:`, e);
      }
    }, 500); // 延迟一点，让 UI 先响应
  },

  // 删除行
  async deleteRows(tableName: string, ids: any[]): Promise<void> {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      ids.forEach(id => store.delete(id));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    // Cloud Delete: 暂不自动同步删除，防止误操作
  },

  // 批量添加：支持 syncToCloud 开关
  async bulkAdd(tableName: string, rows: any[], syncToCloud: boolean = true): Promise<void> {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      rows.forEach(row => store.put(row)); 
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    if (syncToCloud) {
        let conflictKey = undefined;
        if (tableName === 'fact_shangzhi') conflictKey = 'date,sku_code';
        else if (tableName === 'fact_jingzhuntong') conflictKey = 'date,tracked_sku_id,account_nickname';
        else if (tableName === 'fact_customer_service') conflictKey = 'date,agent_account';

        const BATCH_SIZE = 200;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            this.pushToCloud(tableName, rows.slice(i, i + BATCH_SIZE), conflictKey);
        }
    }
  },

  // 保存配置：支持 syncToCloud 开关
  async saveConfig(key: string, data: any, syncToCloud: boolean = true): Promise<void> {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['app_config'], 'readwrite');
      const store = transaction.objectStore('app_config');
      store.put(data, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    if (syncToCloud && key !== 'cloud_sync_config') {
        this.pushToCloud('app_config', { key, data }, 'key');
    }
  },

  // ... (其他 getter 方法保持不变)
  async getTableRows(tableName: string): Promise<any[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getRange(tableName: string, startDate: string, endDate: string): Promise<any[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);
      const index = store.index('date');
      const range = IDBKeyRange.bound(startDate, endDate);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async loadConfig<T>(key: string, defaultValue: T): Promise<T> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(['app_config'], 'readonly');
      const store = transaction.objectStore('app_config');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result !== undefined ? request.result : defaultValue);
      request.onerror = () => resolve(defaultValue);
    });
  },

  async getAllConfigs(): Promise<Record<string, any>> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(['app_config'], 'readonly');
      const store = transaction.objectStore('app_config');
      const items: any = {};
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor) {
              items[cursor.key] = cursor.value;
              cursor.continue();
          } else {
              resolve(items);
          }
      };
    });
  },

  async clearTable(tableName: string): Promise<void> {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async exportFullDatabase(): Promise<string> {
    const db = await this.getDB();
    const exportData: any = { version: DB_VERSION, timestamp: new Date().toISOString(), tables: {} };
    const tableNames = ['fact_shangzhi', 'fact_jingzhuntong', 'fact_customer_service', 'app_config'];
    for (const tableName of tableNames) {
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);
      if (tableName === 'app_config') {
          exportData.tables[tableName] = await new Promise((resolve) => {
              const items: any = {};
              const cursorReq = store.openCursor();
              cursorReq.onsuccess = (e: any) => {
                  const cursor = e.target.result;
                  if (cursor) { items[cursor.key] = cursor.value; cursor.continue(); } else { resolve(items); }
              };
          });
      } else {
          exportData.tables[tableName] = await new Promise((resolve) => {
              const request = store.getAll();
              request.onsuccess = () => resolve(request.result);
          });
      }
    }
    return JSON.stringify(exportData);
  },

  async importFullDatabase(jsonString: string): Promise<void> {
    const data = JSON.parse(jsonString);
    const db = await this.getDB();
    const tableNames = Object.keys(data.tables);
    for (const tableName of tableNames) {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      store.clear();
      if (tableName === 'app_config') {
          const configItems = data.tables[tableName];
          for (const key in configItems) { store.put(configItems[key], key); }
      } else {
          const rows = data.tables[tableName];
          rows.forEach((row: any) => store.put(row));
      }
    }
  }
};
