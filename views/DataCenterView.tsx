
import React, { useState } from 'react';
import { Database, BarChart3, HardDrive, RotateCcw, UploadCloud, Download, Wrench, ChevronDown, Check, FileSpreadsheet, Headset, Archive, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { TableType, UploadHistory, Shop } from '../lib/types';
import { getTableName, detectTableType } from '../lib/helpers';
import { ConfirmModal } from '../components/ConfirmModal';
import { parseExcelFile } from '../lib/excel';

export const DataCenterView = ({ onUpload, onBatchUpdate, history, factTables, shops, schemas, addToast }: any) => {
  const [activeImportTab, setActiveImportTab] = useState<TableType>('shangzhi');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [defaultShopId, setDefaultShopId] = useState<string>('');
  
  // 批量修正功能状态
  const [isToolboxOpen, setIsToolboxOpen] = useState(false);
  const [batchSkuInput, setBatchSkuInput] = useState('');
  const [batchShopId, setBatchShopId] = useState('');
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    detectedType: TableType | null;
    selectedType: TableType | null;
    onConfirm: () => void;
  }>({ isOpen: false, detectedType: null, selectedType: null, onConfirm: () => {} });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (file) {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        setSelectedFile(file);
      } else {
        addToast('error', '格式不支持', '请选择 .XLS 或 .XLSX 格式的Excel文件。');
        setSelectedFile(null);
      }
    } else {
      setSelectedFile(null);
    }
  };
  
  const handleProcessClick = () => {
    if (!selectedFile) return;
    setIsProcessing(true);

    const performUpload = async (tableType: TableType) => {
        try {
            await onUpload(selectedFile, tableType, defaultShopId);
        } finally {
            setIsProcessing(false);
            setSelectedFile(null);
            setModalState({ isOpen: false, detectedType: null, selectedType: null, onConfirm: () => {} });
        }
    };

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = e.target?.result;
            const { headers } = parseExcelFile(data);

            if (headers.length === 0) {
                addToast('error', '文件分析失败', '无法在文件中找到有效的表头。');
                setIsProcessing(false);
                return;
            }

            const detectedType = detectTableType(headers, schemas);

            if (detectedType && detectedType !== activeImportTab) {
                setIsProcessing(false);
                setModalState({
                    isOpen: true,
                    detectedType: detectedType,
                    selectedType: activeImportTab,
                    onConfirm: () => {
                        setIsProcessing(true);
                        performUpload(detectedType);
                    }
                });
            } else {
                await performUpload(activeImportTab);
            }
        } catch (err: any) {
            console.error(err);
            addToast('error', '文件分析失败', err.message || '无法读取文件头信息，请检查文件格式。');
            setIsProcessing(false);
        }
    };
    reader.readAsBinaryString(selectedFile);
  };

  const handleModalCancel = () => {
    setModalState({ isOpen: false, detectedType: null, selectedType: null, onConfirm: () => {} });
    setSelectedFile(null);
  };

  const handleBatchFix = async () => {
      const parsedSkus = batchSkuInput.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      if (parsedSkus.length === 0 || !batchShopId) {
          addToast('error', '参数缺失', '请输入 SKU 列表并选择目标店铺。');
          return;
      }
      setIsBatchUpdating(true);
      try {
          await onBatchUpdate(parsedSkus, batchShopId);
          setBatchSkuInput('');
          setBatchShopId('');
      } finally {
          setIsBatchUpdating(false);
      }
  };

  const handleDownloadTemplate = (tableType: TableType, isOnlyTemplate: boolean = true) => {
    try {
        let currentSchema = schemas[tableType];
        const data = isOnlyTemplate ? [] : factTables[tableType];

        if (!currentSchema) {
            addToast('error', '操作失败', '未找到对应的表结构。');
            return;
        }

        if (tableType === 'customer_service') {
            const dateField = currentSchema.find((field: any) => field.key === 'date');
            if (dateField) {
                currentSchema = [dateField, ...currentSchema.filter((field: any) => field.key !== 'date')];
            }
        }
        
        const headers = currentSchema.map((field: any) => field.label);
        const dataRows = data.map((row: any) => 
            currentSchema.map((field: any) => row[field.key] ?? null)
        );

        const sheetData = [headers, ...dataRows];
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, getTableName(tableType));
        
        const fileName = isOnlyTemplate 
            ? `${getTableName(tableType)}_标准导入模板.xlsx`
            : `${getTableName(tableType)}_全量数据导出_${new Date().toISOString().split('T')[0]}.xlsx`;
            
        XLSX.writeFile(wb, fileName);
        addToast('success', '下载开始', `正在准备: ${fileName}`);
    } catch (e) {
        addToast('error', '操作失败', '导出流程异常。');
    }
  };

  const getLatestDate = (data: any[]) => {
    if (!data || data.length === 0) return 'N/A';
    try {
      const latest = data.reduce((maxDateStr, row) => {
        if (!row.date || typeof row.date !== 'string') return maxDateStr;
        return row.date > maxDateStr ? row.date : maxDateStr;
      }, '1970-01-01');
      return latest === '1970-01-01' ? 'N/A' : latest;
    } catch { return '日期无效'; }
  };

  const shangzhiCount = factTables.shangzhi?.length || 0;
  const jingzhuntongCount = factTables.jingzhuntong?.length || 0;
  const totalRows = shangzhiCount + jingzhuntongCount + (factTables.customer_service?.length || 0);
  const sizeMB = (totalRows * 200 / 1024 / 1024).toFixed(2);
  const shangzhiLatestDate = getLatestDate(factTables.shangzhi);
  const jingzhuntongLatestDate = getLatestDate(factTables.jingzhuntong);

  return (
    <>
      <ConfirmModal
        isOpen={modalState.isOpen}
        title="智能检测提示"
        onConfirm={modalState.onConfirm}
        onCancel={handleModalCancel}
        confirmText="确认同步"
      >
        {modalState.selectedType && modalState.detectedType && (
            <>
                <p>您当前选择的导入目标是 <strong className="font-black text-slate-800">[{getTableName(modalState.selectedType)}]</strong>，但系统检测到文件内容更匹配 <strong className="font-black text-slate-800">[{getTableName(modalState.detectedType)}]</strong>。</p>
                <p className="mt-2">是否要按 <strong className="font-black text-slate-800">[{getTableName(modalState.detectedType)}]</strong> 类型进行同步？</p>
            </>
        )}
      </ConfirmModal>
      <div className="p-8 md:p-10 w-full animate-fadeIn space-y-8">
        {/* Standardized Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                    <span className="text-[10px] font-black text-brand uppercase tracking-widest">物理层链路已挂载</span>
                </div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">数据中心控制台</h1>
                <p className="text-slate-500 font-medium text-xs mt-1 italic">Physical Data Governance Hub & ETL Pipeline</p>
            </div>
            <button 
                onClick={() => setIsToolboxOpen(!isToolboxOpen)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs transition-all shadow-sm ${isToolboxOpen ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                <Wrench size={14} /> 治理工具箱
            </button>
        </div>

        {isToolboxOpen && (
            <div className="bg-slate-800 rounded-[32px] p-8 border border-slate-700 shadow-2xl animate-fadeIn">
                 <div className="flex items-center gap-2 mb-6">
                    <Wrench size={20} className="text-[#70AD47]" />
                    <h3 className="font-black text-white text-lg">物理层字段批量修正</h3>
                 </div>
                 <p className="text-slate-400 text-xs mb-6 font-bold">此工具将遍历全量物理记录，将匹配 SKU 的“店铺名称”字段强制覆盖为目标店铺。适用于修正导入时未带店铺名称的历史数据。</p>
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <textarea 
                        placeholder="输入需要修正的 SKU 编码（每行一个或逗号分隔）..."
                        value={batchSkuInput}
                        onChange={e => setBatchSkuInput(e.target.value)}
                        className="lg:col-span-1 h-32 bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-[#70AD47] resize-none font-mono no-scrollbar"
                    />
                    <div className="flex flex-col gap-4">
                        <select 
                            value={batchShopId}
                            onChange={e => setBatchShopId(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-300 outline-none focus:border-[#70AD47] appearance-none"
                        >
                            <option value="">选择目标归属店铺...</option>
                            {shops.map((s:Shop) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <button 
                            onClick={handleBatchFix}
                            disabled={isBatchUpdating}
                            className="w-full py-4 rounded-xl bg-[#70AD47] text-white font-black text-sm hover:bg-[#5da035] shadow-lg shadow-[#70AD47]/20 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-widest">
                            {isBatchUpdating ? '正在重写数据库...' : '立即执行批量修正'}
                        </button>
                    </div>
                    <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-700/50">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase mb-3">操作须知</h4>
                        <ul className="text-[10px] text-slate-400 space-y-2 font-bold">
                            <li>• 该操作会覆盖所有匹配记录的物理字段。</li>
                            <li>• 不会修改资产管理中的配置。</li>
                            <li>• 重新同步对应日期的表格也会覆盖此项修正。</li>
                        </ul>
                    </div>
                 </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl p-8 flex flex-col justify-between border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">商智数据总行数</p>
              <Database size={24} className="text-slate-100 group-hover:text-brand transition-colors" />
            </div>
            <div>
              <p className="text-4xl font-black text-slate-900 tabular-nums">{shangzhiCount.toLocaleString()}</p>
              <p className="text-[10px] text-slate-400 mt-2 font-black uppercase">最新事实: {shangzhiLatestDate}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl p-8 flex flex-col justify-between border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">广告数据总行数</p>
              <BarChart3 size={24} className="text-slate-100 group-hover:text-brand transition-colors" />
            </div>
            <div>
              <p className="text-4xl font-black text-slate-900 tabular-nums">{jingzhuntongCount.toLocaleString()}</p>
              <p className="text-[10px] text-slate-400 mt-2 font-black uppercase">最新事实: {jingzhuntongLatestDate}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl p-8 flex flex-col justify-between border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">本地库物理占用</p>
                <HardDrive size={24} className="text-slate-100 group-hover:text-brand transition-colors" />
            </div>
            <div>
              <p className="text-4xl font-black text-slate-900 tabular-nums">{sizeMB} MB</p>
              <p className="text-[10px] text-slate-400 mt-2 font-black uppercase invisible">Placeholder</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[40px] p-10 border border-slate-100 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 relative z-10">
              {/* Part 1: Template Download */}
              <div className="lg:col-span-1 space-y-6">
                  <h3 className="flex items-center gap-2 font-black text-slate-800 text-lg tracking-tight">
                      <div className="w-1.5 h-6 bg-[#70AD47] rounded-full"></div>
                      1. 维度模版
                  </h3>
                  <p className="text-xs text-slate-400 font-bold leading-relaxed">同步数据前，请确保您的表格列头与下载的模版字段逻辑对齐。</p>
                  <div className="space-y-2">
                      <button onClick={() => handleDownloadTemplate('shangzhi', true)} className="w-full group flex items-center gap-3 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-[#70AD47] hover:shadow-md transition-all">
                          <FileSpreadsheet size={18} className="text-slate-300 group-hover:text-brand transition-colors" />
                          <span className="font-black text-slate-700 text-xs">商智模版</span>
                      </button>
                      <button onClick={() => handleDownloadTemplate('jingzhuntong', true)} className="w-full group flex items-center gap-3 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-brand hover:shadow-md transition-all">
                          <BarChart3 size={18} className="text-slate-300 group-hover:text-brand transition-colors" />
                          <span className="font-black text-slate-700 text-xs">广告模版</span>
                      </button>
                      <button onClick={() => handleDownloadTemplate('customer_service', true)} className="w-full group flex items-center gap-3 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-brand hover:shadow-md transition-all">
                          <Headset size={18} className="text-slate-300 group-hover:text-brand transition-colors" />
                          <span className="font-black text-slate-700 text-xs">客服模版</span>
                      </button>
                  </div>
              </div>

              {/* Part 2: Upload/Sync Engine */}
              <div className="lg:col-span-2 space-y-6 border-x border-slate-50 px-0 lg:px-10">
                  <h3 className="flex items-center gap-2 font-black text-slate-800 text-lg tracking-tight">
                      <div className="w-1.5 h-6 bg-brand rounded-full"></div>
                      2. 执行物理同步
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative">
                          <select 
                            value={activeImportTab} 
                            onChange={e => setActiveImportTab(e.target.value as TableType)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black text-slate-700 outline-none focus:border-[#70AD47] appearance-none shadow-sm"
                          >
                            <option value="shangzhi">导入: 商智明细 (fact_shangzhi)</option>
                            <option value="jingzhuntong">导入: 广告明细 (fact_jingzhuntong)</option>
                            <option value="customer_service">导入: 客服统计 (fact_customer_service)</option>
                          </select>
                          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                      <div className="relative">
                        <select 
                            value={defaultShopId} 
                            onChange={e => setDefaultShopId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black text-slate-700 outline-none focus:border-[#70AD47] appearance-none shadow-sm"
                         >
                            <option value="">-- 若表内缺失则自动匹配资产 --</option>
                            {shops.map((s:Shop) => <option key={s.id} value={s.id}>{s.name}</option>)}
                         </select>
                         <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                  </div>
                  
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 hover:border-[#70AD47] transition-all rounded-[32px] p-10 flex flex-col items-center justify-center relative group">
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-md text-[#70AD47] mb-4 group-hover:scale-110 transition-transform">
                            <UploadCloud size={28} />
                        </div>
                        <div className="text-center mb-8">
                            <h4 className="font-black text-slate-900 text-sm">{selectedFile ? selectedFile.name : '点击或拖拽上传数据表'}</h4>
                            <p className="text-[10px] text-slate-400 font-black mt-2 tracking-[0.2em] uppercase italic opacity-60">Upsert Engine: Enabled</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                  <input 
                                      type="file" 
                                      onChange={handleFileSelect} 
                                      accept=".xlsx, .xls" 
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                  />
                                  <button className="bg-white border-2 border-slate-100 text-slate-600 font-black text-[10px] px-8 py-3 rounded-xl hover:border-brand transition-all shadow-sm uppercase tracking-widest">
                                      {selectedFile ? '更换文件' : '浏览文件'}
                                  </button>
                            </div>
                            <button 
                                  onClick={handleProcessClick}
                                  disabled={!selectedFile || isProcessing}
                                  className="bg-brand text-white font-black text-[10px] px-10 py-3 rounded-xl shadow-xl shadow-brand/20 transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed active:scale-95 uppercase tracking-widest">
                                  {isProcessing ? '正在同步...' : '执行同步'}
                            </button>
                        </div>
                  </div>
              </div>

              {/* Part 3: Physical Data Archive (Full Export) */}
              <div className="lg:col-span-1 space-y-6">
                  <h3 className="flex items-center gap-2 font-black text-slate-800 text-lg tracking-tight">
                      <div className="w-1.5 h-6 bg-slate-800 rounded-full"></div>
                      3. 物理归档
                  </h3>
                  <p className="text-xs text-slate-400 font-bold leading-relaxed">导出物理库中的原始记录备份，用于离线存储或异地迁移。</p>
                  <div className="space-y-2">
                      <button onClick={() => handleDownloadTemplate('shangzhi', false)} className="w-full group flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-800 hover:shadow-md transition-all">
                          <div className="flex items-center gap-3">
                              <Archive size={18} className="text-slate-300 group-hover:text-slate-800 transition-colors" />
                              <span className="font-black text-slate-700 text-xs">导出全量商智</span>
                          </div>
                          <Download size={14} className="text-slate-300" />
                      </button>
                      <button onClick={() => handleDownloadTemplate('jingzhuntong', false)} className="w-full group flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-800 hover:shadow-md transition-all">
                          <div className="flex items-center gap-3">
                              <Archive size={18} className="text-slate-300 group-hover:text-slate-800 transition-colors" />
                              <span className="font-black text-slate-700 text-xs">导出全量广告</span>
                          </div>
                          <Download size={14} className="text-slate-300" />
                      </button>
                      <button onClick={() => handleDownloadTemplate('customer_service', false)} className="w-full group flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-800 hover:shadow-md transition-all">
                          <div className="flex items-center gap-3">
                              <Archive size={18} className="text-slate-300 group-hover:text-slate-800 transition-colors" />
                              <span className="font-black text-slate-700 text-xs">导出全量客服</span>
                          </div>
                          <Download size={14} className="text-slate-300" />
                      </button>
                  </div>
              </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm min-h-[300px]">
            <h3 className="flex items-center gap-2 font-black text-slate-800 mb-8 tracking-tight">
                <RotateCcw size={18} className="text-[#70AD47]" />
                物理层同步历史
            </h3>
            
            <div className="w-full overflow-x-auto no-scrollbar">
                <div className="grid grid-cols-6 gap-4 pb-4 border-b border-slate-100 text-[10px] font-black text-slate-400 text-center uppercase tracking-[0.15em] min-w-[800px]">
                    <div className="text-left pl-4">文件名 / 源文件</div>
                    <div>存储规格</div>
                    <div>有效行数</div>
                    <div>目标物理表</div>
                    <div>同步时间</div>
                    <div>引擎状态</div>
                </div>
                
                {history.length === 0 ? (
                    <div className="py-20 text-center">
                        <p className="text-slate-300 font-black text-sm uppercase tracking-widest italic">Awaiting First Sync Job...</p>
                    </div>
                ) : (
                    history.map((h: UploadHistory) => (
                        <div key={h.id} className="grid grid-cols-6 gap-4 py-5 border-b border-slate-50 text-xs text-slate-600 items-center text-center hover:bg-slate-50/50 transition-colors min-w-[800px]">
                              <div className="text-left pl-4 font-black text-slate-800 truncate">{h.fileName}</div>
                              <div className="font-mono text-[11px] text-slate-400">{h.fileSize}</div>
                              <div className="font-black text-slate-700">{h.rowCount.toLocaleString()}</div>
                              <div>
                                  <span className="uppercase font-black text-brand text-[10px] bg-brand/5 px-2 py-0.5 rounded-md">{getTableName(h.targetTable)}</span>
                              </div>
                              <div className="font-bold text-slate-400">{h.uploadTime.split(' ')[0]}</div>
                              <div>
                                  <span className={`flex items-center justify-center gap-1.5 font-black uppercase text-[10px] ${h.status === '成功' ? 'text-green-600' : 'text-rose-500'}`}>
                                      {h.status === '成功' ? <Check size={12} strokeWidth={4} /> : <X size={12} strokeWidth={4} />} {h.status}
                                  </span>
                              </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>
    </>
  );
};
