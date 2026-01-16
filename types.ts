
export type Platform = 'meta' | 'google' | 'unknown';
export type Level = 'campaign' | 'adset' | 'ad' | 'creative' | 'age' | 'gender' | 'demographics';

export interface AdCreativeDetails {
  title?: string;       // Headline (標題)
  body?: string;        // Primary Text (正文)
  linkDescription?: string; // Link description (連結描述)
  displayLink?: string; // Display URL
  callToAction?: string; // Learn More, Shop Now, etc.
  imageUrl?: string;
  thumbnailUrl?: string;
  pageName?: string;    // If available via creative
  pageId?: string;      // Actor ID / Page ID for profile pic
}

export interface AdRow {
  id: string;
  originalId?: string; // ID from the platform
  platform: Platform;
  level: Level;
  name: string;
  status: string;
  
  // Metrics
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number; // Generic results
  conversionValue: number;
  
  // New Detailed Metrics
  reach: number; // 觸及人數
  linkClicks: number; // 連結點擊
  websitePurchases: number; // 網站購買
  videoViews: number; // 3-second video views
  landingPageViews: number; // Landing page views
  
  // Demographics
  age?: string;
  gender?: string;
  
  // Calculated Rates
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  linkCtr: number; // 連結 CTR
  linkCpc: number; // 連結 CPC
  conversionRate: number; // 轉換率 (CVR)

  // Additional Metrics for Yangyu Default
  cpm: number;
  frequency: number;
  costPerResult: number; // Similar to CPA but explicitly labeled
  resultType?: string; // e.g., "網站購買", "開始訊息對話", "潛在客戶"
  
  // New Fields
  budget?: number; // 預算
  budgetType?: string; // Daily vs Lifetime
  optimizationGoal?: string; // Meta Optimization Goal (e.g. THRUPLAY, REACH)

  costPerPageEngagement?: number; // 每次粉絲專頁互動成本
  newMessagingConnections?: number; // 新的訊息聯繫對象
  costPerNewMessagingConnection?: number; // 每位新訊息聯繫對象成本
  messagingConversationsStarted?: number; // 訊息對話開始次數
  
  // Metadata
  campaignName?: string;
  adGroupName?: string; // Ad Set for Meta
  imageUrl?: string; // For creative preview
  creative?: AdCreativeDetails; // Structured creative data for preview
  
  // Debug Data
  objective?: string;
  rawActions?: any[];
  isTotal?: boolean; // Marker for total row

  // Flexible bucket for extra columns
  [key: string]: any;
}

export interface MetaConfig {
  accountId: string;
  accountName: string;
  currency: string;
  token: string;
}

export interface StoredToken {
  id: string;
  alias: string; // User defined name e.g. "My Personal Account"
  token: string;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  data: AdRow[];
  currency?: string; // Project level currency (e.g. TWD, USD)
  metaConfig?: MetaConfig; // Optional: If connected to Meta API
  createdAt: number;
  updatedAt: number;
}

export interface ColumnDef {
  id: string;
  label: string;
  type: 'text' | 'number' | 'currency' | 'percent' | 'image';
  width?: number;
}

export interface Preset {
  id: string;
  name: string;
  columns: string[];
}

export interface ExportMetadata {
    clientName: string;
    period: string;
    platform: string;
}

export interface ExportOptions {
  filename: string;
  includeCurrentView: boolean; // Export filtered data with visible columns
  includeRawCampaigns: boolean;
  includeRawAdSets: boolean;
  includeRawAds: boolean;
  visibleColumns: string[]; // IDs of columns visible in UI
  columnDefs: ColumnDef[]; // Definitions to get labels
}
