
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Upload, Download, Settings, RefreshCw, Layers, Plus, Trash2, Sparkles, 
  Folder, FileText, MoreHorizontal, Edit2, Search, X, ChevronRight, GripVertical, Filter,
  PanelLeftClose, HelpCircle, FileQuestion, ImageIcon, ExternalLink, Facebook, Calendar, Link,
  Users, Key, ArrowUpDown, ChevronUp, ChevronDown, AlertTriangle, FileSpreadsheet, Code, Check
} from 'lucide-react';
import { parseCSV, exportToExcel } from './services/dataService';
import { generateInsights } from './services/geminiService';
import { fetchAdAccounts, fetchMetaAdsData } from './services/metaApiService';
import { AdRow, ColumnDef, Preset, Level, Project, StoredToken } from './types';
import { Button, Card, Badge, Input, Checkbox, cn, Dialog, ToastContainer, ToastMessage, Label, Select } from './components/LinearUI';
import { DateRangePicker } from './components/DateRangePicker';

// --- Constants ---
const APP_TITLE = "YANGYU 秧語廣告儀表板";

// Hardcoded Dev Token (Updated to Long-Lived Token)
const DEV_TOKEN = "EAAMzntvPNkYBQYkB4xZBjMJFdVgCW3YcAZASWIaZBgspy0oaVWFvwgR3WfsiWIeRNOSrTs8jK1NtQy6XAjpLdDt9FbzHcBdSdHDHngZB55crMqljI24dOmkUMK3cS5Tuzy9r5DuSAE9ZAjT7VG8ZCagFMS5ES7RyJnCdS51JkBzjYgZAynskLTZBOVrwTuH7hODoab4kW5P6FkWZANMYZA";

const AVAILABLE_COLUMNS: ColumnDef[] = [
  { id: 'campaignName', label: '行銷活動名稱', type: 'text', width: 200 },
  { id: 'imageUrl', label: '素材預覽', type: 'image', width: 80 },
  { id: 'name', label: '名稱', type: 'text', width: 250 }, 
  { id: 'status', label: '投遞狀態', type: 'text' },
  { id: 'budget', label: '預算', type: 'currency' },
  
  // Engagement
  { id: 'impressions', label: '曝光次數', type: 'number' },
  { id: 'reach', label: '觸及人數', type: 'number' },
  { id: 'clicks', label: '點擊次數 (全部)', type: 'number' }, 
  { id: 'ctr', label: 'CTR (全部)', type: 'percent' },
  { id: 'cpc', label: 'CPC (全部)', type: 'currency' },
  
  // Link Specific
  { id: 'linkClicks', label: '連結點擊', type: 'number' },
  { id: 'linkCtr', label: '連結 CTR', type: 'percent' },
  { id: 'linkCpc', label: '連結 CPC', type: 'currency' },
  { id: 'landingPageViews', label: '頁面瀏覽', type: 'number' }, // New
  
  // Video
  { id: 'videoViews', label: '影片觀看(3秒)', type: 'number' }, // New
  
  // Conversions & Costs
  { id: 'spend', label: '花費金額', type: 'currency' },
  { id: 'conversions', label: '成果', type: 'number' },
  { id: 'costPerResult', label: '每次成果成本', type: 'currency' },
  { id: 'cpm', label: 'CPM', type: 'currency' },
  { id: 'frequency', label: '頻率', type: 'number' },
  
  // Advanced Messaging & Engagement
  { id: 'costPerPageEngagement', label: '每次粉絲專頁互動成本', type: 'currency' },
  { id: 'newMessagingConnections', label: '新的訊息聯繫對象', type: 'number' },
  { id: 'costPerNewMessagingConnection', label: '每位新訊息聯繫對象成本', type: 'currency' },
  { id: 'messagingConversationsStarted', label: '訊息對話開始次數', type: 'number' },

  { id: 'websitePurchases', label: '網站購買', type: 'number' },
  { id: 'cpa', label: 'CPA', type: 'currency' },
  { id: 'conversionRate', label: '轉換率', type: 'percent' },
  { id: 'roas', label: 'ROAS', type: 'number' },
];

const DEMO_COLUMNS = [
    'campaignName', 'name', 
    'clicks', 'impressions', 'ctr', 'cpc', 
    'linkClicks', 'linkCtr', 'linkCpc', 
    'websitePurchases', 'cpa', 'conversionRate', 'spend'
];

const DEFAULT_PRESETS: Preset[] = [
  // 1. Campaign Level Report
  { 
    id: 'campaign_report', 
    name: '廣告活動報表', 
    columns: [
        'name', 
        'status', 'reach', 'clicks', 'impressions', 'ctr', 'cpc', 
        'linkClicks', 'linkCtr', 'linkCpc', 
        'conversions', 'costPerResult', 'cpa', 'conversionRate', 'spend' 
    ] 
  },
  // 2. Audience (AdSet) Level Report
  { 
    id: 'audience_report', 
    name: '受眾/組合報表', 
    columns: [
        'campaignName', 'name', 
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
        'campaignName', 'imageUrl', 'name',
        'clicks', 'impressions', 'ctr', 'cpc',
        'linkClicks', 'linkCtr', 'linkCpc',
        'websitePurchases', 'cpa', 'conversionRate', 'spend'
    ] 
  },
  // 4. Age Report
  {
      id: 'age_report',
      name: '年齡分佈報表',
      columns: DEMO_COLUMNS
  },
  // 5. Gender Report
  {
      id: 'gender_report',
      name: '性別分佈報表',
      columns: DEMO_COLUMNS
  },
  // 6. Yangyu Default (Updated)
  {
      id: 'yangyu_default',
      name: '秧語預設',
      columns: [
          'name', // 行銷活動 (Mapped to name for Campaign level)
          'status', // 投遞狀態
          'budget', // 預算
          'impressions', // 曝光次數
          'reach', // 觸及人數
          'clicks', // 點擊次數（全部）
          'ctr', // CTR（全部）
          'cpc', // CPC（全部）
          'linkClicks', // 連結點擊次數
          'linkCtr', // CTR（連結點閱率）
          'linkCpc', // CPC（單次連結點擊成本）
          'spend', // 花費金額
          'conversions', // 成果
          'costPerResult', // 每次成果成本
          'costPerPageEngagement', // 每次粉絲專頁互動成本
          'cpm', // CPM
          'frequency', // 頻率
          'newMessagingConnections', // 新的訊息聯繫對象
          'costPerNewMessagingConnection', // 每位新訊息聯繫對象成本
          'messagingConversationsStarted' // 訊息對話開始次數
      ]
  }
];

const OVERRIDE_OPTIONS = [
    { value: 'purchase', label: '網站購買 (Purchase)' },
    { value: 'on_facebook_lead', label: '潛在客戶 (Leads)' },
    { value: 'link_click', label: '連結點擊 (Link Clicks)' },
    { value: 'omni_landing_page_view', label: '頁面瀏覽 (Landing Page View)' },
    { value: 'video_thruplay_watched_actions', label: 'ThruPlay (Video)' },
    { value: 'onsite_conversion.messaging_conversation_started_7d', label: '開始訊息對話 (Messages)' },
    { value: 'post_engagement', label: '貼文互動 (Engagement)' },
];

const EXPORT_TYPES = [
    { id: 'campaign', label: '廣告活動', presetId: 'campaign_report', level: 'campaign' },
    { id: 'adset', label: '廣告受眾', presetId: 'audience_report', level: 'adset' },
    { id: 'creative', label: '素材表現', presetId: 'creative_report', level: 'ad' },
    { id: 'age', label: '年齡', presetId: 'age_report', level: 'age' },
    { id: 'gender', label: '性別', presetId: 'gender_report', level: 'gender' },
    { id: 'yangyu', label: '秧語預設', presetId: 'yangyu_default', level: 'yangyu' },
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
  
  // Tokens State
  const [storedTokens, setStoredTokens] = useState<StoredToken[]>(() => {
      const saved = localStorage.getItem('adflux_tokens');
      let tokens = saved ? JSON.parse(saved) : [];
      // Inject Dev Token if not present or different
      // Since token might change in code, we update it if it exists under the 'dev-auto-token' ID
      const devIndex = tokens.findIndex((t: StoredToken) => t.id === 'dev-auto-token');
      if (devIndex >= 0) {
          tokens[devIndex].token = DEV_TOKEN;
      } else {
          tokens = [{
              id: 'dev-auto-token',
              alias: '秧語 (Dev)',
              token: DEV_TOKEN,
              createdAt: Date.now()
          }, ...tokens];
      }
      return tokens;
  });

  // UI State
  const [loading, setLoading] = useState(false);
  // Added 'yangyu' as a valid tab state
  const [activeTab, setActiveTab] = useState<Level | 'all' | 'yangyu'>('campaign'); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  
  // Filter States
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delivered'>('all');

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [isTokenManagerOpen, setIsTokenManagerOpen] = useState(false);
  const [showExportHelp, setShowExportHelp] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  
  // Export Modal State
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedExportTypes, setSelectedExportTypes] = useState<string[]>(EXPORT_TYPES.map(t => t.id));

  // Debug Modal & Override
  const [selectedDebugRow, setSelectedDebugRow] = useState<AdRow | null>(null);
  const [overrideResultType, setOverrideResultType] = useState<string>("");
  
  // Meta API State
  const [metaToken, setMetaToken] = useState("");
  const [selectedTokenId, setSelectedTokenId] = useState("dev-auto-token"); // Set Default Token Here
  const [metaAccounts, setMetaAccounts] = useState<any[]>([]);
  const [selectedMetaAccount, setSelectedMetaAccount] = useState("");
  
  // Token Manager Inputs
  const [newTokenAlias, setNewTokenAlias] = useState("");
  const [newTokenValue, setNewTokenValue] = useState("");

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState(getLast30Days());
  const prevDateRangeRef = useRef(dateRange); // Track previous date range

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Column Management & Sorting
  const [activePresetId, setActivePresetId] = useState<string>('campaign_report');
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_PRESETS[0].columns);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('adflux_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('adflux_tokens', JSON.stringify(storedTokens));
  }, [storedTokens]);

  useEffect(() => {
    const storedPresets = localStorage.getItem('adflux_presets');
    if (storedPresets) {
      setCustomPresets(JSON.parse(storedPresets));
    }
  }, []);

  // Reset override state when row changes
  useEffect(() => {
    setOverrideResultType("");
  }, [selectedDebugRow]);

  // Auto-switch presets based on tabs & Reset Sort
  useEffect(() => {
      if (activeTab === 'campaign') applyPreset('campaign_report');
      if (activeTab === 'adset') applyPreset('audience_report');
      if (activeTab === 'ad' || activeTab === 'creative') applyPreset('creative_report');
      if (activeTab === 'age') applyPreset('age_report');
      if (activeTab === 'gender') applyPreset('gender_report');
      if (activeTab === 'yangyu') applyPreset('yangyu_default'); // Apply Yangyu Preset
      
      setSortConfig(null); // Reset sort when changing tabs
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

  // Derived State
  const activeProject = useMemo(() => 
    projects.find(p => p.id === activeProjectId), 
    [projects, activeProjectId]
  );

  // --- Auto Sync Logic ---
  useEffect(() => {
      const isDateChanged = 
          prevDateRangeRef.current.start !== dateRange.start || 
          prevDateRangeRef.current.end !== dateRange.end;
      
      if (isDateChanged && activeProject?.metaConfig) {
          handleSyncMeta(true);
      }
      prevDateRangeRef.current = dateRange;
  }, [dateRange, activeProject?.id]); 

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

  // --- Manual Override Handler ---
  const applyOverride = () => {
      if (!selectedDebugRow || !activeProject || !overrideResultType) return;
      
      const targetType = overrideResultType;
      
      const newProjects = projects.map(p => {
          if (p.id !== activeProject.id) return p;
          
          const newData = p.data.map(row => {
              if (row.id === selectedDebugRow.id) {
                  // 1. Find new conversion value
                  let newVal = 0;
                  // Try to find in rawActions
                  if (row.rawActions && Array.isArray(row.rawActions)) {
                      const action = row.rawActions.find((a: any) => a.action_type === targetType);
                      if (action) newVal = parseFloat(action.value);
                  } 
                  // If 0, try to check known columns (fallback for CSV imported data which might lack rawActions)
                  if (newVal === 0) {
                      if (targetType === 'link_click') newVal = row.linkClicks;
                      else if (targetType === 'purchase') newVal = row.websitePurchases;
                      else if (targetType === 'omni_landing_page_view') newVal = row.landingPageViews;
                      else if (targetType === 'video_thruplay_watched_actions') newVal = row.videoViews; // approx
                  }

                  // 2. Calculate New Cost Per Result
                  // Logic: Try to use API provided cost_per_action_type if available (more accurate), else fallback to spend/val
                  let newCost = 0;
                  const cpaList = row.costPerActionType as any[]; // Need to cast since we added this field
                  if (cpaList && Array.isArray(cpaList)) {
                      const cpaObj = cpaList.find((c: any) => c.action_type === targetType);
                      if (cpaObj) newCost = parseFloat(cpaObj.value);
                  }
                  
                  if (newCost === 0 && newVal > 0) {
                      newCost = row.spend / newVal;
                  }

                  // 3. Find label
                  const labelOpt = OVERRIDE_OPTIONS.find(o => o.value === targetType);
                  const newLabel = labelOpt ? labelOpt.label.split(' (')[0] : targetType;

                  // 4. Update row
                  const updatedRow = { 
                      ...row, 
                      conversions: newVal, 
                      resultType: newLabel, 
                      costPerResult: newCost,
                      optimizationGoal: `MANUAL_${targetType.toUpperCase()}` // Mark as manually overridden
                  };
                  
                  // Update current selected row reference to reflect changes immediately in dialog
                  setSelectedDebugRow(updatedRow);
                  
                  return updatedRow;
              }
              return row;
          });
          
          return { ...p, data: newData, updatedAt: Date.now() };
      });
      
      setProjects(newProjects);
      addToast("成果類型已更新", "success");
  };

  // Helper to Aggregate Data (Reusable for Export)
  const getAggregatedData = (rows: AdRow[], level: 'age' | 'gender') => {
    const relevantRows = rows.filter(r => r.level === level);
    const groups: Record<string, any> = {};

    relevantRows.forEach(row => {
        const key = row.name; 
        if (!groups[key]) {
            groups[key] = { 
                name: key,
                impressions: 0, clicks: 0, spend: 0, linkClicks: 0, websitePurchases: 0, conversions: 0, conversionValue: 0 
            };
        }
        groups[key].impressions += row.impressions;
        groups[key].clicks += row.clicks;
        groups[key].spend += row.spend;
        groups[key].linkClicks += row.linkClicks;
        groups[key].websitePurchases += row.websitePurchases;
        groups[key].conversions += row.conversions;
        groups[key].conversionValue += row.conversionValue;
    });

    const calcRates = (r: any) => ({
        ...r,
        ctr: r.impressions ? (r.clicks / r.impressions) * 100 : 0,
        cpc: r.clicks ? r.spend / r.clicks : 0,
        linkCtr: r.impressions ? (r.linkClicks / r.impressions) * 100 : 0,
        linkCpc: r.linkClicks ? r.spend / r.linkClicks : 0,
        cpa: (r.conversions || r.websitePurchases) ? r.spend / (r.conversions || r.websitePurchases) : 0,
        conversionRate: r.linkClicks ? ((r.conversions || r.websitePurchases) / r.linkClicks) * 100 : 0, // Updated CVR
    });

    let result = Object.values(groups).map(calcRates);
    result.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return result;
  };

  // Aggregated Demographics Data (For UI)
  const demographicData = useMemo(() => {
    if (!activeProject) return null;
    if (activeTab !== 'age' && activeTab !== 'gender') return null;

    const result = getAggregatedData(activeProject.data, activeTab);

    // Calculate Total Row
    const total = result.reduce((acc, curr) => ({
        impressions: acc.impressions + curr.impressions,
        clicks: acc.clicks + curr.clicks,
        spend: acc.spend + curr.spend,
        linkClicks: acc.linkClicks + curr.linkClicks,
        websitePurchases: acc.websitePurchases + curr.websitePurchases,
        conversions: acc.conversions + curr.conversions,
    }), { impressions: 0, clicks: 0, spend: 0, linkClicks: 0, websitePurchases: 0, conversions: 0 });

    const calcRates = (r: any) => ({
        ...r,
        ctr: r.impressions ? (r.clicks / r.impressions) * 100 : 0,
        cpc: r.clicks ? r.spend / r.clicks : 0,
        linkCtr: r.impressions ? (r.linkClicks / r.impressions) * 100 : 0,
        linkCpc: r.linkClicks ? r.spend / r.linkClicks : 0,
        cpa: (r.conversions || r.websitePurchases) ? r.spend / (r.conversions || r.websitePurchases) : 0,
        conversionRate: r.linkClicks ? ((r.conversions || r.websitePurchases) / r.linkClicks) * 100 : 0, // Updated CVR
    });

    const totalRow = {
        id: 'total',
        name: '總計',
        ...total,
        ...calcRates(total) // calc rates for total
    };

    return { rows: result, total: totalRow };
  }, [activeProject, activeTab]);

  const filteredData = useMemo(() => {
    if (!activeProject) return [];
    
    // If showing demographics aggregated, skip this standard filtering
    if (activeTab === 'age' || activeTab === 'gender') return [];

    let data = [...activeProject.data];

    // 1. Tab Filter
    if (activeTab !== 'all') {
        if (activeTab === 'creative') {
             data = data.filter(row => row.level === 'ad' || row.level === 'creative');
        } else if (activeTab === 'yangyu') {
             // Yangyu Default preset usually implies Campaign Level view
             data = data.filter(row => row.level === 'campaign');
        } else {
             data = data.filter(row => row.level === activeTab);
        }
    }

    // 2. Status Filter
    if (statusFilter === 'active') {
        data = data.filter(row => {
            const s = row.status.toLowerCase();
            return s === 'active' || s === 'enabled' || s === 'in_process' || s === 'with_issues' || s === '進行中' || s === '審查中' || s === '預審通過';
        });
    } else if (statusFilter === 'delivered') {
        data = data.filter(row => row.impressions > 0);
    }

    // 3. Search Query Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      data = data.filter(row => 
        row.name.toLowerCase().includes(query) || 
        row.status.toLowerCase().includes(query) ||
        row.campaignName?.toLowerCase().includes(query) ||
        row.adGroupName?.toLowerCase().includes(query)
      );
    }

    // 4. Sorting
    if (sortConfig) {
        data.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            
            if (aVal === bVal) return 0;
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    } else {
        // Default: Sort by Campaign Name for merging logic
        data.sort((a, b) => {
            const cA = a.campaignName || a.name || '';
            const cB = b.campaignName || b.name || '';
            return cA.localeCompare(cB);
        });
    }

    return data;
  }, [activeProject, activeTab, searchQuery, sortConfig, statusFilter]);

  // NEW: Calculate Totals based on filtered data
  const tableTotals = useMemo(() => {
    if (filteredData.length === 0) return null;
    
    const sums = filteredData.reduce((acc, row) => ({
        impressions: acc.impressions + row.impressions,
        clicks: acc.clicks + row.clicks,
        spend: acc.spend + row.spend,
        reach: acc.reach + row.reach,
        linkClicks: acc.linkClicks + row.linkClicks,
        websitePurchases: acc.websitePurchases + row.websitePurchases,
        videoViews: acc.videoViews + row.videoViews,
        landingPageViews: acc.landingPageViews + row.landingPageViews,
        conversionValue: acc.conversionValue + row.conversionValue,
        newMessagingConnections: acc.newMessagingConnections + row.newMessagingConnections,
        messagingConversationsStarted: acc.messagingConversationsStarted + row.messagingConversationsStarted,
    }), {
        impressions: 0, clicks: 0, spend: 0, reach: 0, linkClicks: 0, 
        websitePurchases: 0, videoViews: 0, landingPageViews: 0, 
        conversionValue: 0, newMessagingConnections: 0, messagingConversationsStarted: 0
    });

    return {
        id: 'totals',
        ...sums,
        ctr: sums.impressions ? (sums.clicks / sums.impressions) * 100 : 0,
        cpc: sums.clicks ? sums.spend / sums.clicks : 0,
        linkCtr: sums.impressions ? (sums.linkClicks / sums.impressions) * 100 : 0,
        linkCpc: sums.linkClicks ? sums.spend / sums.linkClicks : 0,
        cpm: sums.impressions ? (sums.spend / sums.impressions) * 1000 : 0,
        frequency: sums.reach ? sums.impressions / sums.reach : 0,
        roas: sums.spend ? sums.conversionValue / sums.spend : 0,
        costPerNewMessagingConnection: sums.newMessagingConnections ? sums.spend / sums.newMessagingConnections : 0,
        // Metrics to exclude (show '-') as per user request
        conversions: -1, 
        costPerResult: -1,
        cpa: -1,
        conversionRate: -1,
        costPerPageEngagement: -1,
    };
  }, [filteredData]);

  // Ensure sticky columns are always on the left in the visibleColumns array
  const sortedVisibleColumns = useMemo(() => {
      return visibleColumns.slice().sort((a, b) => {
          const ia = AVAILABLE_COLUMNS.findIndex(c => c.id === a);
          const ib = AVAILABLE_COLUMNS.findIndex(c => c.id === b);
          // If both are found, sort by their index in AVAILABLE_COLUMNS
          if (ia !== -1 && ib !== -1) return ia - ib;
          // If one is missing (shouldn't happen), push to end
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return 0;
      });
  }, [visibleColumns]);

  // Sorting Handler
  const requestSort = (key: string) => {
      let direction: 'asc' | 'desc' = 'desc'; // Default to desc (good for numbers)
      if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
          direction = 'asc';
      }
      setSortConfig({ key, direction });
  };

  // Actions
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

  // Initiate delete process
  const initiateDeleteProject = (id: string) => {
      setProjectToDelete(id);
  };

  // Confirm delete
  const confirmDeleteProject = () => {
    if (projectToDelete) {
      setProjects(prev => prev.filter(p => p.id !== projectToDelete));
      if (activeProjectId === projectToDelete) setActiveProjectId(null);
      addToast("專案已刪除", "success");
      setProjectToDelete(null);
    }
  };

  const handleUpload = async (files: File[]) => {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      const results = await Promise.all(files.map(f => parseCSV(f)));
      const newRows = results.map(r => r.rows).flat();
      const detectedCurrency = results.length > 0 ? results[0].currency : 'USD';

      if (newRows.length === 0) {
        addToast("未偵測到有效資料，請確認檔案格式", 'error');
        return;
      }
      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return { 
             ...p, 
             data: [...p.data, ...newRows], 
             currency: detectedCurrency, // Save currency from CSV
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

  // --- Token Management ---
  const saveToken = () => {
      if (!newTokenAlias || !newTokenValue) return addToast("請輸入名稱與 Token", "error");
      const newToken: StoredToken = {
          id: crypto.randomUUID(),
          alias: newTokenAlias,
          token: newTokenValue,
          createdAt: Date.now()
      };
      setStoredTokens(prev => [...prev, newToken]);
      setNewTokenAlias("");
      setNewTokenValue("");
      addToast("Token 已儲存", "success");
  };

  const deleteToken = (id: string) => {
      setStoredTokens(prev => prev.filter(t => t.id !== id));
      if (selectedTokenId === id) setSelectedTokenId("");
  };

  // --- Meta API ---
  const handleFetchAccounts = async () => {
    let tokenToUse = metaToken;
    if (selectedTokenId) {
        const stored = storedTokens.find(t => t.id === selectedTokenId);
        if (stored) tokenToUse = stored.token;
    }

    if (!tokenToUse) return addToast("請輸入或選擇 Access Token", 'error');
    
    setLoading(true);
    try {
        const accounts = await fetchAdAccounts(tokenToUse);
        setMetaAccounts(accounts);
        if (accounts.length > 0) setSelectedMetaAccount(accounts[0].account_id);
    } catch (e: any) {
        const errorMsg = e.message || "";
        if (errorMsg.includes("Session has expired") || errorMsg.includes("Error validating access token")) {
            addToast("您的 Access Token 已過期或失效。請使用長效 Token 或重新取得。", 'error');
        } else {
            addToast(`取得帳號失敗: ${errorMsg}`, 'error');
        }
    } finally {
        setLoading(false);
    }
  };

  const handleConnectMeta = async () => {
      if (!selectedMetaAccount) return;
      
      let tokenToUse = metaToken;
      if (selectedTokenId) {
          const stored = storedTokens.find(t => t.id === selectedTokenId);
          if (stored) tokenToUse = stored.token;
      }

      const account = metaAccounts.find(a => a.account_id === selectedMetaAccount);
      if (!account || !tokenToUse) return;

      setLoading(true);
      try {
          const rows = await fetchMetaAdsData(
              tokenToUse, 
              selectedMetaAccount, 
              dateRange.start, 
              dateRange.end, 
              account.currency || 'USD'
          );
          const newProject: Project = {
              id: crypto.randomUUID(),
              name: `Meta: ${account.name}`,
              data: rows,
              currency: account.currency || 'USD',
              metaConfig: { 
                  accountId: account.account_id, 
                  accountName: account.name, 
                  token: tokenToUse,
                  currency: account.currency || 'USD'
              },
              createdAt: Date.now(),
              updatedAt: Date.now()
          };
          setProjects(prev => [newProject, ...prev]);
          setActiveProjectId(newProject.id);
          setIsMetaModalOpen(false);
          addToast("成功連結 Meta 帳號並同步數據", 'success');
      } catch (e: any) {
          const errorMsg = e.message || "";
          if (errorMsg.includes("Session has expired")) {
              addToast("Access Token 已過期。請在 Token 管理更新您的金鑰。", 'error');
          } else {
              addToast(`同步失敗: ${errorMsg}`, 'error');
          }
      } finally {
          setLoading(false);
      }
  };

  const handleSyncMeta = async (force: boolean = false) => {
      if (!activeProject?.metaConfig) return;

      if (!force) {
          const timeSinceUpdate = Date.now() - activeProject.updatedAt;
          const fiveMinutes = 5 * 60 * 1000;
          if (timeSinceUpdate < fiveMinutes) {
             const confirmSync = window.confirm("距離上次同步不到 5 分鐘。頻繁同步可能導致 API 限制。確定要強制同步嗎？");
             if (!confirmSync) return;
          }
      }

      setLoading(true);
      try {
          const rows = await fetchMetaAdsData(
              activeProject.metaConfig.token, 
              activeProject.metaConfig.accountId, 
              dateRange.start, 
              dateRange.end,
              activeProject.metaConfig.currency || 'USD'
          );
          setProjects(prev => prev.map(p => {
             if (p.id === activeProject.id) return { ...p, data: [...rows], updatedAt: Date.now() };
             return p;
          }));
          addToast("數據已更新至最新", 'success');
      } catch (e: any) {
          const errorMsg = e.message || "";
          if (errorMsg.includes("Access Token")) {
              addToast("同步失敗：您的 Token 已過期，請更新 Token。", 'error');
          } else {
              addToast(`更新失敗: ${errorMsg}`, 'error');
          }
      } finally {
          setLoading(false);
      }
  };

  const handleExportClick = () => {
    if (!activeProject) return;
    setIsExportDialogOpen(true);
  };

  const executeExport = () => {
    if (!activeProject || selectedExportTypes.length === 0) return;
    
    addToast("正在準備 Excel 報表...", 'info');
    
    const sheets = selectedExportTypes.map(typeId => {
        const typeConfig = EXPORT_TYPES.find(t => t.id === typeId);
        if (!typeConfig) return null;

        // 1. Data Selection
        let dataToExport: any[] = [];
        
        if (typeId === 'age' || typeId === 'gender') {
            // Use aggregation logic
            dataToExport = getAggregatedData(activeProject.data, typeId as any);
        } else if (typeId === 'yangyu') {
            // Yangyu Default: usually campaign level
            dataToExport = activeProject.data.filter(r => r.level === 'campaign');
        } else if (typeId === 'creative') {
             dataToExport = activeProject.data.filter(r => r.level === 'ad' || r.level === 'creative');
        } else {
             dataToExport = activeProject.data.filter(r => r.level === typeConfig.level);
        }

        // 2. Column Selection
        let columnsToExport: string[] = [];
        let columnDefs = AVAILABLE_COLUMNS; // Default

        if (typeId === 'age' || typeId === 'gender') {
            columnsToExport = ['name', ...DEMO_TABLE_COLS.map(c => c.id)];
            columnDefs = [
                { id: 'name', label: typeId === 'age' ? '年齡' : '性別', type: 'text' },
                ...DEMO_TABLE_COLS
            ] as ColumnDef[];
        } else {
            // Find preset
            const preset = DEFAULT_PRESETS.find(p => p.id === typeConfig.presetId);
            columnsToExport = preset ? preset.columns : AVAILABLE_COLUMNS.map(c => c.id);
        }

        return {
            name: typeConfig.label,
            data: dataToExport,
            columns: columnsToExport,
            columnDefs: columnDefs
        };
    }).filter(s => s !== null) as any[];

    // 3. 執行匯出
    exportToExcel({
        filename: `${activeProject.name}_廣告報表`,
        sheets: sheets
    });

    addToast("下載已開始", 'success');
    setIsExportDialogOpen(false);
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

  // Helper: Use Project Currency if available, default to USD
  const formatVal = (val: any, type: ColumnDef['type'], currencyCode: string = 'USD') => {
    if (type === 'currency') return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: currencyCode }).format(val);
    if (type === 'percent') return `${val.toFixed(2)}%`;
    if (type === 'number') return val.toLocaleString();
    return val;
  };

  const getTabLabel = (tab: string) => {
    switch (tab) {
        case 'all': return '總覽';
        case 'campaign': return '廣告活動';
        case 'adset': return '廣告受眾';
        case 'ad': return '廣告';
        case 'creative': return '素材表現';
        case 'gender': return '性別';
        case 'age': return '年齡';
        case 'yangyu': return '秧語預設'; // Label for new tab
        case 'demographics': return '客層表現';
        default: return tab;
    }
  };

  // Helper function to calculate sticky offsets dynamically
  // FIX: Added background color and box-shadow to prevent gaps/transparency issues
  const getStickyStyle = (colId: string, isHeader: boolean = false) => {
      const stickyCols = ['campaignName', 'imageUrl', 'name'];
      if (!stickyCols.includes(colId)) return {};

      let left = 0;
      // Fixed widths based on AVAILABLE_COLUMNS definition in App.tsx
      // campaignName: 200, imageUrl: 80, name: 250
      
      // Calculate Left Offset based on the ORDER in sortedVisibleColumns
      // We assume visibleColumns are sorted such that sticky ones are first.
      
      if (colId === 'campaignName') {
          left = 0;
      } else if (colId === 'imageUrl') {
          if (visibleColumns.includes('campaignName')) left += 200;
      } else if (colId === 'name') {
          if (visibleColumns.includes('campaignName')) left += 200;
          if (visibleColumns.includes('imageUrl')) left += 80;
      }
      
      const isLastSticky = 
        (colId === 'name') || 
        (colId === 'imageUrl' && !visibleColumns.includes('name')) ||
        (colId === 'campaignName' && !visibleColumns.includes('imageUrl') && !visibleColumns.includes('name'));

      return {
          position: 'sticky',
          left: `${left}px`,
          zIndex: isHeader ? 30 : 20,
          // Using box-shadow to simulate border avoids sub-pixel rendering gaps
          boxShadow: isLastSticky ? '2px 0 5px -2px rgba(0,0,0,0.5)' : 'none',
          // Explicitly set background color to cover content behind
          backgroundColor: isHeader ? '#18181b' : '#09090b', // zinc-900 for header, zinc-950 for body
      } as React.CSSProperties;
  };

  // Specific column config for Demographics table
  const DEMO_TABLE_COLS: {id: string, label: string, type: ColumnDef['type']}[] = [
      { id: 'clicks', label: '點擊次數', type: 'number' },
      { id: 'impressions', label: '曝光次數', type: 'number' },
      { id: 'ctr', label: 'CTR', type: 'percent' },
      { id: 'cpc', label: 'CPC', type: 'currency' },
      { id: 'linkClicks', label: '連結點擊', type: 'number' },
      { id: 'linkCtr', label: '連結CTR', type: 'percent' },
      { id: 'linkCpc', label: '連結CPC', type: 'currency' },
      { id: 'websitePurchases', label: '網站購買', type: 'number' },
      { id: 'cpa', label: 'CPA', type: 'currency' },
      { id: 'conversionRate', label: '轉換率', type: 'percent' },
      { id: 'spend', label: '花費金額', type: 'currency' },
  ];

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-300 font-sans overflow-hidden selection:bg-indigo-500/30">
      
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {/* ... (Existing Dialogs) ... */}
      <Dialog isOpen={!!previewImage} onClose={() => setPreviewImage(null)} title="素材預覽">
         <div className="flex items-center justify-center bg-zinc-950/50 rounded-lg p-2 overflow-hidden">
             {previewImage && <img src={previewImage} alt="Preview" className="max-w-full max-h-[80vh] object-contain rounded-md" />}
         </div>
      </Dialog>
      
      {/* Export Dialog */}
      <Dialog isOpen={isExportDialogOpen} onClose={() => setIsExportDialogOpen(false)} title="下載報表設定">
          <div className="space-y-4">
              <p className="text-sm text-zinc-400">請選擇您想要匯出的報表類型（可多選）：</p>
              <div className="grid grid-cols-2 gap-3">
                  {EXPORT_TYPES.map(type => (
                      <label key={type.id} className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 cursor-pointer transition-colors">
                          <Checkbox 
                            checked={selectedExportTypes.includes(type.id)}
                            onChange={(e) => {
                                if(e.target.checked) setSelectedExportTypes([...selectedExportTypes, type.id]);
                                else setSelectedExportTypes(selectedExportTypes.filter(id => id !== type.id));
                            }}
                          />
                          <span className="text-sm text-zinc-200">{type.label}</span>
                      </label>
                  ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setIsExportDialogOpen(false)}>取消</Button>
                  <Button onClick={executeExport} disabled={selectedExportTypes.length === 0} className="bg-[#1877F2] hover:bg-[#166fe5] text-white">
                      確認下載
                  </Button>
              </div>
          </div>
      </Dialog>

      {/* DEBUG DATA DIALOG */}
      <Dialog isOpen={!!selectedDebugRow} onClose={() => setSelectedDebugRow(null)} title="API 原始數據檢查">
         <div className="space-y-4 max-h-[70vh] overflow-y-auto">
             <div className="grid grid-cols-2 gap-4">
                 <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-md">
                    <h4 className="text-xs font-semibold text-zinc-500 mb-1">行銷活動目標 (Objective)</h4>
                    <div className="text-sm text-zinc-200 font-mono">{selectedDebugRow?.objective || 'N/A'}</div>
                 </div>
                 <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-md">
                    <h4 className="text-xs font-semibold text-zinc-500 mb-1">優化目標 (Optimization Goal)</h4>
                    <div className="text-sm text-zinc-200 font-mono">{selectedDebugRow?.optimizationGoal || 'N/A'}</div>
                 </div>
             </div>
             
             {/* MANUAL OVERRIDE SECTION */}
             <div className="bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-lg">
                 <h4 className="text-sm font-medium text-zinc-200 mb-3 flex items-center gap-2">
                     <Edit2 size={14} className="text-indigo-400"/> 
                     手動替換成果類型 (Override Result)
                 </h4>
                 <div className="flex gap-2">
                     <Select 
                        value={overrideResultType} 
                        onChange={e => setOverrideResultType(e.target.value)}
                        className="flex-1"
                     >
                        <option value="">選擇要替換的指標...</option>
                        {OVERRIDE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                     </Select>
                     <Button onClick={applyOverride} disabled={!overrideResultType}>
                        套用變更
                     </Button>
                 </div>
                 <p className="text-[10px] text-zinc-500 mt-2">
                    注意：此操作會強制將該列的「成果」與「每次成果成本」改為您選擇的指標。
                 </p>
             </div>

             <div>
                 <h4 className="text-xs font-semibold text-zinc-500 mb-2">Actions (所有操作/成果)</h4>
                 {selectedDebugRow?.rawActions && selectedDebugRow.rawActions.length > 0 ? (
                     <pre className="bg-zinc-950 p-3 rounded-md border border-zinc-800 text-[10px] text-zinc-300 font-mono overflow-auto max-h-[400px] whitespace-pre-wrap">
                         {JSON.stringify(selectedDebugRow.rawActions, null, 2)}
                     </pre>
                 ) : (
                     <div className="text-sm text-zinc-500 italic">無 Action 資料</div>
                 )}
             </div>
         </div>
      </Dialog>

      <Dialog isOpen={!!projectToDelete} onClose={() => setProjectToDelete(null)} title="確認刪除專案">
          <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-red-950/30 border border-red-900/50 rounded-md text-red-300">
                  <AlertTriangle size={20} className="shrink-0" />
                  <p className="text-sm">確定要刪除此專案嗎？此動作無法復原，所有數據將會遺失。</p>
              </div>
              <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setProjectToDelete(null)}>取消</Button>
                  <Button variant="danger" onClick={confirmDeleteProject}>確認刪除</Button>
              </div>
          </div>
      </Dialog>

      <Dialog isOpen={isUploadModalOpen} onClose={() => { setIsUploadModalOpen(false); setShowExportHelp(false); }} title="匯入廣告報表 (CSV)">
          {/* ... Upload Content ... */}
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
                     {/* ... Help Text ... */}
                     <p className="text-xs text-zinc-400">請確保 CSV 包含正確的 Header 欄位。</p>
                </div>
            )}
        </div>
      </Dialog>

      {/* Token Manager Modal */}
      <Dialog isOpen={isTokenManagerOpen} onClose={() => setIsTokenManagerOpen(false)} title="存取權杖 (Token) 管理">
          <div className="space-y-6">
              <div className="space-y-3 p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">新增 Token</h4>
                  <div className="space-y-2">
                      <Input placeholder="名稱 (例如: 個人帳號, 公司帳號)" value={newTokenAlias} onChange={e => setNewTokenAlias(e.target.value)} />
                      <Input type="password" placeholder="EAA..." value={newTokenValue} onChange={e => setNewTokenValue(e.target.value)} className="font-mono text-xs"/>
                      <Button onClick={saveToken} disabled={!newTokenAlias || !newTokenValue} className="w-full">儲存</Button>
                  </div>
              </div>
              <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">已儲存的 Token</h4>
                  {storedTokens.length === 0 && <p className="text-xs text-zinc-600 italic">尚無儲存的 Token</p>}
                  {storedTokens.map(token => (
                      <div key={token.id} className="flex items-center justify-between p-3 rounded-md bg-zinc-900 border border-zinc-800">
                          <div>
                              <div className="text-sm font-medium text-zinc-200">{token.alias}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">...{token.token.slice(-8)}</div>
                          </div>
                          <button onClick={() => deleteToken(token.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                      </div>
                  ))}
              </div>
          </div>
      </Dialog>

      {/* Connect Meta Modal */}
      <Dialog isOpen={isMetaModalOpen} onClose={() => setIsMetaModalOpen(false)} title="連結 Meta 廣告帳號">
         <div className="space-y-6">
             <div className="space-y-3">
                 <div className="flex justify-between items-center">
                    <Label>1. 選擇或輸入 Access Token</Label>
                    <button onClick={() => setIsTokenManagerOpen(true)} className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Settings size={10}/> 管理 Token</button>
                 </div>
                 
                 {storedTokens.length > 0 && (
                     <Select value={selectedTokenId} onChange={(e) => { setSelectedTokenId(e.target.value); setMetaToken(""); }} className="mb-2">
                         <option value="">-- 直接輸入 Token --</option>
                         {storedTokens.map(t => <option key={t.id} value={t.id}>{t.alias}</option>)}
                     </Select>
                 )}

                 {!selectedTokenId && (
                    <Input type="password" placeholder="EAA..." value={metaToken} onChange={(e) => setMetaToken(e.target.value)} className="font-mono text-xs" />
                 )}
                 
                 <Button onClick={handleFetchAccounts} disabled={loading} className="w-full mt-2">
                    {loading ? <RefreshCw className="animate-spin" size={14}/> : "取得帳號列表"}
                 </Button>
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

      {/* Sidebar */}
      <aside 
        style={{ width: isSidebarOpen ? sidebarWidth : 0 }}
        className={cn("flex-shrink-0 border-r border-zinc-800 bg-[#09090b] flex flex-col transition-all duration-300 ease-in-out relative group/sidebar", !isSidebarOpen && "w-0 border-r-0 overflow-hidden")}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800 gap-2 overflow-hidden whitespace-nowrap">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-indigo-500/20 rounded flex items-center justify-center border border-indigo-500/30 flex-shrink-0">
                <Layers className="text-indigo-400" size={14} />
            </div>
            <span className="font-semibold text-zinc-100 tracking-tight text-sm">{APP_TITLE}</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"><PanelLeftClose size={16} /></button>
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
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">專案列表</span>
          </div>
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
                <button onClick={(e) => { e.stopPropagation(); initiateDeleteProject(project.id); }} className="p-1 hover:text-red-400"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-zinc-800 flex flex-col gap-2">
             <Button variant="ghost" onClick={() => setIsTokenManagerOpen(true)} className="w-full justify-start text-xs h-8 gap-2 text-zinc-500">
                <Key size={14} /><span>Token 管理</span>
             </Button>
             <div className="flex items-center justify-between text-xs text-zinc-600 px-1 pt-2 border-t border-zinc-800/50">
                 <div className="flex gap-2"><span>v1.9.1</span><span>Pro</span></div>
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
                      <Button onClick={handleExportClick} variant="primary" className="h-8 text-xs gap-2"><Download size={14} /> 下載報表</Button>
                    </>
                  )}
               </div>
            </header>

            <main className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeProject.data.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center pb-20">
                   {/* Empty State */}
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
                  {/* ... (Analysis Result & Dialogs) ... */}
                  {analysisResult && (
                    <Card className="p-5 border-indigo-500/20 bg-indigo-900/10 animate-in fade-in slide-in-from-top-2">
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
                  {/* ... (Existing Toolbar) ... */}
                  {/* UPDATED Z-INDEX TO 50 to sit above table headers */}
                  <div className="sticky top-0 bg-[#09090b] py-2 z-50 border-b border-zinc-800/0">
                    <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
                        
                        {/* Tabs - Scrollable Area */}
                        <div className="w-full xl:w-auto overflow-x-auto no-scrollbar pb-1 xl:pb-0">
                            <div className="flex p-1 bg-zinc-900 rounded-lg border border-zinc-800 shrink-0">
                              {(['campaign', 'adset', 'creative', 'age', 'gender', 'yangyu'] as const).map((tab) => (
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
                        </div>

                        {/* Controls - Fixed Area (No Overflow) */}
                        <div className="flex items-center gap-3 flex-wrap w-full xl:w-auto">
                            {/* Status Filter */}
                            <div className="relative group shrink-0">
                                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2 h-9">
                                    <Filter size={14} className="text-zinc-500" />
                                    <select 
                                        className="bg-transparent text-xs text-zinc-300 focus:outline-none appearance-none pr-4 cursor-pointer"
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value as any)}
                                    >
                                        <option value="all">所有廣告</option>
                                        <option value="active">刊登中的廣告</option>
                                        <option value="delivered">已投遞 (有曝光)</option>
                                    </select>
                                </div>
                            </div>

                             {/* Search */}
                            <div className="relative group shrink-0 w-48">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" size={14} />
                                <input type="text" placeholder="搜尋名稱..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-all" />
                                 {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"><X size={12} /></button>}
                            </div>

                            {/* Meta Controls */}
                            {activeProject.metaConfig ? (
                                 <div className="flex items-center gap-2 shrink-0 relative z-30">
                                    <DateRangePicker value={dateRange} onChange={setDateRange} />
                                    <button onClick={() => handleSyncMeta(false)} disabled={loading} className="h-9 px-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-lg text-xs text-[#1877F2] hover:text-white font-medium flex items-center gap-1 disabled:opacity-50 transition-colors">
                                        {loading ? <RefreshCw size={14} className="animate-spin"/> : <RefreshCw size={14}/>} 同步
                                    </button>
                                 </div>
                            ) : (
                                <div className="h-8 shrink-0"><button onClick={() => setIsUploadModalOpen(true)} className="h-full px-3 flex items-center gap-2 bg-zinc-900 border border-dashed border-zinc-700 hover:border-zinc-500 rounded-md cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 transition-colors"><Plus size={14} /><span>新增檔案</span></button></div>
                            )}
                            
                            {(activeTab !== 'age' && activeTab !== 'gender') && (
                                <button 
                                onClick={() => setIsColumnModalOpen(!isColumnModalOpen)} 
                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
                                title="欄位設定"
                                >
                                <Settings size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                  </div>

                  {/* Column Config (Existing) */}
                  {isColumnModalOpen && activeTab !== 'age' && activeTab !== 'gender' && (
                    <Card className="p-4 animate-in fade-in slide-in-from-top-2 duration-200 mb-4">
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

                  {/* Table Area */}
                  <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/30">
                    <div className="overflow-x-auto">
                      {demographicData ? (
                        // --- AGGREGATED DEMOGRAPHICS TABLE ---
                        <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                            <thead>
                                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                                    <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider">{activeTab === 'age' ? '年齡' : '性別'}</th>
                                    {DEMO_TABLE_COLS.map(col => (
                                        <th key={col.id} className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider text-right">{col.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                                {/* Total Row */}
                                <tr className="bg-amber-900/30 text-amber-100 font-semibold border-b border-zinc-800">
                                    <td className="px-4 py-3">{demographicData.total.name}</td>
                                    {DEMO_TABLE_COLS.map(col => (
                                        <td key={col.id} className="px-4 py-3 tabular-nums text-right">
                                            {formatVal(demographicData.total[col.id], col.type, activeProject.currency)}
                                        </td>
                                    ))}
                                </tr>
                                {/* Data Rows */}
                                {demographicData.rows.map(row => (
                                    <tr key={row.name} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="px-4 py-2.5 font-medium text-zinc-300">{row.name}</td>
                                        {DEMO_TABLE_COLS.map(col => (
                                            <td key={col.id} className={cn("px-4 py-2.5 text-zinc-400 tabular-nums text-right", col.type === 'currency' && "text-zinc-300")}>
                                                {formatVal(row[col.id], col.type, activeProject.currency)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                      ) : (
                        // --- STANDARD TABLE ---
                        <table className="w-full text-left text-sm whitespace-nowrap border-collapse relative">
                            <thead>
                            <tr className="border-b border-zinc-800 bg-zinc-900/80">
                                {sortedVisibleColumns.map(colId => {
                                const def = AVAILABLE_COLUMNS.find(c => c.id === colId);
                                const isSorted = sortConfig?.key === colId;
                                const stickyStyle = getStickyStyle(colId, true);
                                // Determine alignment class
                                const alignClass = (def?.type === 'number' || def?.type === 'currency' || def?.type === 'percent') ? 'text-right' : 'text-left';
                                
                                return (
                                    <th 
                                        key={colId} 
                                        onClick={() => requestSort(colId)}
                                        style={stickyStyle}
                                        className={cn(
                                          "px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wider cursor-pointer hover:text-zinc-300 transition-colors select-none group",
                                          alignClass,
                                          stickyStyle.position === 'sticky' ? "border-r-0" : ""
                                        )}
                                    >
                                    <div className={cn("flex items-center gap-1", alignClass === 'text-right' && "justify-end")}>
                                        {def?.label}
                                        <span className="text-zinc-600 group-hover:text-zinc-500">
                                            {isSorted ? (
                                                sortConfig.direction === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>
                                            ) : (
                                                <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </span>
                                    </div>
                                    </th>
                                );
                                })}
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                            {filteredData.slice(0, 200).map((row, index) => {
                                // --- MERGE LOGIC ---
                                // Allow grouping if NO sort is active OR if sorting by Campaign Name (ASC or DESC)
                                const isGroupedSort = !sortConfig || sortConfig.key === 'campaignName';
                                const isSameCampaign = isGroupedSort && index > 0 && row.campaignName === filteredData[index - 1].campaignName;
                                
                                return (
                                    <tr key={row.id} className="hover:bg-zinc-800/30 transition-colors group">
                                    {sortedVisibleColumns.map(colId => {
                                        const def = AVAILABLE_COLUMNS.find(c => c.id === colId);
                                        const val = row[colId];
                                        const stickyStyle = getStickyStyle(colId, false);
                                        const stickyClass = stickyStyle.position === 'sticky' ? "border-r-0 group-hover:bg-[#18181b]" : "";
                                        
                                        // Standardize alignment based on type
                                        const alignClass = (def?.type === 'number' || def?.type === 'currency' || def?.type === 'percent') ? 'text-right' : 'text-left';

                                        if (colId === 'campaignName') {
                                            return (
                                                <td key={colId} style={stickyStyle} className={cn("px-4 py-2.5 max-w-[200px] truncate text-zinc-300 font-medium", stickyClass)}>
                                                    {!isSameCampaign && <span title={val} className="text-indigo-300">{val}</span>}
                                                </td>
                                            );
                                        }

                                        if (colId === 'imageUrl') {
                                            return (
                                                <td key={colId} style={stickyStyle} className={cn("px-4 py-2.5", stickyClass)}>
                                                    {val ? (
                                                        <div className="w-10 h-10 rounded overflow-hidden bg-zinc-800 cursor-zoom-in border border-zinc-700 hover:border-indigo-500/50 transition-colors" onClick={() => setPreviewImage(val)}>
                                                            <img src={val} alt="Ad Preview" className="w-full h-full object-cover" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-10 h-10 rounded bg-zinc-800/50 flex items-center justify-center text-zinc-600"><ImageIcon size={14} /></div>
                                                    )}
                                                </td>
                                            )
                                        }

                                        if (colId === 'platform') {
                                            return <td key={colId} style={stickyStyle} className={cn("px-4 py-2.5", stickyClass)}>{val === 'meta' ? <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /><span className="text-zinc-300 text-xs">Meta</span></div> : <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-orange-500" /><span className="text-zinc-300 text-xs">Google</span></div>}</td>;
                                        }
                                        if (colId === 'status') {
                                            return <td key={colId} style={stickyStyle} className={cn("px-4 py-2.5", stickyClass)}><Badge variant="outline" className={cn("border-0 px-1.5 py-0.5 rounded text-[10px]", (val === 'Active' || val === 'enabled' || val === 'active' || val === '進行中' || val === '審查中') ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500")}>{val}</Badge></td>;
                                        }
                                        if (colId === 'name') {
                                            return <td key={colId} style={stickyStyle} className={cn("px-4 py-2.5 max-w-[300px] truncate text-zinc-300 group-hover:text-zinc-100 font-medium", stickyClass)} title={val}>{val}</td>;
                                        }
                                        
                                        if (colId === 'budget') {
                                             return <td key={colId} style={stickyStyle} className={cn("px-4 py-2.5 text-zinc-400 tabular-nums text-right", stickyClass)}>
                                                 {(val === 0 && row.budgetType === 'ABO') ? (
                                                     <span className="text-xs text-zinc-500">使用廣告組合預算</span>
                                                 ) : (
                                                     val ? `${formatVal(val, 'currency', activeProject.currency)}${row.budgetType === 'Daily' ? '/日' : '/總'}` : '-'
                                                 )}
                                             </td>
                                        }

                                        // --- CUSTOM RENDERING FOR RESULTS & COST PER RESULT ---
                                        if (colId === 'conversions') {
                                            return (
                                                <td key={colId} className="px-4 py-2.5 text-right cursor-pointer hover:bg-zinc-800/50 transition-colors rounded-sm" onClick={() => setSelectedDebugRow(row)} title="點擊檢視原始數據 (Debug)">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-zinc-200 font-medium border-b border-dotted border-zinc-600 mb-0.5 pb-0.5 leading-none">{val > 0 ? val.toLocaleString() : '-'}</span>
                                                        <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                                                            {row.resultType || '成果'}
                                                            <Code size={8} className="text-zinc-600"/>
                                                        </span>
                                                    </div>
                                                </td>
                                            )
                                        }
                                        if (colId === 'costPerResult') {
                                             return (
                                                <td key={colId} className="px-4 py-2.5 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-zinc-200 font-medium leading-none">{val > 0 ? formatVal(val, 'currency', activeProject.currency) : '-'}</span>
                                                        <span className="text-[10px] text-zinc-500">每次{row.resultType || '成果'}成本</span>
                                                    </div>
                                                </td>
                                            )
                                        }
                                        // --------------------------------------------------------
                                        // New Messaging Connections Column Special Handling
                                        if (colId === 'newMessagingConnections') {
                                            return (
                                                <td key={colId} className="px-4 py-2.5 text-zinc-300 text-right tabular-nums">
                                                    {val > 0 ? val.toLocaleString() : '-'}
                                                </td>
                                            )
                                        }
                                        if (colId === 'costPerNewMessagingConnection') {
                                            return (
                                                <td key={colId} className="px-4 py-2.5 text-zinc-300 text-right tabular-nums">
                                                    {val > 0 ? formatVal(val, 'currency', activeProject.currency) : '-'}
                                                </td>
                                            )
                                        }

                                        return (
                                        <td key={colId} className={cn("px-4 py-2.5 text-zinc-400 tabular-nums", alignClass, def?.type === 'currency' && "text-zinc-300", (colId === 'roas' && row.roas > 3) && "text-emerald-400 font-medium")}>
                                            {formatVal(val, def?.type || 'text', activeProject.currency)}
                                        </td>
                                        );
                                    })}
                                    </tr>
                                );
                            })}
                            </tbody>
                            
                            {/* NEW: Total Footer Row */}
                            {tableTotals && (
                                <tfoot className="sticky bottom-0 z-40 bg-[#18181b] font-semibold text-zinc-200 border-t-2 border-zinc-700 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.5)]">
                                    <tr>
                                        {sortedVisibleColumns.map(colId => {
                                            const def = AVAILABLE_COLUMNS.find(c => c.id === colId);
                                            // Re-use sticky logic from header (background matches footer)
                                            const stickyStyle = getStickyStyle(colId, true);
                                            // Alignment logic for footer
                                            const alignClass = (def?.type === 'number' || def?.type === 'currency' || def?.type === 'percent') ? 'text-right' : 'text-left';
                                            
                                            // Explicitly set background for footer sticky cells to cover content
                                            const cellStyle = {
                                                ...stickyStyle,
                                                backgroundColor: '#18181b',
                                                zIndex: stickyStyle.position === 'sticky' ? 40 : undefined 
                                            };

                                            let content: React.ReactNode = '-';
                                            
                                            // Label Logic: Put '總計' in the first likely text column
                                            // Priority: campaignName -> name
                                            if (colId === 'campaignName' || (colId === 'name' && !sortedVisibleColumns.includes('campaignName'))) {
                                                content = '總計';
                                            } 
                                            // Exclude metadata columns
                                            else if (['imageUrl', 'platform', 'status', 'budget', 'name'].includes(colId)) {
                                                content = '';
                                            } 
                                            // Exclude mixed-type or invalid-to-sum metrics as requested
                                            else if (['conversions', 'costPerResult', 'cpa', 'conversionRate', 'costPerPageEngagement'].includes(colId)) {
                                                content = '-';
                                            }
                                            // Render Totals/Averages
                                            else {
                                                const val = tableTotals[colId as keyof typeof tableTotals];
                                                if (typeof val === 'number') {
                                                    content = formatVal(val, def?.type || 'number', activeProject.currency);
                                                }
                                            }

                                            return (
                                                <td key={colId} style={cellStyle} className={cn("px-4 py-3 tabular-nums text-zinc-100", alignClass, cellStyle.position === 'sticky' ? "border-r-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]" : "")}>
                                                    {content}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                      )}
                    </div>
                    <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/50 text-[10px] text-zinc-600 flex justify-between">
                      {demographicData ? (
                           <span>顯示 {demographicData.rows.length} 筆加總資料</span>
                      ) : (
                           <span>顯示 {Math.min(filteredData.length, 200)} / {filteredData.length} 筆資料 (僅顯示前200筆)</span>
                      )}
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
