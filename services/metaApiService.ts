
import { AdRow } from '../types';

const API_VERSION = 'v22.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

interface MetaAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
}

// --- Helper: Robust Fetch with Retry ---
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, retries = 3, backoff = 1000): Promise<any> => {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            const data = await res.json();
            
            // Handle API Errors returned as JSON
            if (data.error) {
                // Rate Limit Code: 17, 4, 32, 613
                if ([17, 4, 32, 613].includes(data.error.code)) {
                    console.warn(`Meta API Rate Limit hit. Retrying in ${backoff}ms...`);
                    if (i < retries - 1) {
                        await wait(backoff * (i + 1)); // Exponential backoff
                        continue;
                    }
                }
                // Token Error: 190
                if (data.error.code === 190) {
                    throw new Error("Access Token 已失效或過期，請重新取得 Token。");
                }
                throw new Error(data.error.message || "Unknown Meta API Error");
            }
            
            return data;
        } catch (err: any) {
            // Network errors
            if (i < retries - 1) {
                console.warn(`Network request failed. Retrying... (${i + 1}/${retries})`);
                await wait(backoff);
                continue;
            }
            throw err;
        }
    }
};

// --- Helper: Fetch All Pages ---
const fetchAllPages = async (initialUrl: string): Promise<any[]> => {
    let allData: any[] = [];
    let nextUrl = initialUrl;
    let pageCount = 0;

    while (nextUrl && pageCount < 20) { // Safety limit: 20 pages (approx 10,000 rows)
        const response = await fetchWithRetry(nextUrl);
        if (response.data) {
            allData = [...allData, ...response.data];
        }
        
        // Check for next page
        if (response.paging && response.paging.next) {
            nextUrl = response.paging.next;
            pageCount++;
        } else {
            nextUrl = '';
        }
    }
    return allData;
};

// 1. Fetch Ad Accounts
export const fetchAdAccounts = async (token: string): Promise<MetaAccount[]> => {
  const url = `${BASE_URL}/me/adaccounts?fields=name,account_id,currency&limit=100&access_token=${token}`;
  const data = await fetchWithRetry(url);
  return data.data || [];
};

// Helper: Determine the "Result" value AND label based on objective and actions
// Priority logic adapted to match Meta Ads Manager default columns
const getResultData = (actions: any[], objective?: string, campaignName?: string): { value: number, label: string } => {
    if (!actions || actions.length === 0) return { value: 0, label: '成果' };

    const findVal = (type: string) => {
        const item = actions.find((a: any) => a.action_type === type);
        return item ? parseFloat(item.value) : 0;
    };

    // --- Heuristic Override: Name-based Detection ---
    // If name implies Video View, prioritize ThruPlay regardless of objective nuances
    if (campaignName && (campaignName.includes('觀影') || campaignName.includes('Video') || campaignName.includes('View'))) {
         const thru = findVal('video_thruplay_watched_actions');
         if (thru > 0) return { value: thru, label: 'ThruPlay 次數' };
    }

    // --- 1. Objective Specific Priority (To match screenshots) ---
    if (objective) {
        // Messages / Engagement (Messages)
        if (objective.includes('MESSAGES') || objective === 'OUTCOME_ENGAGEMENT') {
             // Priority 1: Conversations Started (Usually the main result for Message ads)
             const msg = findVal('onsite_conversion.messaging_conversation_started_7d');
             if (msg > 0) return { value: msg, label: '開始訊息對話' };
             
             // Priority 2: ThruPlay (For Video ads under Engagement objective)
             const thru = findVal('video_thruplay_watched_actions');
             if (thru > 0) return { value: thru, label: 'ThruPlay 次數' };

             // Fallback for some engagement campaigns
             const postEng = findVal('post_engagement');
             if (postEng > 0) return { value: postEng, label: '貼文互動' };
        }

        // Traffic
        if (objective === 'OUTCOME_TRAFFIC' || objective === 'TRAFFIC' || objective === 'LINK_CLICKS') {
             // Priority 1: Landing Page Views (If pixel is active)
             const lp = findVal('landing_page_view');
             if (lp > 0) return { value: lp, label: '連結頁面瀏覽' };
             
             // Priority 2: Link Clicks
             const lc = findVal('link_click');
             if (lc > 0) return { value: lc, label: '連結點擊' };
        }

        // Awareness / Video Views
        if (objective === 'OUTCOME_AWARENESS' || objective === 'VIDEO_VIEWS') {
             const thru = findVal('video_thruplay_watched_actions');
             if (thru > 0) return { value: thru, label: 'ThruPlay 次數' };
             
             const reach = findVal('reach'); // Reach is rarely an action, usually a metric, but check actions just in case
        }

        // Sales / Conversions
        if (objective === 'OUTCOME_SALES' || objective === 'CONVERSIONS') {
             const purch = findVal('purchase') || findVal('omni_purchase') || findVal('offsite_conversion.fb_pixel_purchase');
             if (purch > 0) return { value: purch, label: '網站購買' };
        }

        // Leads
        if (objective === 'OUTCOME_LEADS' || objective === 'LEAD_GENERATION') {
             const lead = findVal('lead') || findVal('on_facebook_lead');
             if (lead > 0) return { value: lead, label: '潛在客戶' };
        }
    }

    // --- 2. Generic Priority (Fallbacks if objective doesn't match or result is 0) ---
    
    // Purchase
    const purchase = findVal('purchase') || findVal('omni_purchase') || findVal('offsite_conversion.fb_pixel_purchase');
    if (purchase > 0) return { value: purchase, label: '網站購買' };

    // Leads
    const leads = findVal('lead');
    if (leads > 0) return { value: leads, label: '潛在客戶' };

    // Messages
    const messaging = findVal('onsite_conversion.messaging_conversation_started_7d');
    if (messaging > 0) return { value: messaging, label: '開始訊息對話' };

    // ThruPlay
    const thruPlay = findVal('video_thruplay_watched_actions');
    if (thruPlay > 0) return { value: thruPlay, label: 'ThruPlay 次數' };

    // Landing Page View
    const lpView = findVal('landing_page_view');
    if (lpView > 0) return { value: lpView, label: '連結頁面瀏覽' };
    
    // Link Click
    const linkClick = findVal('link_click');
    if (linkClick > 0) return { value: linkClick, label: '連結點擊' };

    // Engagement
    const engagement = findVal('post_engagement');
    if (engagement > 0) return { value: engagement, label: '貼文互動' };

    return { value: 0, label: '成果' };
};

// Helper: Extract Image URL from complex creative object
const getCreativeImageUrl = (creative: any): string | undefined => {
    if (!creative) return undefined;
    
    // 1. Direct Image
    if (creative.image_url) return creative.image_url;
    
    // 2. Thumbnail (Video)
    if (creative.thumbnail_url) return creative.thumbnail_url;

    // 3. Object Story Spec (Link Ads, Existing Posts)
    const spec = creative.object_story_spec;
    if (spec) {
        // Link Data
        if (spec.link_data) {
            if (spec.link_data.picture) return spec.link_data.picture;
            // Additional check for image_hash could be here if needed
        }
        // Video Data inside story
        if (spec.video_data) {
            if (spec.video_data.image_url) return spec.video_data.image_url;
        }
    }

    return undefined;
};

// Helper: Map English API status to Chinese UI status
const mapStatus = (effectiveStatus: string, stopTime?: string): string => {
    const isRunning = ['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES'].includes(effectiveStatus);
    
    if (isRunning && stopTime) {
        const end = new Date(stopTime).getTime();
        const now = Date.now();
        if (end < now) {
            return '已完成';
        }
    }

    // 2. Status Mapping
    switch (effectiveStatus) {
        case 'ACTIVE': return '進行中';
        case 'PAUSED': return '已關閉';
        case 'DELETED': return '已刪除';
        case 'ARCHIVED': return '已封存';
        case 'IN_PROCESS': return '進行中'; 
        case 'WITH_ISSUES': return '錯誤'; 
        case 'CAMPAIGN_PAUSED': return '行銷活動已關閉';
        case 'ADSET_PAUSED': return '廣告組合已關閉';
        case 'PENDING_REVIEW': return '審查中';
        case 'DISAPPROVED': return '未通過';
        case 'PREAPPROVED': return '預審通過';
        case 'PENDING_BILLING_INFO': return '需更新付款資訊';
        default: return '未投遞'; 
    }
};

// Helper: Get Budget Divider based on Currency
const getBudgetDivider = (currency: string): number => {
    const zeroDecimalCurrencies = [
        'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'MGA', 
        'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
        'TWD', // Added TWD to treat as unit-based for this API version/account
        'HUF'
    ];
    if (currency && zeroDecimalCurrencies.includes(currency.toUpperCase())) {
        return 1;
    }
    return 100;
};

// Helper: Generic Metrics Calculator
const calculateMetrics = (
    item: any, 
    level: AdRow['level'], 
    effectiveStatus: string, 
    structInfo: any, // Contains budget, endTime, etc.
    currency: string, // PASSED CURRENCY
    adImageMap?: Map<string, string>, 
    extraProps: Partial<AdRow> = {},
    objective?: string
): AdRow => {
    const actions = item.actions || [];
    const actionValues = item.action_values || [];

    const spend = parseFloat(item.spend) || 0;
    const clicks = parseFloat(item.clicks) || 0; 
    const impressions = parseFloat(item.impressions) || 0;
    const reach = parseFloat(item.reach) || 0;
    const linkClicks = parseFloat(item.inline_link_clicks) || 0;
    const cpm = parseFloat(item.cpm) || 0;
    const frequency = parseFloat(item.frequency) || 0;

    const websitePurchases = parseFloat(actions.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0);

    // Update: Get both value and dynamic label
    const { value: conversions, label: resultType } = getResultData(actions, objective, item.campaign_name || item.ad_name);

    const conversionValueObj = actionValues.find((a: any) => a.action_type === 'purchase') 
      || actionValues.find((a: any) => a.action_type === 'omni_purchase');
    const conversionValue = conversionValueObj ? parseFloat(conversionValueObj.value) : 0;

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    
    const linkCtr = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
    const linkCpc = linkClicks > 0 ? spend / linkClicks : 0;
    
    // CPA & Cost Per Result (Dynamically calculated based on the specific result found)
    const costPerResult = conversions > 0 ? spend / conversions : 0;
    const cpa = websitePurchases > 0 ? spend / websitePurchases : 0;
    
    const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
    const roas = spend > 0 ? conversionValue / spend : 0;

    const imageUrl = adImageMap && item.ad_id ? adImageMap.get(item.ad_id) : undefined;

    // --- Status ---
    const finalStatus = mapStatus(effectiveStatus, structInfo?.stopTime || structInfo?.endTime);

    // --- Budget Logic Fix ---
    let budget = 0;
    let budgetType = '';
    const divider = getBudgetDivider(currency);

    if (structInfo?.daily_budget && parseInt(structInfo.daily_budget) > 0) {
        budget = parseInt(structInfo.daily_budget, 10) / divider;
        budgetType = 'Daily';
    } else if (structInfo?.lifetime_budget && parseInt(structInfo.lifetime_budget) > 0) {
        budget = parseInt(structInfo.lifetime_budget, 10) / divider;
        budgetType = 'Lifetime';
    } else if (level === 'campaign') {
        // ABO Detection
        budgetType = 'ABO'; 
    }

    // 2. Messaging Specific Metrics
    // "Messaging Conversations Started" (開始訊息對話)
    const messagingConversationsStarted = parseFloat(actions.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0);
    
    // "New Messaging Connections" (新的訊息聯繫對象) - Key Fix
    // Try both naming conventions just in case, prioritizing the standard one
    const newMessagingConnections = parseFloat(actions.find((a: any) => 
        a.action_type === 'onsite_conversion.messaging_connection' || 
        a.action_type === 'messaging_connection'
    )?.value || 0);
    
    // "Cost Per New Messaging Connection" (每位新訊息聯繫對象成本) - Calculated
    const costPerNewMessagingConnection = newMessagingConnections > 0 ? spend / newMessagingConnections : 0;

    // 3. Post Engagement Cost (Fixed: Strictly use 'post_engagement' action type)
    // Do not sum up link clicks + reactions manually, rely on Meta's aggregated field if present.
    const postEngagement = parseFloat(actions.find((a: any) => a.action_type === 'post_engagement')?.value || 0);
    const costPerPageEngagement = postEngagement > 0 ? spend / postEngagement : 0;

    return {
        id: `meta-${level}-${item.id || Math.random().toString(36).substr(2, 9)}`,
        originalId: item.id || item.ad_id || item.adset_id || item.campaign_id,
        platform: 'meta',
        level,
        name: item.ad_name || item.adset_name || item.campaign_name || 'Unknown',
        status: finalStatus, 
        impressions, clicks, spend, conversions, conversionValue,
        reach, linkClicks, websitePurchases,
        ctr, cpc, cpa, roas, linkCtr, linkCpc, conversionRate,
        cpm, frequency, costPerResult,
        resultType, // Pass the dynamic label
        
        // New Metrics
        budget,
        budgetType,
        costPerPageEngagement,
        newMessagingConnections,
        costPerNewMessagingConnection,
        messagingConversationsStarted,

        campaignName: item.campaign_name,
        adGroupName: item.adset_name,
        imageUrl,
        ...extraProps
    };
};

// 2. Fetch Data & Creatives & Statuses
export const fetchMetaAdsData = async (
  token: string, 
  accountId: string, 
  startDate: string, 
  endDate: string,
  currency: string // ADDED CURRENCY ARGUMENT
): Promise<AdRow[]> => {
  const timeRange = JSON.stringify({ since: startDate, until: endDate });
  
  // Fields to fetch
  const commonFields = 'campaign_name,adset_name,campaign_id,adset_id,impressions,clicks,spend,actions,action_values,reach,inline_link_clicks,cpm,frequency';

  // Insights calls (Use fetchAllPages)
  const campaignInsightsUrl = `${BASE_URL}/act_${accountId}/insights?` + new URLSearchParams({
    level: 'campaign',
    fields: `${commonFields},objective`, 
    time_range: timeRange,
    limit: '500', 
    access_token: token
  });

  const adsetInsightsUrl = `${BASE_URL}/act_${accountId}/insights?` + new URLSearchParams({
    level: 'adset',
    fields: `${commonFields},objective`,
    time_range: timeRange,
    limit: '500', 
    access_token: token
  });

  const adInsightsUrl = `${BASE_URL}/act_${accountId}/insights?` + new URLSearchParams({
    level: 'ad',
    fields: `${commonFields},ad_name,ad_id,objective`,
    time_range: timeRange,
    limit: '500', 
    access_token: token
  });

  // Structure Status Calls (Use fetchAllPages)
  const campaignsUrl = `${BASE_URL}/act_${accountId}/campaigns?` + new URLSearchParams({
      fields: 'name,effective_status,objective,stop_time,daily_budget,lifetime_budget',
      limit: '500',
      access_token: token
  });
  const adsetsUrl = `${BASE_URL}/act_${accountId}/adsets?` + new URLSearchParams({
      fields: 'name,effective_status,end_time,campaign_id,daily_budget,lifetime_budget',
      limit: '500',
      access_token: token
  });
  const adsUrl = `${BASE_URL}/act_${accountId}/ads?` + new URLSearchParams({
    fields: 'name,effective_status,creative{thumbnail_url,image_url,title,body,object_story_spec},adset_id',
    limit: '500',
    access_token: token
  });

  // Demographics (Use fetchAllPages)
  const genderUrl = `${BASE_URL}/act_${accountId}/insights?` + new URLSearchParams({
    level: 'campaign',
    fields: `${commonFields},objective`,
    breakdowns: 'gender',
    time_range: timeRange,
    limit: '500',
    access_token: token
  });
  const ageUrl = `${BASE_URL}/act_${accountId}/insights?` + new URLSearchParams({
    level: 'campaign',
    fields: `${commonFields},objective`,
    breakdowns: 'age',
    time_range: timeRange,
    limit: '500',
    access_token: token
  });

  // Execute using fetchAllPages for all endpoints
  const [
      campData, setData, adData, 
      campStruct, setStruct, adStruct,
      genderData, ageData
  ] = await Promise.all([
      fetchAllPages(campaignInsightsUrl), fetchAllPages(adsetInsightsUrl), fetchAllPages(adInsightsUrl),
      fetchAllPages(campaignsUrl), fetchAllPages(adsetsUrl), fetchAllPages(adsUrl),
      fetchAllPages(genderUrl), fetchAllPages(ageUrl)
  ]);

  // Note: fetchAllPages returns Array, not { data: [] }. 
  
  // --- Maps ---
  
  interface CampInfo { status: string; objective: string; stopTime?: string; daily_budget?: string; lifetime_budget?: string }
  const campaignMap = new Map<string, CampInfo>();
  (campStruct || []).forEach((c: any) => {
      campaignMap.set(c.id, { 
          status: c.effective_status, 
          objective: c.objective,
          stopTime: c.stop_time,
          daily_budget: c.daily_budget,
          lifetime_budget: c.lifetime_budget
      });
  });

  interface AdSetInfo { status: string; endTime?: string; campaignId?: string; daily_budget?: string; lifetime_budget?: string }
  const adSetMap = new Map<string, AdSetInfo>();
  (setStruct || []).forEach((s: any) => {
      adSetMap.set(s.id, { 
          status: s.effective_status,
          endTime: s.end_time,
          campaignId: s.campaign_id,
          daily_budget: s.daily_budget,
          lifetime_budget: s.lifetime_budget
      });
  });

  const adStatusMap = new Map<string, string>();
  const adImageMap = new Map<string, string>();
  const adParentMap = new Map<string, string>(); 
  (adStruct || []).forEach((ad: any) => {
      adStatusMap.set(ad.id, ad.effective_status);
      adParentMap.set(ad.id, ad.adset_id);
      
      const imgUrl = getCreativeImageUrl(ad.creative);
      if (imgUrl) {
          adImageMap.set(ad.id, imgUrl);
      }
  });

  // --- Process Rows with Currency Passed ---
  
  // 1. Campaign Rows
  const campaignRows = (campData || []).map((item: any) => {
      const info = campaignMap.get(item.campaign_id);
      const status = info?.status || 'UNKNOWN';
      const objective = item.objective || info?.objective;
      return calculateMetrics(item, 'campaign', status, info, currency, undefined, undefined, objective);
  });

  // 2. AdSet Rows
  const adSetRows = (setData || []).map((item: any) => {
      const info = adSetMap.get(item.adset_id);
      const campInfo = campaignMap.get(item.campaign_id); 
      const status = info?.status || 'UNKNOWN';
      const objective = item.objective || campInfo?.objective;
      return calculateMetrics(item, 'adset', status, { stopTime: info?.endTime, ...info }, currency, undefined, undefined, objective);
  });

  // 3. Ad Rows
  const adRows = (adData || []).map((item: any) => {
      const status = adStatusMap.get(item.ad_id) || 'UNKNOWN';
      
      const adSetId = item.adset_id || adParentMap.get(item.ad_id);
      const adSetInfo = adSetId ? adSetMap.get(adSetId) : undefined;
      const campInfo = campaignMap.get(item.campaign_id);

      const objective = item.objective || campInfo?.objective;
      
      return calculateMetrics(item, 'ad', status, { stopTime: adSetInfo?.endTime }, currency, adImageMap, undefined, objective);
  });

  // 4. Demographics
  const genderRows = (genderData || []).map((item: any) => {
    const info = campaignMap.get(item.campaign_id);
    const status = info?.status || 'Active';
    const objective = item.objective || info?.objective;
    return calculateMetrics(item, 'gender', status, undefined, currency, undefined, { 
        name: item.gender === 'unknown' ? '未知' : (item.gender === 'female' ? '女性' : '男性'),
        gender: item.gender 
    }, objective);
  });

  const ageRows = (ageData || []).map((item: any) => {
      const info = campaignMap.get(item.campaign_id);
      const status = info?.status || 'Active';
      const objective = item.objective || info?.objective;
      return calculateMetrics(item, 'age', status, undefined, currency, undefined, { 
          name: item.age,
          age: item.age 
      }, objective);
  });

  return [...campaignRows, ...adSetRows, ...adRows, ...genderRows, ...ageRows];
};
