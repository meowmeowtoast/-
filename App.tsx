import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Upload, Download, Settings, RefreshCw, Layers, Plus, Trash2, Sparkles, 
  Folder, FileText, MoreHorizontal, Edit2, Search, X, ChevronRight, GripVertical, Filter,
  PanelLeftClose, HelpCircle, FileQuestion, ImageIcon, ExternalLink, Facebook, Calendar, Link
} from 'lucide-react';
import { parseCSV, exportToExcel } from './services/dataService';
import { generateInsights } from './services/geminiService';
import { fetchAdAccounts, fetchMetaAdsData } from './services/metaApiService';
import { AdRow, ColumnDef, Preset, Level, Project } from './types';
import { Button, Card, Badge, Input, Checkbox, cn, Dialog, ToastContainer, ToastMessage, Label, Select } from './components/LinearUI';

// --- Constants ---
const AVAILABLE_COLUMNS: ColumnDef[] = [
  { id: 'campaignName', label: '行銷活動名稱 (Campaign)', type: 'text', width: 200 },
  { id: 'imageUrl', label: '素材 (Preview)', type: 'image', width: 80 },
  { id: 'name', label: '名稱 (Name)', type: 'text', width: 250 }, // For AdSet/Ad Name
  { id: 'status', label: '投遞狀態 (Status)', type: 'text' },
  
  // Engagement
  { id: 'reach', label: '觸及人數 (Reach)', type: 'number' },
  { id: 'clicks', label: '點擊次數 (Clicks All)', type: 'number' },
  { id: 'impressions', label: '曝光次數 (Impressions)', type: 'number' },
  { id: 'ctr', label: 'CTR (All)', type: 'percent' },
  { id: 'cpc', label: 'CPC (All)', type: 'currency' },
  
  // Link Specific
  { id: 'linkClicks', label: '連結點擊 (Link Clicks)', type: 'number' },
  { id: 'linkCtr', label: '連結 CTR', type: 'percent' },
  { id: 'linkCpc', label: '連結 CPC', type: 'currency' },
  
  // Conversions
  { id: 'conversions', label: '成果 (Results)', type: 'number' },
  { id: 'websitePurchases', label: '網站購買 (Purchases)', type: 'number' },
  { id: 'cpa', label: 'CPA (Cost/Result)', type: 'currency' },
  { id: 'conversionRate', label: '轉換率 (CVR)', type: 'percent' },
  { id: 'roas', label: 'ROAS', type: 'number' },
  
  { id: 'spend', label: '花費金額 (Spend)', type: 'currency' },
];

const DEFAULT_PRESETS: Preset[] = [
  // 1. Campaign Level Report
  { 
    id: 'campaign_report', 
    name: '廣告活動報表', 
    columns: [
        'name', // Campaign Name (at campaign level 'name' is campaign name)
        'status', 'reach', 'clicks', 'impressions', 'ctr', 'cpc', 
        'linkClicks', 'linkCtr', 'linkCpc', 
        'conversions', 'cpa', 'conversionRate', 'spend'
    ] 
  },
  // 2. Audience (AdSet) Level Report
  { 
    id: 'audience_report', 
    name: '受眾/組合報表', 
    columns: [
        'campaignName', 'name', // AdSet Name
        'status', 'clicks', 'impressions', 'ctr', 'cpc',
        'linkClicks', 'linkCtr', 'linkCpc',
        'websitePurchases', 'cpa', 'conversionRate', 'spend'
    ] 
  },
  // 3. Creative (Ad) Level Report
  { 
    id: 'creative_report', 
    name: '素材/廣告報表', 
    columns: [
        'campaignName', 'imageUrl', 'name', // Ad Name/Headline
        'clicks', 'impressions', 'ctr', 'cpc',
        'linkClicks', 'linkCtr', 'linkCpc',
        'websitePurchases', 'cpa', 'conversionRate', 'spend'
    ] 
  },
];

const getLast30Days = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
};

const FileUploadZone: React.FC<{ onUpload: (files: File[]) => void, compact?: boolean }> = ({ onUpload, compact }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(Array.from(e.dataTransfer.files));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(Array.from(e.target.files));
    }
  };

  if (compact) {
    return (
       <div 
        className={cn(
            "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all duration-200 ease-in-out cursor-pointer h-56",
            isDragging 
                ? "border-indigo-500 bg-indigo-500/10" 
                : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900/80"
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload-modal')?.click()}
      >
        <input id="file-upload-modal" type="file" multiple accept=".csv" className="hidden" onChange={handleChange} />
        <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mb-4 text-zinc-400">
            <Upload className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-medium text-zinc-200 mb-1">點擊上傳或拖曳檔案至此</h3>
        <p className="text-xs text-zinc-500">支援 Meta & Google Ads CSV</p>
      </div>
    )
  }
  return null; 
};

// --- Main App Component ---

const App: React.FC = () => {
  // Projects State
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('adflux_projects');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Level | 'all'>('campaign'); // Default to Campaign
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  
  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [showExportHelp, setShowExportHelp] = useState(false);
  
  // Meta API State
  const [metaToken, setMetaToken] = useState("");
  const [metaAccounts, setMetaAccounts] = useState<any[]>([]);
  const [selectedMetaAccount, setSelectedMetaAccount] = useState("");
  
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState(getLast30Days());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Column Management
  const [activePresetId, setActivePresetId] = useState<string>('campaign_report');
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_PRESETS[0].columns);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('adflux_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    const storedPresets = localStorage.getItem('adflux_presets');
    if (storedPresets) {
      setCustomPresets(JSON.parse(storedPresets));
    }
  }, []);

  // When Tab changes, auto-switch to relevant preset for better UX
  useEffect(() => {
      if (activeTab === 'campaign') applyPreset('campaign_report');
      if (activeTab === 'adset') applyPreset('audience_report');
      if (activeTab === 'ad' || activeTab === 'creative') applyPreset('creative_report');
  }, [activeTab]);

  // Sidebar Resizing
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      let newWidth = e.clientX;
      if (newWidth < 200) newWidth = 200;
      if (newWidth > 600) newWidth = 600;
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
  };

  const addToast = (message: string, type: ToastMessage['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // Derived State
  const activeProject = useMemo(() => 
    projects.find(p => p.id === activeProjectId), 
    [projects, activeProjectId]
  );

  const filteredData = useMemo(() => {
    if (!activeProject) return [];
    
    let data = activeProject.data;

    // 1. Tab Filter
    if (activeTab !== 'all') {
        // If tab is 'creative', we map to 'ad' or 'creative' level
        if (activeTab === 'creative') {
             data = data.filter(row => row.level === 'ad' || row.level === 'creative');
        } else {
             data = data.filter(row => row.level === activeTab);
        }
    }

    // 2. Search Query Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      data = data.filter(row => 
        row.name.toLowerCase().includes(query) || 
        row.status.toLowerCase().includes(query) ||
        row.campaignName?.toLowerCase().includes(query) ||
        row.adGroupName?.toLowerCase().includes(query)
      );
    }

    // 3. Sorting (Crucial for Merge Logic)
    // We must sort by Campaign Name first so we can merge cells visually
    data.sort((a, b) => {
        const cA = a.campaignName || a.name || '';
        const cB = b.campaignName || b.name || '';
        return cA.localeCompare(cB);
    });

    return data;
  }, [activeProject, activeTab, searchQuery]);

  // ... (Project Actions: createProject, updateProjectName, deleteProject, handleUpload - Same as before)
  const createProject = () => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name: "未命名專案",
      data: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setProjects(prev => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
    setEditingProjectId(newProject.id);
    setNewProjectName("未命名專案");
  };

  const updateProjectName = (id: string, name: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name, updatedAt: Date.now() } : p));
    setEditingProjectId(null);
  };

  const deleteProject = (id: string) => {
    if (confirm("確定要刪除此專案嗎？這將無法復原。")) {
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProjectId === id) setActiveProjectId(null);
    }
  };

  const handleUpload = async (files: File[]) => {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      const results = await Promise.all(files.map(f => parseCSV(f)));
      const newRows = results.flat();
      if (newRows.length === 0) {
        addToast("未偵測到有效資料，請確認檔案格式", 'error');
        return;
      }
      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            data: [...p.data, ...newRows],
            updatedAt: Date.now()
          };
        }
        return p;
      }));
      addToast(`成功匯入 ${newRows.length} 筆資料`, 'success');
      setIsUploadModalOpen(false);
    } catch (e) {
      console.error(e);
      addToast("解析檔案時發生錯誤", 'error');
    } finally {
      setLoading(false);
    }
  };

  // ... (Meta API Actions: handleFetchAccounts, handleConnectMeta, handleSyncMeta - Same as before)
  const handleFetchAccounts = async () => {
    if (!metaToken) return addToast("請輸入 Access Token", 'error');
    setLoading(true);
    try {
        const accounts = await fetchAdAccounts(metaToken);
        setMetaAccounts(accounts);
        if (accounts.length > 0) setSelectedMetaAccount(accounts[0].account_id);
    } catch (e: any) {
        addToast(`取得帳號失敗: ${e.message}`, 'error');
    } finally {
        setLoading(false);
    }
  };

  const handleConnectMeta = async () => {
      if (!selectedMetaAccount) return;
      const account = metaAccounts.find(a => a.account_id === selectedMetaAccount);
      if (!account) return;
      setLoading(true);
      try {
          const rows = await fetchMetaAdsData(metaToken, selectedMetaAccount, dateRange.start, dateRange.end);
          const newProject: Project = {
              id: crypto.randomUUID(),
              name: `Meta: ${account.name}`,
              data: rows,
              metaConfig: { accountId: account.account_id, accountName: account.name, token: metaToken },
              createdAt: Date.now(),
              updatedAt: Date.now()
          };
          setProjects(prev => [newProject, ...prev]);
          setActiveProjectId(newProject.id);
          setIsMetaModalOpen(false);
          addToast("成功連結 Meta 帳號並同步數據", 'success');
      } catch (e: any) {
          addToast(`同步失敗: ${e.message}`, 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleSyncMeta = async () => {
      if (!activeProject?.metaConfig) return;
      setLoading(true);
      try {
          const rows = await fetchMetaAdsData(
              activeProject.metaConfig.token, activeProject.metaConfig.accountId, dateRange.start, dateRange.end
          );
          setProjects(prev => prev.map(p => {
             if (p.id === activeProject.id) return { ...p, data: rows, updatedAt: Date.now() };
             return p;
          }));
          addToast("數據已更新至最新", 'success');
      } catch (e: any) {
          addToast(`更新失敗: ${e.message}`, 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleExport = () => {
    if (activeProject) {
      exportToExcel(activeProject.data, activeProject.name);
      addToast("報表下載中...", 'info');
    }
  };

  const handleAnalysis = async () => {
    if (!activeProject || activeProject.data.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
        const result = await generateInsights(activeProject.data);
        setAnalysisResult(result);
        addToast("AI 分析報告已生成", 'success');
    } catch (e) {
        addToast("分析過程發生錯誤", 'error');
    } finally {
        setIsAnalyzing(false);
    }
  };

  const applyPreset = (presetId: string) => {
    const allPresets = [...DEFAULT_PRESETS, ...customPresets];
    const preset = allPresets.find(p => p.id === presetId);
    if (preset) {
      setVisibleColumns(preset.columns);
      setActivePresetId(presetId);
    }
  };

  const saveCurrentAsPreset = (name: string) => {
    const newPreset: Preset = {
      id: `custom-${Date.now()}`,
      name,
      columns: visibleColumns
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    localStorage.setItem('adflux_presets', JSON.stringify(updated));
    setActivePresetId(newPreset.id);
    addToast(`檢視模式「${name}」已儲存`, 'success');
  };

  const formatVal = (val: any, type: ColumnDef['type']) => {
    if (type === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    if (type === 'percent') return `${val.toFixed(2)}%`;
    if (type === 'number') return val.toLocaleString();
    return val;
  };

  const getTabLabel = (tab: string) => {
    switch (tab) {
        case 'all': return '總覽';
        case 'campaign': return '廣告活動 (Campaigns)';
        case 'adset': return '廣告受眾 (Audience)';
        case 'ad': return '廣告 (Ads)';
        case 'creative': return '素材表現 (Creative)';
        case 'demographics': return '客層表現 (Demographics)';
        default: return tab;
    }
  };

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-300 font-sans overflow-hidden selection:bg-indigo-500/30">
      
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <Dialog isOpen={!!previewImage} onClose={() => setPreviewImage(null)} title="素材預覽">
         <div className="flex items-center justify-center bg-zinc-950/50 rounded-lg p-2 overflow-hidden">
             {previewImage && <img src={previewImage} alt="Preview" className="max-w-full max-h-[80vh] object-contain rounded-md" />}
         </div>
      </Dialog>

      <Dialog isOpen={isUploadModalOpen} onClose={() => { setIsUploadModalOpen(false); setShowExportHelp(false); }} title="匯入廣告報表 (CSV)">
        <div className="space-y-4">
            {!showExportHelp ? (
                <>
                    <FileUploadZone onUpload={handleUpload} compact />
                    <div className="flex items-center justify-between px-2 pt-2">
                         <div className="text-xs text-zinc-500">支援: .csv 格式 (Meta, Google)</div>
                         <Button variant="ghost" size="sm" className="text-xs gap-1 h-6 text-indigo-400 hover:text-indigo-300" onClick={() => setShowExportHelp(true)}>
                            <HelpCircle size={12} />如何匯出/查看素材影像？
                         </Button>
                    </div>
                </>
            ) : (
                <div className="bg-zinc-900/50 p-4 rounded-lg space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <h4 className="text-sm font-medium text-zinc-100">匯出素材與影像設定</h4>
                        <button onClick={() => setShowExportHelp(false)} className="text-xs text-zinc-500 hover:text-zinc-300">返回</button>
                    </div>
                    {/* ... Help content (Same as before) ... */}
                </div>
            )}
        </div>
      </Dialog>

      <Dialog isOpen={isMetaModalOpen} onClose={() => setIsMetaModalOpen(false)} title="連結 Meta 廣告帳號">
         <div className="space-y-6">
             {/* ... Meta Modal Content (Same as before) ... */}
             <div className="space-y-3">
                 <Label>1. 輸入 Access Token</Label>
                 <div className="flex gap-2">
                     <Input type="password" placeholder="EAA..." value={metaToken} onChange={(e) => setMetaToken(e.target.value)} className="font-mono text-xs" />
                     <Button onClick={handleFetchAccounts} disabled={loading}>{loading ? <RefreshCw className="animate-spin" size={14}/> : "取得帳號"}</Button>
                 </div>
             </div>
             {metaAccounts.length > 0 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                    <Label>2. 選擇廣告帳號</Label>
                    <Select value={selectedMetaAccount} onChange={(e) => setSelectedMetaAccount(e.target.value)}>
                        {metaAccounts.map(account => (
                            <option key={account.id} value={account.account_id}>{account.name} (ID: {account.account_id})</option>
                        ))}
                    </Select>
                </div>
             )}
             <div className="pt-2 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsMetaModalOpen(false)}>取消</Button>
                <Button disabled={!selectedMetaAccount || loading} onClick={handleConnectMeta} className="bg-[#1877F2] hover:bg-[#166fe5] text-white">
                    {loading ? "連結中..." : "確認並匯入數據"}
                </Button>
             </div>
         </div>
      </Dialog>

      {/* Sidebar (Same structure) */}
      <aside 
        style={{ width: isSidebarOpen ? sidebarWidth : 0 }}
        className={cn("flex-shrink-0 border-r border-zinc-800 bg-[#09090b] flex flex-col transition-all duration-300 ease-in-out relative group/sidebar", !isSidebarOpen && "w-0 border-r-0 overflow-hidden")}
      >
        <div className="h-14 flex items-center px-4 border-b border-zinc-800 gap-2 overflow-hidden whitespace-nowrap">
          <div className="h-6 w-6 bg-indigo-500/20 rounded flex items-center justify-center border border-indigo-500/30 flex-shrink-0">
            <Layers className="text-indigo-400" size={14} />
          </div>
          <span className="font-semibold text-zinc-100 tracking-tight">AdFlux</span>
        </div>
        <div className="p-3 space-y-2 border-b border-zinc-800">
            <Button variant="secondary" className="w-full justify-start text-xs h-8 gap-2 bg-zinc-900 hover:bg-zinc-800" onClick={createProject}>
                <Plus size={14} /><span>空白專案 (CSV)</span>
            </Button>
             <Button variant="secondary" className="w-full justify-start text-xs h-8 gap-2 bg-[#1877F2]/10 hover:bg-[#1877F2]/20 text-[#1877F2] border-[#1877F2]/30" onClick={() => setIsMetaModalOpen(true)}>
                <Facebook size={14} /><span>連結 Meta 帳號</span>
            </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-3 space-y-1 overflow-x-hidden">
          {/* ... Project List ... */}
          {projects.map(project => (
            <div 
              key={project.id}
              className={cn("group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer relative", activeProjectId === project.id ? "bg-zinc-800/80 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200")}
              onClick={() => setActiveProjectId(project.id)}
            >
              {project.metaConfig ? <Facebook size={14} className={cn("flex-shrink-0", activeProjectId === project.id ? "text-[#1877F2]" : "text-zinc-600")} /> : <Folder size={14} className={cn("flex-shrink-0", activeProjectId === project.id ? "text-indigo-400" : "text-zinc-600")} />}
              {editingProjectId === project.id ? (
                <input autoFocus className="bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 w-full text-xs text-zinc-100" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onBlur={() => updateProjectName(project.id, newProjectName)} onKeyDown={e => e.key === 'Enter' && updateProjectName(project.id, newProjectName)} onClick={e => e.stopPropagation()} />
              ) : <span className="truncate flex-1">{project.name}</span>}
              <div className={cn("hidden group-hover:flex items-center gap-1 absolute right-2 bg-zinc-800/80 rounded pl-1", activeProjectId === project.id && "bg-transparent")}>
                <button onClick={(e) => { e.stopPropagation(); setEditingProjectId(project.id); setNewProjectName(project.name); }} className="p-1 hover:text-indigo-400"><Edit2 size={12} /></button>
                <button onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }} className="p-1 hover:text-red-400"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
        {/* ... Sidebar Footer & Resizer ... */}
         <div className="p-3 border-t border-zinc-800 flex flex-col gap-2">
             <div className="flex items-center justify-between text-xs text-zinc-600 px-1">
                 <div className="flex gap-2"><span>v1.7.0</span><span>Pro</span></div>
                 <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"><PanelLeftClose size={14} /></button>
             </div>
        </div>
        <div onMouseDown={startResizing} className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-50 opacity-0 group-hover/sidebar:opacity-100" />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {!isSidebarOpen && (
          <div className="absolute top-3 left-4 z-50 animate-in fade-in zoom-in duration-200">
             <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-400 hover:text-zinc-100 shadow-lg hover:shadow-indigo-500/10 transition-all"><Layers size={18} /></button>
          </div>
        )}

        {activeProject ? (
          <>
            <header className="h-14 flex items-center justify-between px-6 border-b border-zinc-800 bg-[#09090b]/50 backdrop-blur-sm z-10 transition-all duration-300" style={{ paddingLeft: !isSidebarOpen ? '60px' : '24px' }}>
               <div className="flex items-center gap-4">
                 <div>
                    <div className="flex items-center gap-2">
                        {activeProject.metaConfig && <Facebook size={12} className="text-[#1877F2]" />}
                        <h2 className="text-sm font-medium text-zinc-100">{activeProject.name}</h2>
                    </div>
                    <p className="text-[10px] text-zinc-500">最後更新: {new Date(activeProject.updatedAt).toLocaleDateString()} {new Date(activeProject.updatedAt).toLocaleTimeString()}</p>
                 </div>
               </div>
               <div className="flex items-center gap-3">
                  {activeProject.data.length > 0 && (
                    <>
                      <Button onClick={handleAnalysis} variant="secondary" className="h-8 text-xs gap-2">
                        {isAnalyzing ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} className="text-amber-400"/>} AI 分析
                      </Button>
                      <Button onClick={handleExport} variant="primary" className="h-8 text-xs gap-2"><Download size={14} /> 匯出</Button>
                    </>
                  )}
               </div>
            </header>

            <main className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeProject.data.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center pb-20">
                   {/* ... Empty State ... */}
                   {activeProject.metaConfig ? (
                       <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-[#1877F2]/10 rounded-2xl flex items-center justify-center mx-auto border border-[#1877F2]/20"><Facebook size={32} className="text-[#1877F2]" /></div>
                            <h3 className="text-lg font-medium text-zinc-200">Meta API 已連結</h3>
                            <p className="text-sm text-zinc-500">點擊上方工具列的「同步」按鈕來抓取數據</p>
                       </div>
                   ) : (
                        <div onClick={() => setIsUploadModalOpen(true)} className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl p-10 text-center transition-all cursor-pointer">
                            <Upload className="mx-auto h-10 w-10 text-zinc-500 mb-4" />
                            <h3 className="text-lg font-medium text-zinc-200">開始匯入資料</h3>
                            <p className="text-sm text-zinc-500 mt-2">點擊開啟上傳視窗</p>
                        </div>
                   )}
                </div>
              ) : (
                <>
                  {/* Analysis Result (Same) */}
                  {analysisResult && (
                    <Card className="p-5 border-indigo-500/20 bg-indigo-900/10 animate-in fade-in slide-in-from-top-2">
                      {/* ... Content ... */}
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-indigo-500/20 rounded-md shrink-0"><Sparkles className="text-indigo-400" size={18} /></div>
                        <div className="space-y-1 flex-1">
                          <h3 className="text-sm font-medium text-indigo-100">AI 成效分析報告</h3>
                          <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-light opacity-90">{analysisResult}</div>
                        </div>
                        <button onClick={() => setAnalysisResult(null)} className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
                      </div>
                    </Card>
                  )}

                  {/* Toolbar */}
                  <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4 sticky top-0 bg-[#09090b] py-2 z-10 border-b border-zinc-800/0">
                    <div className="flex items-center gap-4 w-full xl:w-auto overflow-x-auto no-scrollbar pb-2 xl:pb-0">
                        {/* Tabs */}
                        <div className="flex p-1 bg-zinc-900 rounded-lg border border-zinc-800 shrink-0">
                          {(['all', 'campaign', 'adset', 'creative'] as const).map((tab) => (
                            <button
                              key={tab}
                              onClick={() => { setActiveTab(tab); setSearchQuery(""); }}
                              className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap",
                                activeTab === tab ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              {getTabLabel(tab)}
                            </button>
                          ))}
                        </div>

                         {/* Search */}
                        <div className="relative group shrink-0 w-48 xl:w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" size={14} />
                            <input type="text" placeholder="搜尋名稱..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-all" />
                             {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"><X size={12} /></button>}
                        </div>

                        {/* Meta Controls */}
                        {activeProject.metaConfig ? (
                             <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg shrink-0">
                                <Calendar size={14} className="text-zinc-500"/>
                                <input type="date" value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} className="bg-transparent text-xs text-zinc-300 focus:outline-none w-24" />
                                <span className="text-zinc-600">-</span>
                                <input type="date" value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} className="bg-transparent text-xs text-zinc-300 focus:outline-none w-24" />
                                <div className="w-px h-4 bg-zinc-700 mx-2"/>
                                <button onClick={handleSyncMeta} disabled={loading} className="text-xs text-[#1877F2] hover:text-white font-medium flex items-center gap-1 disabled:opacity-50">
                                    {loading ? <RefreshCw size={14} className="animate-spin"/> : <RefreshCw size={14}/>} 同步
                                </button>
                             </div>
                        ) : (
                            <div className="h-8 shrink-0"><button onClick={() => setIsUploadModalOpen(true)} className="h-full px-3 flex items-center gap-2 bg-zinc-900 border border-dashed border-zinc-700 hover:border-zinc-500 rounded-md cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 transition-colors"><Plus size={14} /><span>新增檔案</span></button></div>
                        )}
                    </div>
                    {/* Presets */}
                    <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 no-scrollbar shrink-0">
                      <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mr-1 shrink-0">VIEW</span>
                      {[...DEFAULT_PRESETS, ...customPresets].map(preset => (
                        <button key={preset.id} onClick={() => applyPreset(preset.id)} className={cn("px-3 py-1 text-xs rounded-full border transition-colors whitespace-nowrap", activePresetId === preset.id ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400" : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800")}>{preset.name}</button>
                      ))}
                      <button onClick={() => setIsColumnModalOpen(!isColumnModalOpen)} className="p-1 rounded-full border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 ml-2"><Settings size={14} /></button>
                    </div>
                  </div>

                  {/* Column Config Modal (Same) */}
                  {isColumnModalOpen && (
                    <Card className="p-4 animate-in fade-in slide-in-from-top-2 duration-200 mb-4">
                      {/* ... */}
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium">自訂欄位顯示</h3>
                        <div className="flex gap-2"><Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => { const name = prompt("請輸入此檢視模式的名稱:"); if (name) saveCurrentAsPreset(name); }}>儲存組合</Button><button onClick={() => setIsColumnModalOpen(false)} className="text-zinc-500 hover:text-zinc-300"><X size={16}/></button></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {AVAILABLE_COLUMNS.map(col => (
                          <label key={col.id} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 cursor-pointer select-none">
                            <Checkbox checked={visibleColumns.includes(col.id)} onChange={(e) => { if (e.target.checked) setVisibleColumns([...visibleColumns, col.id]); else setVisibleColumns(visibleColumns.filter(c => c !== col.id)); }} />{col.label}
                          </label>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Table */}
                  <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/30">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-800 bg-zinc-900/80">
                            {visibleColumns.map(colId => {
                              const def = AVAILABLE_COLUMNS.find(c => c.id === colId);
                              return <th key={colId} className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider">{def?.label}</th>;
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {filteredData.slice(0, 200).map((row, index) => {
                             // --- MERGE LOGIC ---
                             // Check if campaignName matches previous row
                             const isSameCampaign = index > 0 && row.campaignName === filteredData[index - 1].campaignName;
                             
                             return (
                                <tr key={row.id} className="hover:bg-zinc-800/30 transition-colors group">
                                {visibleColumns.map(colId => {
                                    const def = AVAILABLE_COLUMNS.find(c => c.id === colId);
                                    const val = row[colId];
                                    
                                    // Special Case: Campaign Name Column
                                    if (colId === 'campaignName') {
                                        return (
                                            <td key={colId} className="px-4 py-2.5 max-w-[200px] truncate text-zinc-300 font-medium">
                                                {/* Only show if not same as previous, or if it's the first row */}
                                                {!isSameCampaign && <span title={val} className="text-indigo-300">{val}</span>}
                                            </td>
                                        );
                                    }

                                    // Image
                                    if (colId === 'imageUrl') {
                                        return (
                                            <td key={colId} className="px-4 py-2.5">
                                                {val ? (
                                                    <div className="w-10 h-10 rounded overflow-hidden bg-zinc-800 cursor-zoom-in border border-zinc-700 hover:border-indigo-500/50 transition-colors" onClick={() => setPreviewImage(val)}>
                                                        <img src={val} alt="Ad Preview" className="w-full h-full object-cover" />
                                                    </div>
                                                ) : (
                                                    // Placeholder icon
                                                    <div className="w-10 h-10 rounded bg-zinc-800/50 flex items-center justify-center text-zinc-600"><ImageIcon size={14} /></div>
                                                )}
                                            </td>
                                        )
                                    }

                                    if (colId === 'platform') {
                                        return <td key={colId} className="px-4 py-2.5">{val === 'meta' ? <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /><span className="text-zinc-300 text-xs">Meta</span></div> : <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-orange-500" /><span className="text-zinc-300 text-xs">Google</span></div>}</td>;
                                    }
                                    if (colId === 'status') {
                                        return <td key={colId} className="px-4 py-2.5"><Badge variant="outline" className={cn("border-0 px-1.5 py-0.5 rounded text-[10px]", (val === 'Active' || val === 'enabled' || val === 'active') ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500")}>{val}</Badge></td>;
                                    }
                                    if (colId === 'name') {
                                        return <td key={colId} className="px-4 py-2.5 max-w-[300px] truncate text-zinc-300 group-hover:text-zinc-100 font-medium" title={val}>{val}</td>;
                                    }

                                    return (
                                    <td key={colId} className={cn("px-4 py-2.5 text-zinc-400 tabular-nums", def?.type === 'currency' && "text-zinc-300", (colId === 'roas' && row.roas > 3) && "text-emerald-400 font-medium")}>
                                        {formatVal(val, def?.type || 'text')}
                                    </td>
                                    );
                                })}
                                </tr>
                             );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/50 text-[10px] text-zinc-600 flex justify-between">
                      <span>顯示 {Math.min(filteredData.length, 200)} / {filteredData.length} 筆資料 (僅顯示前200筆)</span>
                      {activeProject.data.length > 0 && <span className="opacity-70">資料來源: {activeProject.name}</span>}
                    </div>
                  </div>
                </>
              )}
            </main>
          </>
        ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4 border border-zinc-800"><Folder size={32} className="opacity-20" /></div>
                <h3 className="text-lg font-medium text-zinc-300 mb-2">尚未選擇專案</h3>
                <p className="text-sm max-w-xs text-center mb-6">請從左側選擇一個專案，或是建立新專案來開始管理您的廣告報表。</p>
                <div className="flex gap-3"><Button onClick={createProject}>空白專案</Button><Button variant="secondary" onClick={() => setIsMetaModalOpen(true)}>連結 Meta</Button></div>
            </div>
        )}
      </div>
    </div>
  );
};

export default App;
