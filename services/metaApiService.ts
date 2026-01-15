
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

// 1. Fetch Ad Accounts
export const fetchAdAccounts = async (token: string): Promise<MetaAccount[]> => {
  const url = `${BASE_URL}/me/adaccounts?fields=name,account_id,currency&limit=100&access_token=${token}`;
  const data = await fetchWithRetry(url);
  return data.data || [];
};

// Helper: Determine the "Result" value based on objective and actions
const getResultValue = (actions: any[], objective?: string): number => {
    if (!actions || actions.length === 0) return 0;

    const findVal = (type: string) => {
        const item = actions.find((a: any) => a.action_type === type);
        return item ? parseFloat(item.value) : 0;
    };

    // 1. Hard Conversions (Sales/Leads)
    const purchase = findVal('purchase') || findVal('omni_purchase') || findVal('offsite_conversion.fb_pixel_purchase');
    if (purchase > 0) return purchase;

    const leads = findVal('lead');
    if (leads > 0) return leads;

    const completedReg = findVal('complete_registration');
    if (completedReg > 0) return completedReg;

    // 2. Objective-based Fallbacks
    if (objective) {
        if (objective.includes('MESSAGES') || objective === 'OUTCOME_ENGAGEMENT') {
             const msg = findVal('onsite_conversion.messaging_conversation_started_7d');
             if (msg > 0) return msg;
        }
        if (objective === 'OUTCOME_TRAFFIC') {
             const lp = findVal('omni_landing_page_view') || findVal('landing_page_view') || findVal('link_click');
             if (lp > 0) return lp;
        }
        if (objective === 'OUTCOME_AWARENESS') {
             const thru = findVal('video_thruplay_watched_actions');
             if (thru > 0) return thru;
        }
    }

    // 3. General Priority
    const messaging = findVal('onsite_conversion.messaging_conversation_started_7d');
    if (messaging > 0) return messaging;

    const thruPlay = findVal('video_thruplay_watched_actions');
    if (thruPlay > 0) return thruPlay;

    const lpView = findVal('omni_landing_page_view') || findVal('landing_page_view');
    if (lpView > 0) return lpView;
    
    return 0;
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
// Logic: If currency is TWD, JPY, etc., API usually returns units (150 = 150), so divider is 1.
// For USD, EUR, API returns cents (150 = 1.50), so divider is 100.
// Note: This logic is tuned based on user feedback that TWD is appearing divided by 100 incorrectly.
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

    const conversions = getResultValue(actions, objective);

    const conversionValueObj = actionValues.find((a: any) => a.action_type === 'purchase') 
      || actionValues.find((a: any) => a.action_type === 'omni_purchase');
    const conversionValue = conversionValueObj ? parseFloat(conversionValueObj.value) : 0;

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    
    const linkCtr = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
    const linkCpc = linkClicks > 0 ? spend / linkClicks : 0;
    
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

    // 2. Messaging
    const messagingConversationsStarted = parseFloat(actions.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0);
    const newMessagingConnections = parseFloat(actions.find((a: any) => a.action_type === 'onsite_conversion.messaging_connection' || a.action_type === 'messaging_conversation_started_7d')?.value || 0);
    const costPerNewMessagingConnection = newMessagingConnections > 0 ? spend / newMessagingConnections : 0;

    // 3. Post Engagement Cost
    const postEngagement = parseFloat(actions.find((a: any) => a.action_type === 'post_engagement' || a.action_type === 'link_click' || a.action_type === 'post_reaction' || a.action_type === 'comment' || a.action_type === 'post_share')?.value || 0);
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

  // Insights calls
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

  // Structure Status Calls
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

  // Demographics
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

  // Execute
  const [
      campData, setData, adData, 
      campStruct, setStruct, adStruct,
      genderData, ageData
  ] = await Promise.all([
      fetchWithRetry(campaignInsightsUrl), fetchWithRetry(adsetInsightsUrl), fetchWithRetry(adInsightsUrl),
      fetchWithRetry(campaignsUrl), fetchWithRetry(adsetsUrl), fetchWithRetry(adsUrl),
      fetchWithRetry(genderUrl), fetchWithRetry(ageUrl)
  ]);

  if (campData.error) throw new Error(`Meta API Error: ${campData.error.message}`);

  // --- Maps ---
  
  interface CampInfo { status: string; objective: string; stopTime?: string; daily_budget?: string; lifetime_budget?: string }
  const campaignMap = new Map<string, CampInfo>();
  (campStruct.data || []).forEach((c: any) => {
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
  (setStruct.data || []).forEach((s: any) => {
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
  (adStruct.data || []).forEach((ad: any) => {
      adStatusMap.set(ad.id, ad.effective_status);
      adParentMap.set(ad.id, ad.adset_id);
      
      const imgUrl = getCreativeImageUrl(ad.creative);
      if (imgUrl) {
          adImageMap.set(ad.id, imgUrl);
      }
  });

  // --- Process Rows with Currency Passed ---
  
  // 1. Campaign Rows
  const campaignRows = (campData.data || []).map((item: any) => {
      const info = campaignMap.get(item.campaign_id);
      const status = info?.status || 'UNKNOWN';
      const objective = item.objective || info?.objective;
      return calculateMetrics(item, 'campaign', status, info, currency, undefined, undefined, objective);
  });

  // 2. AdSet Rows
  const adSetRows = (setData.data || []).map((item: any) => {
      const info = adSetMap.get(item.adset_id);
      const campInfo = campaignMap.get(item.campaign_id); 
      const status = info?.status || 'UNKNOWN';
      const objective = item.objective || campInfo?.objective;
      return calculateMetrics(item, 'adset', status, { stopTime: info?.endTime, ...info }, currency, undefined, undefined, objective);
  });

  // 3. Ad Rows
  const adRows = (adData.data || []).map((item: any) => {
      const status = adStatusMap.get(item.ad_id) || 'UNKNOWN';
      
      const adSetId = item.adset_id || adParentMap.get(item.ad_id);
      const adSetInfo = adSetId ? adSetMap.get(adSetId) : undefined;
      const campInfo = campaignMap.get(item.campaign_id);

      const objective = item.objective || campInfo?.objective;
      
      return calculateMetrics(item, 'ad', status, { stopTime: adSetInfo?.endTime }, currency, adImageMap, undefined, objective);
  });

  // 4. Demographics
  const genderRows = (genderData.data || []).map((item: any) => {
    const info = campaignMap.get(item.campaign_id);
    const status = info?.status || 'Active';
    const objective = item.objective || info?.objective;
    return calculateMetrics(item, 'gender', status, undefined, currency, undefined, { 
        name: item.gender === 'unknown' ? '未知' : (item.gender === 'female' ? '女性' : '男性'),
        gender: item.gender 
    }, objective);
  });

  const ageRows = (ageData.data || []).map((item: any) => {
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
