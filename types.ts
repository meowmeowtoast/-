
export type Platform = 'meta' | 'google' | 'unknown';
export type Level = 'campaign' | 'adset' | 'ad' | 'creative' | 'age' | 'gender' | 'demographics';

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
  
  // Metadata
  campaignName?: string;
  adGroupName?: string; // Ad Set for Meta
  imageUrl?: string; // For creative preview
  
  // Flexible bucket for extra columns
  [key: string]: any;
}

export interface MetaConfig {
  accountId: string;
  accountName: string;
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
