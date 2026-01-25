
import React, { useState } from 'react';
import { Database, BarChart3, HardDrive, RotateCcw, UploadCloud, Download, Wrench, ChevronDown, Check } from 'lucide-react';
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

  const handleDownloadTemplate = (tableType: TableType) => {
    try {
        let currentSchema = schemas[tableType];
        const data = factTables[tableType];

        if (!currentSchema) {
            addToast('error', '下载失败', '未找到对应的表结构。');
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
        
        const today = new Date();
        const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const fileName = `${getTableName(tableType)}_export_${formattedDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
        addToast('success', '导出成功', `已开始下载 ${getTableName(tableType)} 表数据。`);
    } catch (e) {
        addToast('error', '下载失败', '无法生成Excel文件。');
        console.error(e);
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
    } catch { return 'Invalid Date'; }
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
      <div className="p-8 max-w-[1600px] mx-auto animate-fadeIn space-y-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">数据中心控制台</h1>
            <p className="text-slate-500 mt-2 font-bold text-xs tracking-widest uppercase">PHYSICAL DATA GOVERNANCE</p>
          </div>
          <button 
            onClick={() => setIsToolboxOpen(!isToolboxOpen)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs uppercase transition-all shadow-sm ${isToolboxOpen ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <Wrench size={14} /> 治理工具箱
          </button>
        </div>

        {isToolboxOpen && (
            <div className="bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-2xl animate-fadeIn">
                 <div className="flex items-center gap-2 mb-6">
                    <Wrench size={20} className="text-[#70AD47]" />
                    <h3 className="font-black text-white text-lg">物理层字段批量修正</h3>
                    <span className="text-[10px] bg-[#70AD47] text-white px-2 py-0.5 rounded ml-2">POWER TOOL</span>
                 </div>
                 <p className="text-slate-400 text-xs mb-6 font-bold">此工具将遍历全量物理记录，将匹配 SKU 的“店铺名称”字段强制覆盖为目标店铺。适用于修正导入时未带店铺名称的历史数据。</p>
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <textarea 
                        placeholder="输入需要修正的 SKU 编码（每行一个或逗号分隔）..."
                        value={batchSkuInput}
                        onChange={e => setBatchSkuInput(e.target.value)}
                        className="lg:col-span-1 h-32 bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-[#70AD47] resize-none font-mono"
                    />
                    <div className="flex flex-col gap-4">
                        <select 
                            value={batchShopId}
                            onChange={e => setBatchShopId(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-300 outline-none focus:border-[#70AD47] appearance-none"
                        >
                            <option value="">选择目标归属店铺...</option>
                            {shops.map((s:Shop) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <button 
                            onClick={handleBatchFix}
                            disabled={isBatchUpdating}
                            className="w-full py-4 rounded-xl bg-[#70AD47] text-white font-black text-sm hover:bg-[#5da035] shadow-lg transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
                            {isBatchUpdating ? '正在重写数据库...' : '立即执行批量修正'}
                        </button>
                    </div>
                    <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-700/50">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase mb-3">操作须知</h4>
                        <ul className="text-[10px] text-slate-400 space-y-2 font-bold">
                            <li>• 该操作会覆盖所有匹配记录的物理字段。</li>
                            <li>• 不会修改资产管理(dim_skus)中的配置。</li>
                            <li>• 处理百万级数据可能需要几秒钟。</li>
                        </ul>
                    </div>
                 </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-6 flex flex-col justify-between border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <p className="text-xs font-bold text-slate-400 mb-2">商智数据总行数</p>
              <Database size={24} className="text-slate-200" />
            </div>
            <div>
              <p className="text-4xl font-black text-slate-800">{shangzhiCount.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1 font-medium">最新数据: {shangzhiLatestDate}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 flex flex-col justify-between border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <p className="text-xs font-bold text-slate-400 mb-2">广告数据总行数</p>
              <BarChart3 size={24} className="text-[#70AD47]" />
            </div>
            <div>
              <p className="text-4xl font-black text-slate-800">{jingzhuntongCount.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1 font-medium">最新数据: {jingzhuntongLatestDate}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 flex flex-col justify-between border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <p className="text-xs font-bold text-slate-400 mb-2">物理层占用</p>
                <HardDrive size={24} className="text-blue-500" />
            </div>
            <div>
              <p className="text-4xl font-black text-slate-800">{sizeMB} MB</p>
              <p className="text-xs text-slate-400 mt-1 font-medium invisible">Placeholder</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="space-y-6">
                  <h3 className="flex items-center gap-2 font-black text-slate-800 text-lg">
                      <div className="w-1.5 h-6 bg-[#70AD47] rounded-full"></div>
                      智能校验 & 自动分拣
                  </h3>
                  <ul className="space-y-4">
                      {[
                          { title: 'UPSERT 更新', desc: '同日期同 SKU 再次导入将自动覆盖，而非重复。' },
                          { title: '归属补全', desc: '可预选默认店铺，补齐表格中缺失的店铺名。' },
                          { title: '物理去重', desc: '根据 Date + SKU 唯一标识确保数据洁净。' },
                      ].map((item, i) => (
                          <li key={i} className="flex gap-3">
                              <div className="mt-1.5 w-2 h-2 rounded-full bg-[#70AD47] shrink-0"></div>
                              <div>
                                  <span className="font-bold text-slate-700 text-sm">{item.title}：</span>
                                  <span className="text-slate-500 text-sm">{item.desc}</span>
                              </div>
                          </li>
                      ))}
                  </ul>
                  <div className="pt-4 border-t border-slate-100">
                      <h4 className="font-bold text-slate-700 text-sm mb-3">导出数据表格</h4>
                      <div className="flex flex-wrap gap-2">
                          <button onClick={() => handleDownloadTemplate('shangzhi')} className="flex-1 min-w-[120px] text-center flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"><Download size={14}/> 导出商智</button>
                          <button onClick={() => handleDownloadTemplate('jingzhuntong')} className="flex-1 min-w-[120px] text-center flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"><Download size={14}/> 导出广告</button>
                      </div>
                  </div>
              </div>

              <div className="lg:col-span-2 space-y-6">
                  <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1">
                          <h3 className="font-bold text-slate-800 mb-4 text-xs uppercase tracking-wider">1. 选择物理目标表</h3>
                          <div className="flex gap-4">
                              {['shangzhi', 'jingzhuntong', 'customer_service'].map(tab => (
                                  <button
                                      key={tab}
                                      onClick={() => setActiveImportTab(tab as TableType)}
                                      className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${
                                          activeImportTab === tab 
                                          ? 'bg-[#70AD47] text-white shadow-lg shadow-[#70AD47]/20' 
                                          : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-100'
                                      }`}
                                  >
                                      {tab === 'shangzhi' ? '商智明细' : tab === 'jingzhuntong' ? '广告明细' : '客服统计'}
                                  </button>
                              ))}
                          </div>
                      </div>
                      <div className="w-full md:w-64">
                         <h3 className="font-bold text-slate-800 mb-4 text-xs uppercase tracking-wider">2. 指定默认店铺 (可选)</h3>
                         <select 
                            value={defaultShopId} 
                            onChange={e => setDefaultShopId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-[#70AD47]"
                         >
                            <option value="">-- 若表格缺失则匹配资产 --</option>
                            {shops.map((s:Shop) => <option key={s.id} value={s.id}>{s.name}</option>)}
                         </select>
                      </div>
                  </div>
                  
                  <div className="bg-slate-50 border border-dashed border-slate-200 hover:border-[#70AD47] transition-colors rounded-2xl p-6 flex items-center justify-between relative group">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-[#70AD47]">
                                <UploadCloud size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800">{selectedFile ? 'Excel 文件就绪' : '上传待同步表格'}</h4>
                                <p className="text-xs text-slate-400 italic mt-0.5">{selectedFile ? selectedFile.name : '支持覆盖更新模式'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                  <input 
                                      type="file" 
                                      onChange={handleFileSelect} 
                                      accept=".xlsx, .xls" 
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                  />
                                  <button className="bg-white border border-slate-200 text-slate-700 font-bold text-sm px-6 py-2.5 rounded-lg hover:bg-white group-hover:border-[#70AD47] transition-colors shadow-sm">
                                      {selectedFile ? '更换文件' : '选择文件'}
                                  </button>
                            </div>
                            <button 
                                  onClick={handleProcessClick}
                                  disabled={!selectedFile || isProcessing}
                                  className="bg-[#70AD47] text-white font-bold text-sm px-8 py-2.5 rounded-lg shadow-lg shadow-[#70AD47]/20 transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed active:scale-95">
                                  {isProcessing ? '处理中...' : '开始 UPSERT 同步'}
                            </button>
                        </div>
                  </div>
              </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm min-h-[300px]">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 mb-6">
                <RotateCcw size={18} className="text-[#70AD47]" />
                近期物理同步历史
            </h3>
            
            <div className="w-full">
                <div className="grid grid-cols-6 gap-4 pb-4 border-b border-slate-100 text-xs font-bold text-slate-400 text-center">
                    <div className="text-left pl-4">文件名</div>
                    <div>大小</div>
                    <div>有效行数</div>
                    <div>物理库表</div>
                    <div>完成时间</div>
                    <div>同步状态</div>
                </div>
                
                {history.length === 0 ? (
                    <div className="py-20 text-center">
                        <p className="text-slate-300 font-bold text-lg italic">暂无同步记录</p>
                    </div>
                ) : (
                    history.map((h: UploadHistory) => (
                        <div key={h.id} className="grid grid-cols-6 gap-4 py-4 border-b border-slate-50 text-xs text-slate-600 items-center text-center hover:bg-slate-50 transition-colors">
                              <div className="text-left pl-4 font-bold text-slate-700 truncate">{h.fileName}</div>
                              <div>{h.fileSize}</div>
                              <div>{h.rowCount}</div>
                              <div>
                                  <span className="uppercase font-bold text-slate-400">{getTableName(h.targetTable)}</span>
                              </div>
                              <div>{h.uploadTime.split(' ')[0]}</div>
                              <div>
                                  <span className={`flex items-center justify-center gap-1 font-bold ${h.status === '成功' ? 'text-green-600' : 'text-red-500'}`}>
                                      {h.status === '成功' && <Check size={12}/>} {h.status}
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
