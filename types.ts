export type Platform = 'meta' | 'google' | 'unknown';
export type Level = 'campaign' | 'adset' | 'ad' | 'demographics' | 'creative';

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
  conversions: number;
  conversionValue: number;
  
  // Calculated (can be computed on fly, but storing for sorting)
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  
  // Metadata
  campaignName?: string;
  adGroupName?: string; // Ad Set for Meta
  imageUrl?: string; // New: For creative preview
  
  // Flexible bucket for extra columns
  [key: string]: any;
}

export interface Project {
  id: string;
  name: string;
  data: AdRow[];
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
