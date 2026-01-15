
import { AdRow } from '../types';

const API_VERSION = 'v22.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

interface MetaAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
}

// 1. Fetch Ad Accounts
export const fetchAdAccounts = async (token: string): Promise<MetaAccount[]> => {
  const url = `${BASE_URL}/me/adaccounts?fields=name,account_id,currency&limit=100&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
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

// Helper: Generic Metrics Calculator
const calculateMetrics = (
    item: any, 
    level: AdRow['level'], 
    effectiveStatus: string, // Raw effective_status from API
    endTime: string | null | undefined, // ISO string for stop_time/end_time
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

    // --- Status Logic Fix ---
    // 1. Normalize effective status
    let finalStatus = effectiveStatus ? (effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1).toLowerCase()) : 'Unknown';
    
    // 2. Check for "Completed" based on End Time
    // Only check if currently Active/In_Process to avoid overriding "Archived" or "Deleted"
    const isActiveStatus = ['Active', 'In_process', 'With_issues'].includes(finalStatus);
    
    if (isActiveStatus && endTime) {
        const end = new Date(endTime).getTime();
        const now = Date.now();
        // If end time is in the past, it's Completed
        if (end < now) {
            finalStatus = 'Completed';
        }
    }

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
  endDate: string
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

  // Structure Status Calls - NOW FETCHING TIME
  // Campaign: stop_time
  const campaignsUrl = `${BASE_URL}/act_${accountId}/campaigns?` + new URLSearchParams({
      fields: 'name,effective_status,objective,stop_time',
      limit: '500',
      access_token: token
  });
  // AdSet: end_time
  const adsetsUrl = `${BASE_URL}/act_${accountId}/adsets?` + new URLSearchParams({
      fields: 'name,effective_status,end_time,campaign_id',
      limit: '500',
      access_token: token
  });
  // Ads: status from Ad (inherits usually, but good to check)
  const adsUrl = `${BASE_URL}/act_${accountId}/ads?` + new URLSearchParams({
    fields: 'name,effective_status,creative{thumbnail_url,image_url,title,body},adset_id',
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
      campRes, setRes, adRes, 
      campStructRes, setStructRes, adStructRes,
      genderRes, ageRes
  ] = await Promise.all([
      fetch(campaignInsightsUrl), fetch(adsetInsightsUrl), fetch(adInsightsUrl),
      fetch(campaignsUrl), fetch(adsetsUrl), fetch(adsUrl),
      fetch(genderUrl), fetch(ageUrl)
  ]);

  const campData = await campRes.json();
  const setData = await setRes.json();
  const adData = await adRes.json();
  
  const campStruct = await campStructRes.json();
  const setStruct = await setStructRes.json();
  const adStruct = await adStructRes.json();
  
  const genderData = await genderRes.json();
  const ageData = await ageRes.json();

  if (campData.error) throw new Error(`Meta API Error: ${campData.error.message}`);

  // --- Maps ---
  // Store Status, Objective, AND End Time
  
  interface CampInfo { status: string; objective: string; stopTime?: string }
  const campaignMap = new Map<string, CampInfo>();
  (campStruct.data || []).forEach((c: any) => {
      campaignMap.set(c.id, { 
          status: c.effective_status, 
          objective: c.objective,
          stopTime: c.stop_time
      });
  });

  interface AdSetInfo { status: string; endTime?: string; campaignId?: string }
  const adSetMap = new Map<string, AdSetInfo>();
  (setStruct.data || []).forEach((s: any) => {
      adSetMap.set(s.id, { 
          status: s.effective_status,
          endTime: s.end_time,
          campaignId: s.campaign_id
      });
  });

  const adStatusMap = new Map<string, string>();
  const adImageMap = new Map<string, string>();
  const adParentMap = new Map<string, string>(); // Map Ad to AdSet to find end time
  (adStruct.data || []).forEach((ad: any) => {
      adStatusMap.set(ad.id, ad.effective_status);
      adParentMap.set(ad.id, ad.adset_id);
      if (ad.creative && (ad.creative.image_url || ad.creative.thumbnail_url)) {
          adImageMap.set(ad.id, ad.creative.image_url || ad.creative.thumbnail_url);
      }
  });

  // --- Process Rows ---
  
  // 1. Campaign Rows
  const campaignRows = (campData.data || []).map((item: any) => {
      const info = campaignMap.get(item.campaign_id);
      const status = info?.status || 'UNKNOWN';
      const objective = item.objective || info?.objective;
      return calculateMetrics(item, 'campaign', status, info?.stopTime, undefined, undefined, objective);
  });

  // 2. AdSet Rows
  const adSetRows = (setData.data || []).map((item: any) => {
      const info = adSetMap.get(item.adset_id);
      const campInfo = campaignMap.get(item.campaign_id); // Fallback objective
      const status = info?.status || 'UNKNOWN';
      const objective = item.objective || campInfo?.objective;
      return calculateMetrics(item, 'adset', status, info?.endTime, undefined, undefined, objective);
  });

  // 3. Ad Rows
  const adRows = (adData.data || []).map((item: any) => {
      const status = adStatusMap.get(item.ad_id) || 'UNKNOWN';
      
      // Get Parent AdSet Info for End Time logic
      const adSetId = item.adset_id || adParentMap.get(item.ad_id);
      const adSetInfo = adSetId ? adSetMap.get(adSetId) : undefined;
      const campInfo = campaignMap.get(item.campaign_id);

      const objective = item.objective || campInfo?.objective;
      
      return calculateMetrics(item, 'ad', status, adSetInfo?.endTime, adImageMap, undefined, objective);
  });

  // 4. Demographics
  const genderRows = (genderData.data || []).map((item: any) => {
    const info = campaignMap.get(item.campaign_id);
    const status = info?.status || 'Active';
    const objective = item.objective || info?.objective;
    return calculateMetrics(item, 'gender', status, undefined, undefined, { 
        name: item.gender === 'unknown' ? '未知' : (item.gender === 'female' ? '女性' : '男性'),
        gender: item.gender 
    }, objective);
  });

  const ageRows = (ageData.data || []).map((item: any) => {
      const info = campaignMap.get(item.campaign_id);
      const status = info?.status || 'Active';
      const objective = item.objective || info?.objective;
      return calculateMetrics(item, 'age', status, undefined, undefined, { 
          name: item.age,
          age: item.age 
      }, objective);
  });

  return [...campaignRows, ...adSetRows, ...adRows, ...genderRows, ...ageRows];
};
