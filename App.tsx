import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Upload, Download, Settings, RefreshCw, Layers, Plus, Trash2, Sparkles, 
  Folder, FileText, MoreHorizontal, Edit2, Search, X, ChevronRight, GripVertical, Filter,
  PanelLeftClose, HelpCircle, FileQuestion, ImageIcon, ExternalLink
} from 'lucide-react';
import { parseCSV, exportToExcel } from './services/dataService';
import { generateInsights } from './services/geminiService';
import { AdRow, ColumnDef, Preset, Level, Project } from './types';
import { Button, Card, Badge, Input, Checkbox, cn, Dialog, ToastContainer, ToastMessage } from './components/LinearUI';

// --- Constants ---
const AVAILABLE_COLUMNS: ColumnDef[] = [
  { id: 'imageUrl', label: '預覽圖 (Preview)', type: 'image', width: 80 },
  { id: 'platform', label: '平台 (Platform)', type: 'text' },
  { id: 'status', label: '狀態 (Status)', type: 'text' },
  { id: 'name', label: '名稱 (Name)', type: 'text', width: 250 },
  { id: 'spend', label: '花費 (Spend)', type: 'currency' },
  { id: 'impressions', label: '曝光次數 (Impressions)', type: 'number' },
  { id: 'clicks', label: '點擊 (Clicks)', type: 'number' },
  { id: 'ctr', label: '點閱率 (CTR)', type: 'percent' },
  { id: 'cpc', label: 'CPC', type: 'currency' },
  { id: 'conversions', label: '轉換 (Conv.)', type: 'number' },
  { id: 'cpa', label: 'CPA', type: 'currency' },
  { id: 'roas', label: 'ROAS', type: 'number' },
  { id: 'conversionValue', label: '轉換價值 (Value)', type: 'currency' },
];

const DEFAULT_PRESETS: Preset[] = [
  { id: 'default', name: '標準檢視', columns: ['platform', 'name', 'status', 'spend', 'impressions', 'clicks', 'ctr'] },
  { id: 'performance', name: '成效重點', columns: ['name', 'spend', 'cpc', 'cpa', 'roas', 'conversions'] },
  { id: 'creative', name: '素材分析', columns: ['imageUrl', 'name', 'impressions', 'clicks', 'ctr', 'spend'] },
];

// --- Sub Components ---

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
    // This is now used inside the Modal as the primary interface
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

  // Original fallback for empty state (Full page)
  return (
    <div 
      className={cn(
        "border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 ease-in-out cursor-pointer",
        isDragging ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => document.getElementById('file-upload')?.click()}
    >
      <input id="file-upload" type="file" multiple accept=".csv" className="hidden" onChange={handleChange} />
      <Upload className="mx-auto h-10 w-10 text-zinc-500 mb-4" />
      <h3 className="text-lg font-medium text-zinc-200">將原始報表檔案拖曳至此</h3>
      <p className="text-sm text-zinc-500 mt-2">支援 Meta Ads 與 Google Ads CSV 格式</p>
    </div>
  );
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
  const [activeTab, setActiveTab] = useState<Level | 'all'>('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [showExportHelp, setShowExportHelp] = useState(false);
  
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState("");

  // Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Image Preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Column Management
  const [activePresetId, setActivePresetId] = useState<string>('default');
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_PRESETS[0].columns);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  
  // Analysis
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

  // Sidebar Resizing Logic
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

  // Toast Helpers
  const addToast = (message: string, type: ToastMessage['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto dismiss
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };


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
      data = data.filter(row => row.level === activeTab);
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

    return data;
  }, [activeProject, activeTab, searchQuery]);

  // Project Actions
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
    setEditingProjectId(newProject.id); // Auto enter edit mode
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
      setIsUploadModalOpen(false); // Close modal on success
    } catch (e) {
      console.error(e);
      addToast("解析檔案時發生錯誤", 'error');
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

  // Presets & UI Helpers
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
        case 'campaign': return '廣告活動';
        case 'adset': return '廣告組合/群組';
        case 'ad': return '廣告';
        case 'creative': return '素材表現';
        case 'demographics': return '客層表現';
        default: return tab;
    }
  };

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-300 font-sans overflow-hidden selection:bg-indigo-500/30">
      
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Image Preview Lightbox */}
      <Dialog 
        isOpen={!!previewImage} 
        onClose={() => setPreviewImage(null)}
        title="素材預覽"
      >
         <div className="flex items-center justify-center bg-zinc-950/50 rounded-lg p-2 overflow-hidden">
             {previewImage && (
                 <img src={previewImage} alt="Preview" className="max-w-full max-h-[80vh] object-contain rounded-md" />
             )}
         </div>
      </Dialog>

      <Dialog 
        isOpen={isUploadModalOpen} 
        onClose={() => { setIsUploadModalOpen(false); setShowExportHelp(false); }}
        title="匯入廣告報表"
      >
        <div className="space-y-4">
            {!showExportHelp ? (
                <>
                    <FileUploadZone onUpload={handleUpload} compact />
                    <div className="flex items-center justify-between px-2 pt-2">
                         <div className="text-xs text-zinc-500">
                             支援: .csv 格式 (Meta, Google)
                         </div>
                         <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs gap-1 h-6 text-indigo-400 hover:text-indigo-300"
                            onClick={() => setShowExportHelp(true)}
                         >
                            <HelpCircle size={12} />
                            如何匯出/查看素材影像？
                         </Button>
                    </div>
                </>
            ) : (
                <div className="bg-zinc-900/50 p-4 rounded-lg space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <h4 className="text-sm font-medium text-zinc-100">匯出素材與影像設定</h4>
                        <button onClick={() => setShowExportHelp(false)} className="text-xs text-zinc-500 hover:text-zinc-300">返回</button>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <h5 className="text-xs font-semibold text-zinc-300 mb-1">1. 識別素材名稱</h5>
                            <p className="text-xs text-zinc-400 mb-1">
                                請在報表中包含以下任一文字欄位：
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {['Creative Name', '素材名稱', 'Headline', '標題', 'Primary Text'].map(tag => (
                                    <Badge key={tag} variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700">{tag}</Badge>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h5 className="text-xs font-semibold text-zinc-300 mb-1">2. 顯示影像預覽 (重要)</h5>
                            <p className="text-xs text-zinc-400 mb-2 leading-relaxed">
                                CSV 檔案本身無法儲存圖片。若要顯示縮圖，您的 CSV 必須包含一個<strong>「圖片連結 (URL)」</strong>欄位。
                            </p>
                            <p className="text-xs text-zinc-500 italic mb-2">
                                * 原生 Meta/Google 報表通常不包含公開圖片連結，您可能需要使用第三方工具匯出，或手動建立欄位。
                            </p>
                            <p className="text-xs text-zinc-400 mb-1">支援的連結欄位名稱：</p>
                            <div className="flex flex-wrap gap-1">
                                {['Image URL', 'Thumbnail', 'Preview Link', '圖片連結', '影像網址'].map(tag => (
                                    <Badge key={tag} variant="outline" className="text-[10px] bg-indigo-900/20 text-indigo-300 border-indigo-800/50">{tag}</Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </Dialog>

      {/* Sidebar */}
      <aside 
        style={{ width: isSidebarOpen ? sidebarWidth : 0 }}
        className={cn("flex-shrink-0 border-r border-zinc-800 bg-[#09090b] flex flex-col transition-all duration-300 ease-in-out relative group/sidebar", 
          !isSidebarOpen && "w-0 border-r-0 overflow-hidden"
        )}
      >
        <div className="h-14 flex items-center px-4 border-b border-zinc-800 gap-2 overflow-hidden whitespace-nowrap">
          <div className="h-6 w-6 bg-indigo-500/20 rounded flex items-center justify-center border border-indigo-500/30 flex-shrink-0">
            <Layers className="text-indigo-400" size={14} />
          </div>
          <span className="font-semibold text-zinc-100 tracking-tight">AdFlux</span>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 overflow-x-hidden">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">專案列表</span>
            <button onClick={createProject} className="text-zinc-500 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition-colors">
              <Plus size={14} />
            </button>
          </div>
          
          {projects.length === 0 && (
            <div className="text-xs text-zinc-600 px-2 py-4 text-center whitespace-nowrap">
              尚無專案，請建立新專案
            </div>
          )}

          {projects.map(project => (
            <div 
              key={project.id}
              className={cn(
                "group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer relative",
                activeProjectId === project.id ? "bg-zinc-800/80 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
              )}
              onClick={() => setActiveProjectId(project.id)}
            >
              <Folder size={14} className={cn("flex-shrink-0", activeProjectId === project.id ? "text-indigo-400" : "text-zinc-600")} />
              
              {editingProjectId === project.id ? (
                <input
                  autoFocus
                  className="bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 w-full text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onBlur={() => updateProjectName(project.id, newProjectName)}
                  onKeyDown={e => e.key === 'Enter' && updateProjectName(project.id, newProjectName)}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="truncate flex-1">{project.name}</span>
              )}

              {/* Hover Actions */}
              <div className={cn("hidden group-hover:flex items-center gap-1 absolute right-2 bg-zinc-800/80 rounded pl-1", activeProjectId === project.id && "bg-transparent")}>
                <button 
                  onClick={(e) => { e.stopPropagation(); setEditingProjectId(project.id); setNewProjectName(project.name); }}
                  className="p-1 hover:text-indigo-400"
                >
                  <Edit2 size={12} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                  className="p-1 hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer with Collapse Button */}
        <div className="p-3 border-t border-zinc-800 flex flex-col gap-2">
             <div className="flex items-center justify-between text-xs text-zinc-600 px-1">
                 <div className="flex gap-2">
                    <span>v1.5.0</span>
                    <span>Pro</span>
                 </div>
                 <button 
                    onClick={() => setIsSidebarOpen(false)}
                    className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="收起側邊欄"
                 >
                    <PanelLeftClose size={14} />
                 </button>
             </div>
        </div>

        {/* Resizer Handle */}
        <div 
          onMouseDown={startResizing}
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-50 opacity-0 group-hover/sidebar:opacity-100"
        />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Toggle Sidebar Button (When Closed) */}
        {!isSidebarOpen && (
          <div className="absolute top-3 left-4 z-50 animate-in fade-in zoom-in duration-200">
             <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-400 hover:text-zinc-100 shadow-lg hover:shadow-indigo-500/10 transition-all"
                title="展開側邊欄"
            >
                <Layers size={18} />
            </button>
          </div>
        )}

        {activeProject ? (
          <>
            {/* Header */}
            <header className="h-14 flex items-center justify-between px-6 border-b border-zinc-800 bg-[#09090b]/50 backdrop-blur-sm z-10 transition-all duration-300" style={{ paddingLeft: !isSidebarOpen ? '60px' : '24px' }}>
               <div className="flex items-center gap-4">
                 <div>
                    <h2 className="text-sm font-medium text-zinc-100">{activeProject.name}</h2>
                    <p className="text-[10px] text-zinc-500">最後更新: {new Date(activeProject.updatedAt).toLocaleDateString()}</p>
                 </div>
               </div>

               <div className="flex items-center gap-3">
                  {activeProject.data.length > 0 && (
                    <>
                      <Button onClick={handleAnalysis} variant="secondary" className="h-8 text-xs gap-2">
                        {isAnalyzing ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} className="text-amber-400"/>}
                        AI 分析
                      </Button>
                      <Button onClick={handleExport} variant="primary" className="h-8 text-xs gap-2">
                        <Download size={14} /> 匯出
                      </Button>
                    </>
                  )}
               </div>
            </header>

            {/* Scrollable Area */}
            <main className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {activeProject.data.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center pb-20">
                   <div 
                      onClick={() => setIsUploadModalOpen(true)}
                      className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl p-10 text-center transition-all cursor-pointer"
                   >
                      <Upload className="mx-auto h-10 w-10 text-zinc-500 mb-4" />
                      <h3 className="text-lg font-medium text-zinc-200">開始匯入資料</h3>
                      <p className="text-sm text-zinc-500 mt-2">點擊開啟上傳視窗</p>
                   </div>
                </div>
              ) : (
                <>
                  {/* Analysis Result */}
                  {analysisResult && (
                    <Card className="p-5 border-indigo-500/20 bg-indigo-900/10 animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-indigo-500/20 rounded-md shrink-0">
                          <Sparkles className="text-indigo-400" size={18} />
                        </div>
                        <div className="space-y-1 flex-1">
                          <h3 className="text-sm font-medium text-indigo-100">AI 成效分析報告</h3>
                          <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-light opacity-90">
                            {analysisResult}
                          </div>
                        </div>
                        <button onClick={() => setAnalysisResult(null)} className="text-zinc-500 hover:text-zinc-300">
                          <X size={16} />
                        </button>
                      </div>
                    </Card>
                  )}

                  {/* Toolbar */}
                  <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4 sticky top-0 bg-[#09090b] py-2 z-10 border-b border-zinc-800/0">
                    
                    <div className="flex items-center gap-4 w-full xl:w-auto overflow-x-auto no-scrollbar pb-2 xl:pb-0">
                        {/* Tabs */}
                        <div className="flex p-1 bg-zinc-900 rounded-lg border border-zinc-800 shrink-0">
                          {(['all', 'campaign', 'adset', 'ad', 'creative', 'demographics'] as const).map((tab) => (
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

                         {/* Search Bar */}
                        <div className="relative group shrink-0 w-48 xl:w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" size={14} />
                            <input 
                                type="text" 
                                placeholder="搜尋名稱、狀態..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-all"
                            />
                             {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                        
                        {/* Quick Upload Button -> Triggers Modal */}
                        <div className="h-8 shrink-0">
                             <button 
                                onClick={() => setIsUploadModalOpen(true)}
                                className="h-full px-3 flex items-center gap-2 bg-zinc-900 border border-dashed border-zinc-700 hover:border-zinc-500 rounded-md cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                              >
                                <Plus size={14} />
                                <span>新增檔案</span>
                              </button>
                        </div>
                    </div>

                    {/* Presets */}
                    <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 no-scrollbar shrink-0">
                      <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mr-1 shrink-0">VIEW</span>
                      {[...DEFAULT_PRESETS, ...customPresets].map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => applyPreset(preset.id)}
                          className={cn(
                            "px-3 py-1 text-xs rounded-full border transition-colors whitespace-nowrap",
                            activePresetId === preset.id 
                              ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400" 
                              : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800"
                          )}
                        >
                          {preset.name}
                        </button>
                      ))}
                      <button 
                        onClick={() => setIsColumnModalOpen(!isColumnModalOpen)}
                        className="p-1 rounded-full border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 ml-2"
                      >
                        <Settings size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Column Config Panel */}
                  {isColumnModalOpen && (
                    <Card className="p-4 animate-in fade-in slide-in-from-top-2 duration-200 mb-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium">自訂欄位顯示</h3>
                        <div className="flex gap-2">
                           <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-xs h-7"
                            onClick={() => {
                              const name = prompt("請輸入此檢視模式的名稱:");
                              if (name) saveCurrentAsPreset(name);
                            }}
                          >
                            儲存組合
                          </Button>
                          <button onClick={() => setIsColumnModalOpen(false)} className="text-zinc-500 hover:text-zinc-300"><X size={16}/></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {AVAILABLE_COLUMNS.map(col => (
                          <label key={col.id} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 cursor-pointer select-none">
                            <Checkbox 
                              checked={visibleColumns.includes(col.id)}
                              onChange={(e) => {
                                if (e.target.checked) setVisibleColumns([...visibleColumns, col.id]);
                                else setVisibleColumns(visibleColumns.filter(c => c !== col.id));
                              }}
                            />
                            {col.label}
                          </label>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Table */}
                  <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/30">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-zinc-800 bg-zinc-900/80">
                            {visibleColumns.map(colId => {
                              const def = AVAILABLE_COLUMNS.find(c => c.id === colId);
                              return (
                                <th key={colId} className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider">
                                  {def?.label}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {filteredData.slice(0, 200).map((row) => (
                            <tr key={row.id} className="hover:bg-zinc-800/30 transition-colors group">
                              {visibleColumns.map(colId => {
                                const def = AVAILABLE_COLUMNS.find(c => c.id === colId);
                                const val = row[colId];
                                
                                // --- IMAGE COLUMN RENDER ---
                                if (colId === 'imageUrl') {
                                    return (
                                        <td key={colId} className="px-4 py-2.5">
                                            {val ? (
                                                <div 
                                                    className="w-10 h-10 rounded overflow-hidden bg-zinc-800 cursor-zoom-in border border-zinc-700 hover:border-indigo-500/50 transition-colors"
                                                    onClick={() => setPreviewImage(val)}
                                                >
                                                    <img src={val} alt="Ad Preview" className="w-full h-full object-cover" />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded bg-zinc-800/50 flex items-center justify-center text-zinc-600">
                                                    <ImageIcon size={14} />
                                                </div>
                                            )}
                                        </td>
                                    )
                                }

                                if (colId === 'platform') {
                                  return (
                                    <td key={colId} className="px-4 py-2.5">
                                      {val === 'meta' ? (
                                        <div className="flex items-center gap-1">
                                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                          <span className="text-zinc-300 text-xs">Meta</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1">
                                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                          <span className="text-zinc-300 text-xs">Google</span>
                                        </div>
                                      )}
                                    </td>
                                  );
                                }
                                if (colId === 'status') {
                                    return (
                                        <td key={colId} className="px-4 py-2.5">
                                            <Badge variant="outline" className={cn(
                                              "border-0 px-1.5 py-0.5 rounded text-[10px]",
                                              (val === 'Active' || val === 'enabled' || val === 'active') ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                                            )}>
                                              {val}
                                            </Badge>
                                        </td>
                                    )
                                }
                                if (colId === 'name') {
                                    return (
                                        <td key={colId} className="px-4 py-2.5 max-w-[300px] truncate text-zinc-300 group-hover:text-zinc-100 font-medium" title={val}>
                                            {val}
                                        </td>
                                    )
                                }

                                return (
                                  <td key={colId} className={cn("px-4 py-2.5 text-zinc-400 tabular-nums", 
                                    def?.type === 'currency' && "text-zinc-300",
                                    (colId === 'roas' && row.roas > 3) && "text-emerald-400 font-medium"
                                  )}>
                                    {formatVal(val, def?.type || 'text')}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Footer */}
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
            <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4 border border-zinc-800">
              <Folder size={32} className="opacity-20" />
            </div>
            <h3 className="text-lg font-medium text-zinc-300 mb-2">尚未選擇專案</h3>
            <p className="text-sm max-w-xs text-center mb-6">請從左側選擇一個專案，或是建立新專案來開始管理您的廣告報表。</p>
            <Button onClick={createProject}>建立新專案</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
