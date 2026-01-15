
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { AdRow, Platform, Level, ExportOptions } from '../types';

// Helper to sanitize currency strings "$1,234.56" -> 1234.56
const parseCurrency = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  // Handle strings like "1,234.56", "NT$1,234", etc.
  const clean = String(val).replace(/[^0-9.-]+/g, '');
  return parseFloat(clean) || 0;
};

// Helper to detect platform based on headers
const detectPlatform = (headers: string[]): Platform => {
  const h = headers.map(s => s.toLowerCase());
  
  if (
    h.includes('ad set name') || h.includes('delivery status') || 
    h.includes('廣告組合名稱') || h.includes('行銷活動投遞') ||
    h.includes('age') || h.includes('gender') || h.includes('年齡')
  ) return 'meta';

  if (
    h.includes('ad group') || h.includes('interaction rate') ||
    h.includes('廣告群組')
  ) return 'google';

  return 'unknown';
};

// Helper to find image url in row
const findImageUrl = (row: any): string | undefined => {
    const candidates = [
        'Image URL', 'Ad Image URL', 'Preview Link', 'Thumbnail', 'Image', 
        '圖片連結', '影像連結', '預覽連結', '素材連結'
    ];
    for (const key of candidates) {
        if (row[key] && typeof row[key] === 'string' && row[key].startsWith('http')) {
            return row[key];
        }
    }
    const keys = Object.keys(row);
    for (const k of keys) {
        const lowerK = k.toLowerCase();
        if (
            (lowerK.includes('image') || lowerK.includes('url') || lowerK.includes('link') || lowerK.includes('圖片')) && 
            typeof row[k] === 'string' && row[k].startsWith('http')
        ) {
            return row[k];
        }
    }
    return undefined;
};

// Main Parser
export const parseCSV = (file: File): Promise<AdRow[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        if (data.length === 0) return resolve([]);
        
        const headers = results.meta.fields || [];
        const platform = detectPlatform(headers);
        
        const normalized: AdRow[] = data.map((row, idx) => {
          let name = 'Unknown';
          let level: Level = 'campaign';
          let status = 'Active';
          
          let impressions = 0;
          let clicks = 0;
          let spend = 0;
          let conversions = 0;
          let conversionValue = 0;
          
          let reach = 0;
          let linkClicks = 0;
          let websitePurchases = 0;
          let cpm = 0;
          let frequency = 0;
          let costPerResult = 0;

          // New fields
          let budget = 0;
          let costPerPageEngagement = 0;
          let newMessagingConnections = 0;
          let costPerNewMessagingConnection = 0;
          let messagingConversationsStarted = 0;

          let campaignName = '';
          let adGroupName = '';
          let imageUrl = undefined;

          imageUrl = findImageUrl(row);

          // Level Detection
          if (row['Age'] || row['Gender'] || row['年齡'] || row['性別']) {
             level = 'demographics';
             name = `${row['Age']||row['年齡']||''} ${row['Gender']||row['性別']||''}`.trim() || `Demo Row ${idx}`;
          }
          else if (row['Creative Name'] || row['素材名稱'] || row['Headline'] || row['標題'] || imageUrl) {
             level = 'creative';
             name = row['Creative Name'] || row['素材名稱'] || row['Headline'] || row['標題'] || `Creative ${idx}`;
          }
          else if (row['Ad Name'] || row['廣告名稱'] || row['Ad'] || row['廣告標題']) { 
              level = 'ad'; 
              name = row['Ad Name'] || row['廣告名稱'] || row['Ad'] || row['廣告標題']; 
          } 
          else if (row['Ad Set Name'] || row['廣告組合名稱'] || row['Ad group'] || row['廣告群組']) { 
              level = 'adset'; 
              name = row['Ad Set Name'] || row['廣告組合名稱'] || row['Ad group'] || row['廣告群組']; 
          } 
          else if (row['Campaign Name'] || row['行銷活動名稱'] || row['Campaign'] || row['廣告活動']) { 
              level = 'campaign'; 
              name = row['Campaign Name'] || row['行銷活動名稱'] || row['Campaign'] || row['廣告活動']; 
          }

          if (platform === 'meta') {
            status = row['Delivery Status'] || row['Delivery'] || row['行銷活動投遞'] || row['廣告組合投遞'] || row['投遞狀態'] || row['投遞狀況'] || 'Unknown';
            campaignName = row['Campaign Name'] || row['行銷活動名稱'] || '';
            adGroupName = row['Ad Set Name'] || row['廣告組合名稱'] || '';

            impressions = parseCurrency(row['Impressions'] || row['曝光次數']);
            clicks = parseCurrency(row['Clicks (All)'] || row['點擊次數（全部）'] || row['Clicks'] || row['點擊次數']);
            spend = parseCurrency(row['Amount Spent (TWD)'] || row['Amount Spent'] || row['Cost'] || row['花費金額 (TWD)'] || row['花費金額']);
            conversions = parseCurrency(row['Results'] || row['成果'] || row['Purchases'] || 0);
            conversionValue = parseCurrency(row['Purchase Conversion Value'] || row['總轉換價值'] || 0);
            
            reach = parseCurrency(row['Reach'] || row['觸及人數']);
            linkClicks = parseCurrency(row['Link Clicks'] || row['連結點擊次數']);
            websitePurchases = parseCurrency(row['Website Purchases'] || row['網站購買'] || row['Purchases'] || 0);
            
            cpm = parseCurrency(row['CPM (Cost per 1,000 Impressions) (TWD)'] || row['CPM（每千次廣告曝光成本） (TWD)'] || row['CPM'] || row['CPM (Cost per 1,000 Impressions)']);
            frequency = parseCurrency(row['Frequency'] || row['頻率']);
            costPerResult = parseCurrency(row['Cost per Result'] || row['每次成果成本'] || row['CPR']);
            
            // New CSV Mappings for Yangyu
            budget = parseCurrency(row['廣告組合預算'] || row['Budget'] || 0);
            costPerPageEngagement = parseCurrency(row['每次粉絲專頁互動成本 (TWD)'] || row['Cost per Page Engagement'] || 0);
            newMessagingConnections = parseCurrency(row['新的訊息聯繫對象'] || row['New Messaging Connections'] || 0);
            // Handling the malformed or specific column for Cost per New Connection
            // It might appear as " (TWD)" in some exports if column name is empty, or explicitly named
            costPerNewMessagingConnection = parseCurrency(row['每位新訊息聯繫對象成本'] || row['Cost per New Messaging Connection'] || row[' (TWD)'] || 0);
            messagingConversationsStarted = parseCurrency(row['訊息對話開始次數'] || row['Messaging Conversations Started'] || 0);

          } else {
            status = row['Campaign state'] || row['Ad group state'] || row['Status'] || row['廣告活動狀態'] || row['廣告群組狀態'] || 'Unknown';
            campaignName = row['Campaign'] || row['廣告活動'] || '';
            adGroupName = row['Ad group'] || row['廣告群組'] || '';

            impressions = parseCurrency(row['Impressions'] || row['曝光']);
            clicks = parseCurrency(row['Clicks'] || row['點擊']);
            spend = parseCurrency(row['Cost'] || row['費用']);
            conversions = parseCurrency(row['Conversions'] || row['轉換']);
            conversionValue = parseCurrency(row['Total conv. value'] || row['總轉換價值']);
            budget = parseCurrency(row['Budget'] || row['預算']);
            
            // Google mapping approx
            linkClicks = clicks; 
            reach = impressions; 
            // Calc CPM for Google if not present
            cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
            frequency = 1; // Google usually doesn't provide freq in standard reports same way
            costPerResult = conversions > 0 ? spend / conversions : 0;
          }

          // Calculations
          const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
          const cpc = clicks > 0 ? spend / clicks : 0;
          
          const linkCtr = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
          const linkCpc = linkClicks > 0 ? spend / linkClicks : 0;
          
          const conversionBasis = conversions > 0 ? conversions : websitePurchases;
          const cpa = conversionBasis > 0 ? spend / conversionBasis : 0;
          const conversionRate = clicks > 0 ? (conversionBasis / clicks) * 100 : 0;
          
          const roas = spend > 0 ? conversionValue / spend : 0;

          // If costPerResult wasn't in CSV, fallback to calculated CPA
          if (!costPerResult && conversionBasis > 0) {
              costPerResult = cpa;
          }

          return {
            id: `${platform}-${level}-${idx}`,
            platform,
            level,
            name: name || `Row ${idx}`,
            status,
            impressions,
            clicks,
            spend,
            conversions,
            conversionValue,
            reach,
            linkClicks,
            websitePurchases,
            ctr, cpc, cpa, roas, linkCtr, linkCpc, conversionRate,
            cpm, frequency, costPerResult,
            
            // New Fields
            budget,
            costPerPageEngagement,
            newMessagingConnections,
            costPerNewMessagingConnection,
            messagingConversationsStarted,

            campaignName,
            adGroupName,
            imageUrl,
            ...row 
          };
        });

        resolve(normalized);
      },
      error: (err) => reject(err)
    });
  });
};

// Updated Export Function
export const exportToExcel = (rows: AdRow[], options: ExportOptions) => {
  const wb = XLSX.utils.book_new();

  // 1. Current View (Filtered, Specific Columns)
  if (options.includeCurrentView) {
      // Map rows to match visible columns order and labels
      const mappedRows = rows.map(row => {
          const newRow: Record<string, any> = {};
          options.visibleColumns.forEach(colId => {
              const def = options.columnDefs.find(c => c.id === colId);
              const label = def ? def.label : colId;
              
              let val = row[colId];
              
              // Formatting logic (optional, but good for excel)
              if (colId === 'status' && !val) val = row.status;
              if (colId === 'budget' && row.budgetType) val = `${val} (${row.budgetType})`;
              
              newRow[label] = val;
          });
          return newRow;
      });
      
      const ws = XLSX.utils.json_to_sheet(mappedRows);
      XLSX.utils.book_append_sheet(wb, ws, "當前檢視_Overview");
  }
  
  // 2. Raw Data Sheets
  const append = (lvl: Level, sheetName: string) => {
      // For raw sheets, we might want to export the original structure or the full normalized structure.
      // Here we export the normalized AdRow structure for consistency.
      const data = rows.filter(r => r.level === lvl);
      if (data.length) {
          const ws = XLSX.utils.json_to_sheet(data);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
  };

  // We rely on the full dataset passed to this function, but the calling function (App) 
  // currently passes 'filteredData' to 'rows'. 
  // If the user wants RAW data, they usually expect unfiltered data, 
  // but for "Export Current Selection", passing filteredData is correct for the first sheet.
  // Ideally, if we want RAW UNFILTERED data for other tabs, we'd need the full project data.
  // NOTE: For now, we assume 'rows' contains what the user wants to export (either filtered or all).
  // The 'App.tsx' will be responsible for passing the correct data set (e.g., activeProject.data vs filteredData).
  // However, usually "Raw Sheets" implies comprehensive data.
  
  if (options.includeRawCampaigns) append('campaign', "Campaigns");
  if (options.includeRawAdSets) append('adset', "AdSets");
  if (options.includeRawAds) append('ad', "Ads");
  
  XLSX.writeFile(wb, `${options.filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
};
