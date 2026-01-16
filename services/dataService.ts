
import Papa from 'papaparse';
import XLSX from 'xlsx';
import { AdRow, Platform, Level, ExportOptions, ColumnDef, ExportMetadata } from '../types';

// Helper: Sanitize currency strings "$1,234.56" -> 1234.56
const parseCurrency = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const clean = String(val).replace(/[^0-9.-]+/g, '');
  return parseFloat(clean) || 0;
};

// Helper: Robust Value Finder
// Scans row keys to find a match for candidates, handling trimming and case-insensitivity
const findVal = (row: any, candidates: string[]): string | undefined => {
    const keys = Object.keys(row);
    for (const c of candidates) {
        const target = c.toLowerCase().trim();
        const foundKey = keys.find(k => k.toLowerCase().trim() === target);
        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== "") {
            return row[foundKey];
        }
    }
    return undefined;
};

// Helper: Fuzzy Finder for specific messy columns (like Messaging)
// Returns the value if any key *includes* the target keyword (case-insensitive)
const findValByKeyword = (row: any, keywords: string[]): string | undefined => {
    const keys = Object.keys(row);
    for (const k of keys) {
        const lowerKey = k.toLowerCase();
        for (const keyword of keywords) {
            // strict check: keyword must exist
            if (lowerKey.includes(keyword.toLowerCase())) {
                if (row[k] !== undefined && row[k] !== "") return row[k];
            }
        }
    }
    return undefined;
};

// Helper: Detect platform
const detectPlatform = (headers: string[]): Platform => {
  const h = headers.map(s => s.toLowerCase());
  if (
    h.some(x => x.includes('ad set name') || x.includes('廣告組合名稱')) || 
    h.some(x => x.includes('delivery status') || x.includes('行銷活動投遞')) ||
    h.some(x => x.includes('成果指標') || x.includes('result indicator'))
  ) return 'meta';

  if (
    h.some(x => x.includes('ad group') || x.includes('廣告群組')) || 
    h.some(x => x.includes('interaction rate'))
  ) return 'google';

  return 'unknown';
};

// Helper: Detect Currency
const detectCurrency = (headers: string[]): string => {
    for (const h of headers) {
        if (h.includes('(') && h.includes(')')) {
            const match = h.match(/\(([A-Z]{3})\)/);
            if (match && match[1]) return match[1];
        }
        if (h.includes('NT$')) return 'TWD';
        if (h.includes('HK$')) return 'HKD';
    }
    // Update: Default to TWD for this user base if not detected
    return 'TWD'; 
};

// Helper: Find Image URL
const findImageUrl = (row: any): string | undefined => {
    // 1. Try explicit columns first
    const val = findVal(row, [
        'Image URL', 'Ad Image URL', 'Preview Link', 'Thumbnail', 'Image', 
        '圖片連結', '影像連結', '預覽連結', '素材連結'
    ]);
    if (val && val.startsWith('http')) return val;

    // 2. Scan all columns for http links that look like images
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

// Helper: Map Result Indicator to Type
const mapResultIndicator = (indicator: string): string => {
    if (!indicator) return '成果';
    const ind = indicator.toLowerCase().trim();
    
    if (ind === 'purchase' || ind.includes('pixel_purchase') || ind.includes('omni_purchase')) return '網站購買';
    if (ind.includes('messaging_conversation_started')) return '開始訊息對話';
    if (ind.includes('messaging_connection')) return '新的訊息聯繫對象';
    if (ind.includes('omni_landing_page_view') || ind.includes('landing_page_view')) return '連結頁面瀏覽';
    if (ind.includes('link_click')) return '連結點擊';
    if (ind.includes('video_thruplay_watched_actions') || ind.includes('thruplay')) return 'ThruPlay 次數';
    if (ind.includes('post_engagement')) return '貼文互動';
    if (ind.includes('like')) return '粉絲專頁按讚';
    if (ind.includes('reach')) return '觸及人數';
    if (ind.includes('lead')) return '潛在客戶';
    if (ind.includes('video_view')) return '影片觀看';
    
    return ind; // Return raw if no map found, better than "成果"
};

// Main Parser
export const parseCSV = (file: File): Promise<{ rows: AdRow[], currency: string }> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        if (data.length === 0) return resolve({ rows: [], currency: 'TWD' });
        
        const headers = results.meta.fields || [];
        const platform = detectPlatform(headers);
        const currency = detectCurrency(headers);
        
        const normalized: AdRow[] = data.map((row, idx) => {
          // --- 1. Identify Level & Name ---
          let level: Level = 'campaign';
          let name = 'Unknown';
          
          const imageUrl = findImageUrl(row);

          if (findVal(row, ['Age', 'Gender', '年齡', '性別'])) {
             level = 'demographics';
             const age = findVal(row, ['Age', '年齡']) || '';
             const gender = findVal(row, ['Gender', '性別']) || '';
             name = `${age} ${gender}`.trim() || `Demo Row ${idx}`;
          }
          else if (findVal(row, ['Creative Name', '素材名稱', 'Headline', '標題']) || imageUrl) {
             level = 'creative';
             name = findVal(row, ['Creative Name', '素材名稱', 'Headline', '標題']) || `Creative ${idx}`;
          }
          else if (findVal(row, ['Ad Name', '廣告名稱', 'Ad', '廣告標題'])) { 
              level = 'ad'; 
              name = findVal(row, ['Ad Name', '廣告名稱', 'Ad', '廣告標題']) || ''; 
          } 
          else if (findVal(row, ['Ad Set Name', '廣告組合名稱', 'Ad group', '廣告群組'])) { 
              level = 'adset'; 
              name = findVal(row, ['Ad Set Name', '廣告組合名稱', 'Ad group', '廣告群組']) || ''; 
          } 
          else if (findVal(row, ['Campaign Name', '行銷活動名稱', 'Campaign', '廣告活動'])) { 
              level = 'campaign'; 
              name = findVal(row, ['Campaign Name', '行銷活動名稱', 'Campaign', '廣告活動']) || ''; 
          }

          // --- 2. Basic Metrics ---
          let impressions = parseCurrency(findVal(row, ['Impressions', '曝光次數', '曝光']));
          let clicks = parseCurrency(findVal(row, ['Clicks (All)', '點擊次數（全部）', 'Clicks', '點擊次數', '點擊']));
          let spend = parseCurrency(findVal(row, ['Amount Spent (TWD)', 'Amount Spent', 'Cost', '花費金額 (TWD)', '花費金額', '費用']));
          
          // --- 3. Result Logic (Strict Priority) ---
          let conversions = 0;
          let costPerResult = 0;
          let resultType = '成果';

          // Extract specific metrics first (needed for backfilling and heuristics)
          const purchases = parseCurrency(findVal(row, ['Website Purchases', '網站購買']));
          const thruPlays = parseCurrency(findVal(row, ['ThruPlays', 'ThruPlay', 'ThruPlay 次數', 'video_thruplay_watched_actions']));
          const videoViews = parseCurrency(findVal(row, ['3-Second Video Views', '3秒影片觀看', 'video_view']));
          const landingPageViews = parseCurrency(findVal(row, ['Landing Page Views', '連結頁面瀏覽', 'landing_page_view']));
          let linkClicks = parseCurrency(findVal(row, ['Link Clicks', '連結點擊次數', 'link_click']));
          const leads = parseCurrency(findVal(row, ['Leads', 'On-Facebook Leads', '潛在客戶', 'lead']));
          const messagingStarted = parseCurrency(findValByKeyword(row, ['訊息對話開始次數', 'Messaging Conversations Started']));

          if (platform === 'meta') {
              // A. Get The Value (Results / 成果)
              conversions = parseCurrency(findVal(row, ['Results', '成果']));

              // B. Get The Indicator (Result Indicator / 成果指標)
              const indicatorRaw = findValByKeyword(row, ['成果指標', 'Result Indicator']);
              
              if (indicatorRaw) {
                  // PRIORITY 1: If indicator exists, use it.
                  resultType = mapResultIndicator(indicatorRaw);
                  
                  // Backfill: If Results column is empty (0) but we know the type and have the metric, fill it.
                  if (conversions === 0) {
                       if (resultType === 'ThruPlay 次數' && thruPlays > 0) conversions = thruPlays;
                       else if (resultType === '網站購買' && purchases > 0) conversions = purchases;
                       else if (resultType === '連結頁面瀏覽' && landingPageViews > 0) conversions = landingPageViews;
                       else if (resultType === '連結點擊' && linkClicks > 0) conversions = linkClicks;
                       else if (resultType === '潛在客戶' && leads > 0) conversions = leads;
                       else if (resultType === '開始訊息對話' && messagingStarted > 0) conversions = messagingStarted;
                  }
              } else {
                  // Fallback heuristics ONLY if indicator is totally missing
                  // If conversion count matches a specific metric exactly, assume that is the result type.
                  if (conversions > 0) {
                      if (purchases === conversions) resultType = '網站購買';
                      else if (thruPlays === conversions) resultType = 'ThruPlay 次數';
                      else if (leads === conversions) resultType = '潛在客戶';
                      else if (messagingStarted === conversions) resultType = '開始訊息對話';
                      else if (landingPageViews === conversions) resultType = '連結頁面瀏覽';
                      else if (linkClicks === conversions) resultType = '連結點擊';
                  } else {
                      // If conversions is 0 AND indicator is missing, check if this looks like a video campaign
                      if (thruPlays > 0 && thruPlays > linkClicks) {
                           conversions = thruPlays;
                           resultType = 'ThruPlay 次數';
                      }
                  }
              }

              // C. Cost Per Result
              // First try explicit column
              costPerResult = parseCurrency(findVal(row, ['Cost per Result', '每次成果成本', 'CPR']));
              
              // If explicit column is 0/missing, calculate it
              if (costPerResult === 0 && conversions > 0) {
                  costPerResult = spend / conversions;
              }

          } else {
              // Google
              conversions = parseCurrency(findVal(row, ['Conversions', '轉換']));
              costPerResult = conversions > 0 ? spend / conversions : 0;
              resultType = '轉換';
          }

          // --- 4. Other Metrics ---
          let conversionValue = parseCurrency(findVal(row, ['Purchase Conversion Value', '總轉換價值', 'Total conv. value']));
          let reach = parseCurrency(findVal(row, ['Reach', '觸及人數']));
          
          if (platform === 'google') {
               // Google usually maps clicks to link clicks in this simplified view
               if (linkClicks === 0) linkClicks = clicks; 
          }

          // Website Purchases is already parsed above as `purchases`
          
          let cpm = parseCurrency(findVal(row, ['CPM (Cost per 1,000 Impressions) (TWD)', 'CPM（每千次廣告曝光成本） (TWD)', 'CPM']));
          if (cpm === 0 && impressions > 0) cpm = (spend / impressions) * 1000;

          let frequency = parseCurrency(findVal(row, ['Frequency', '頻率'])) || 1;

          // --- 5. Advanced / Custom Metrics ---
          let budget = parseCurrency(findVal(row, ['廣告組合預算', 'Budget', '預算']));
          let budgetType = ''; 
          const budgetTypeRaw = findVal(row, ['廣告組合預算類型', 'Budget Type']);
          if (budgetTypeRaw) {
              if (budgetTypeRaw.includes('Daily') || budgetTypeRaw.includes('每日')) budgetType = 'Daily';
              if (budgetTypeRaw.includes('Lifetime') || budgetTypeRaw.includes('總經費')) budgetType = 'Lifetime';
          }
          const budgetRaw = findVal(row, ['廣告組合預算', 'Budget']);
          if (budgetRaw && (budgetRaw.includes('使用廣告組合預算') || budgetRaw.includes('Using ad set budget'))) {
              budget = 0;
              budgetType = 'ABO';
          }

          // Messaging
          let newMessagingConnections = parseCurrency(
              findValByKeyword(row, ['新的訊息聯繫對象', 'Messaging Connections', 'New Messaging Connections', 'Messaging connections', 'messaging_connection'])
          );
          
          let messagingConversationsStarted = messagingStarted; // Already parsed
          
          // Cost Per New Messaging Connection
          let costPerNewMessagingConnection = 0;
          if (newMessagingConnections > 0) {
              costPerNewMessagingConnection = spend / newMessagingConnections;
          } else {
              const rawCost = findValByKeyword(row, ['每位新訊息聯繫對象成本', 'Cost per New Messaging Connection', 'Cost per Messaging Connection']);
              costPerNewMessagingConnection = parseCurrency(rawCost);
          }

          // Cost Per Page Engagement
          let costPerPageEngagement = parseCurrency(findVal(row, ['每次粉絲專頁互動成本 (TWD)', 'Cost per Page Engagement']));
          if (costPerPageEngagement === 0) {
               const rawEngCost = findValByKeyword(row, ['每次粉絲專頁互動成本', 'Cost per Page Engagement']);
               costPerPageEngagement = parseCurrency(rawEngCost);
          }

          // Status
          let status = 'Active';
          if (platform === 'meta') {
              status = findVal(row, ['Delivery Status', 'Delivery', '行銷活動投遞', '廣告組合投遞', '投遞狀態']) || 'Unknown';
          } else {
              status = findVal(row, ['Campaign state', 'Ad group state', 'Status', '廣告活動狀態']) || 'Unknown';
          }

          const campaignName = findVal(row, ['Campaign Name', '行銷活動名稱', 'Campaign', '廣告活動']) || '';
          const adGroupName = findVal(row, ['Ad Set Name', '廣告組合名稱', 'Ad group', '廣告群組']) || '';

          // --- 6. Calculated Rates ---
          const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
          const cpc = clicks > 0 ? spend / clicks : 0;
          const linkCtr = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
          const linkCpc = linkClicks > 0 ? spend / linkClicks : 0;
          
          // Result Rate (Conversions / Impressions)
          const conversionRate = impressions > 0 ? (conversions / impressions) * 100 : 0;
          
          // Smart CPA Logic:
          let cpa = 0;
          if (purchases > 0) {
              cpa = spend / purchases;
          } else if (conversions > 0) {
              cpa = costPerResult > 0 ? costPerResult : (spend / conversions);
          }

          const roas = spend > 0 ? conversionValue / spend : 0;

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
            websitePurchases: purchases,
            videoViews, // Passed from top parsing
            landingPageViews, // Passed from top parsing
            ctr, cpc, cpa, roas, linkCtr, linkCpc, conversionRate,
            cpm, frequency, costPerResult,
            resultType,
            
            budget,
            budgetType,
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

        resolve({ rows: normalized, currency });
      },
      error: (err) => reject(err)
    });
  });
};

// Simplified Interface for the new one-click export
interface OneClickExportOptions {
    filename: string;
    sheets: {
        name: string;
        data: any[];
        columns: string[];
        columnDefs: ColumnDef[];
    }[];
    metadata?: ExportMetadata;
}

// Export Function with Styling
export const exportToExcel = (options: OneClickExportOptions) => {
  const wb = XLSX.utils.book_new();

  // Helper to map a row based on columns and definitions
  const mapData = (data: any[], columns: string[], defs: ColumnDef[]) => {
      return data.map(row => {
          const newRow: Record<string, any> = {};
          columns.forEach(colId => {
              // Special case for Demographics 'name' which isn't in defs typically
              let label = colId;
              const def = defs.find(c => c.id === colId);
              if (def) label = def.label;
              else if (colId === 'name') label = '名稱/類別';

              let val = row[colId];
              
              // Formatting logic similar to UI
              if (colId === 'status' && !val) val = row.status;
              if (colId === 'budget' && row.budgetType) val = `${val} (${row.budgetType})`;
              
              // Handle Special Logic Exclusions for Total Row (already marked as -1 in App.tsx)
              if (row.isTotal && val === -1) {
                  val = '-';
              }
              // Format percentages for Excel (e.g. 0.05 -> 5%)
              else if (def?.type === 'percent' && typeof val === 'number') {
                  val = val / 100;
              }

              // **CRITICAL FIX**: For Total Row, ensure NO undefined values. 
              // If val is missing, set to empty string. This ensures Excel creates the cell so we can color it.
              if (row.isTotal && (val === undefined || val === null)) {
                  val = '';
              }
              
              newRow[label] = val;
          });
          return newRow;
      });
  };

  // 1. Generate Main Sheets
  options.sheets.forEach(sheet => {
      const mapped = mapData(sheet.data, sheet.columns, sheet.columnDefs);
      
      // IMPORTANT: Origin at B6 (Row 5, Col 1) to leave room for headers and left spacer
      // Use cast to any because origin is not in JSON2SheetOpts type definition but works at runtime
      const ws = XLSX.utils.json_to_sheet(mapped, { origin: { r: 5, c: 1 } } as any);

      // Add Metadata manually at B2:C4
      if (options.metadata) {
          XLSX.utils.sheet_add_aoa(ws, [
              ["客戶", options.metadata.clientName],
              ["月報期間", options.metadata.period],
              ["推廣平台", options.metadata.platform]
          ], { origin: { r: 1, c: 1 } });
      }

      // Hide Gridlines for cleaner look (Visual setting)
      if (!ws['!views']) ws['!views'] = [];
      ws['!views'][0] = { showGridLines: false };

      // --- APPLY STYLES ---
      // Requires xlsx-js-style import
      const range = XLSX.utils.decode_range(ws['!ref'] as string);
      
      // Auto Width Estimation
      const colWidths: number[] = [];
      // Set Col A width small
      colWidths[0] = 2; 

      for (let C = range.s.c; C <= range.e.c; ++C) {
          // Skip Col A for auto width calculation of data, but initialize default
          if (C === 0) continue;
          colWidths[C] = 12; // Min width
      }

      // Metadata Region (Rows 1-3 in 0-index, which is Excel Rows 2-4)
      // Table Header Row (Row 5 in 0-index, Excel Row 6)
      // Total Row (Row 6 in 0-index, Excel Row 7)
      
      const META_START_ROW = 1;
      const META_END_ROW = 3;
      const TABLE_HEADER_ROW = 5;
      const TABLE_TOTAL_ROW = 6;

      for (let R = range.s.r; R <= range.e.r; ++R) {
        // Loop columns
        for (let C = range.s.c; C <= range.e.c; ++C) {
            
          // Skip Column A (Spacer)
          if (C === 0) continue;

          const cell_address = XLSX.utils.encode_cell({ r: R, c: C });
          
          // SPECIAL LOGIC: Ensure Total Row (Row 7) cells exist even if empty, so we can color them.
          if (R === TABLE_TOTAL_ROW) {
              if (!ws[cell_address]) {
                  ws[cell_address] = { t: 's', v: '', s: {} };
              }
          }

          if (!ws[cell_address]) continue;
          
          const cell = ws[cell_address];
          
          // Initialize Style
          if (!cell.s) cell.s = {};

          // GLOBAL: Font
          cell.s.font = { name: 'Microsoft JhengHei', sz: 11 };
          
          // --- METADATA SECTION (Rows 2-4) ---
          if (R >= META_START_ROW && R <= META_END_ROW) {
              if (C === 1) { // Label Column (B)
                  cell.s.alignment = { horizontal: "right", vertical: "center" };
                  cell.s.font.bold = false; // Regular
                  // Right border only for separator
                  cell.s.border = { right: { style: 'thin', color: { rgb: "000000" } } };
              } else if (C === 2) { // Value Column (C)
                  cell.s.alignment = { horizontal: "left", vertical: "center" };
                  // No borders for value
              }
          }

          // --- TABLE SECTION (Row 6+) ---
          else if (R >= TABLE_HEADER_ROW) {
              
              // Common Table Border
              cell.s.border = {
                top: { style: 'thin', color: { rgb: "000000" } },
                bottom: { style: 'thin', color: { rgb: "000000" } },
                left: { style: 'thin', color: { rgb: "000000" } },
                right: { style: 'thin', color: { rgb: "000000" } }
              };

              // Determine Column Type for Alignment
              const colId = sheet.columns[C - 1]; // -1 because offset by Col A
              const def = sheet.columnDefs.find(def => (def.label === colId || def.id === colId));
              const isNum = def?.type === 'number' || def?.type === 'currency' || def?.type === 'percent';
              
              cell.s.alignment = {
                  vertical: "center",
                  horizontal: isNum ? "right" : "left",
                  wrapText: true 
              };

              // Number Formats
              if (R > TABLE_HEADER_ROW) { // Data Rows
                  if (def?.type === 'percent') cell.z = '0.00%';
                  if (def?.type === 'currency') cell.z = '"$"#,##0';
                  if (def?.type === 'number') cell.z = '#,##0';
              }

              // --- HEADER ROW (Row 6) ---
              if (R === TABLE_HEADER_ROW) {
                // Light Green (#A9D08E)
                cell.s.fill = { fgColor: { rgb: "A9D08E" } }; 
                cell.s.font.bold = true;
                cell.s.font.color = { rgb: "000000" };
                cell.s.alignment.horizontal = "left"; 
              }
              
              // --- TOTAL ROW (Row 7) ---
              else if (R === TABLE_TOTAL_ROW) {
                 // Dark Green (#548235)
                 cell.s.fill = { fgColor: { rgb: "548235" } };
                 cell.s.font.bold = true;
                 cell.s.font.color = { rgb: "FFFFFF" }; // White text
              }
          }

          // Estimate Width
          const valLen = (cell.v ? String(cell.v).length : 0);
          // Metadata columns might need more width
          if (R <= META_END_ROW && C === 2) {
               if (valLen > colWidths[C]) colWidths[C] = Math.min(valLen + 20, 60);
          } else {
               if (valLen > colWidths[C]) colWidths[C] = Math.min(valLen + 5, 50); 
          }
        }
      }

      ws['!cols'] = colWidths.map(w => ({ wch: w }));

      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });
  
  XLSX.writeFile(wb, `${options.filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
};
