
import { AdRow, AdCreativeDetails } from '../types';

const API_VERSION = 'v22.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

interface MetaAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, retries = 3, backoff = 1000): Promise<any> => {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.error) {
                if ([17, 4, 32, 613].includes(data.error.code)) {
                    console.warn(`Meta API Rate Limit hit. Retrying in ${backoff}ms...`);
                    if (i < retries - 1) {
                        await wait(backoff * (i + 1));
                        continue;
                    }
                }
                if (data.error.code === 190) {
                    throw new Error("Access Token 已失效或過期，請重新取得 Token。");
                }
                throw new Error(data.error.message || "Unknown Meta API Error");
            }
            return data;
        } catch (err: any) {
            if (i < retries - 1) {
                console.warn(`Network request failed. Retrying... (${i + 1}/${retries})`);
                await wait(backoff);
                continue;
            }
            throw err;
        }
    }
};

const fetchAllPages = async (initialUrl: string): Promise<any[]> => {
    let allData: any[] = [];
    let nextUrl = initialUrl;
    let pageCount = 0;
    while (nextUrl && pageCount < 30) { 
        const response = await fetchWithRetry(nextUrl);
        if (response.data) allData = [...allData, ...response.data];
        if (response.paging && response.paging.next) {
            nextUrl = response.paging.next;
            pageCount++;
        } else {
            nextUrl = '';
        }
    }
    return allData;
};

export const fetchAdAccounts = async (token: string): Promise<MetaAccount[]> => {
  const url = `${BASE_URL}/me/adaccounts?fields=name,account_id,currency&limit=100&access_token=${token}`;
  const data = await fetchWithRetry(url);
  return data.data || [];
};

// --- NEW: Fetch Real Ad Preview HTML ---
export const fetchAdPreviewHtml = async (adId: string, token: string): Promise<string | null> => {
    const url = `${BASE_URL}/${adId}/previews?ad_format=MOBILE_FEED_STANDARD&access_token=${token}`;
    try {
        const data = await fetchWithRetry(url);
        if (data.data && data.data.length > 0) {
            return data.data[0].body; // The <iframe> string
        }
        return null;
    } catch (e) {
        console.error("Failed to fetch ad preview", e);
        return null;
    }
};

// --- ADVANCED LOGIC CONSTANTS ---

const ACTION_WEIGHTS: Record<string, number> = {
    'purchase': 10.0,
    'offsite_conversion.fb_pixel_purchase': 10.0,
    'omni_purchase': 10.0,
    'lead': 5.0,
    'on_facebook_lead': 5.0,
    'offsite_conversion.lead': 5.0,
    'onsite_conversion.messaging_conversation_started_7d': 4.0, 
    'onsite_conversion.messaging_first_reply': 4.0,
    'onsite_conversion.messaging_connection': 3.5, 
    'messaging_connection': 3.5, 
    'video_thruplay_watched_actions': 2.0, 
    'video_view': 1.8, 
    'omni_landing_page_view': 1.5,
    'landing_page_view': 1.5,
    'link_click': 1.2,
    'post_engagement': 0.1, 
    'page_engagement': 0.1,
    'like': 0.1
};

const KEYWORD_MAPPING: Record<string, string[]> = {
    'video': ['video_thruplay_watched_actions', 'video_view', 'video_p75_watched_actions'],
    '影片': ['video_thruplay_watched_actions', 'video_view', 'video_p75_watched_actions'],
    '觀影': ['video_thruplay_watched_actions', 'video_view', 'video_p75_watched_actions'],
    'thruplay': ['video_thruplay_watched_actions'],
    'message': ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply', 'onsite_conversion.messaging_connection', 'messaging_connection'],
    'messaging': ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply', 'onsite_conversion.messaging_connection', 'messaging_connection'],
    '訊息': ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply', 'onsite_conversion.messaging_connection', 'messaging_connection'],
    '對話': ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply', 'onsite_conversion.messaging_connection', 'messaging_connection'],
    'traffic': ['omni_landing_page_view', 'landing_page_view', 'link_click'],
    '流量': ['omni_landing_page_view', 'landing_page_view', 'link_click'],
    'lp': ['omni_landing_page_view', 'landing_page_view'],
    'lead': ['on_facebook_lead', 'lead', 'offsite_conversion.lead'],
    '名單': ['on_facebook_lead', 'lead', 'offsite_conversion.lead'],
    'purchase': ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'],
    '購買': ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'],
    '轉換': ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'],
};

const GOAL_TO_ACTION_MAP: Record<string, string[]> = {
    'THRUPLAY': ['video_thruplay_watched_actions'],
    'VIDEO_VIEWS': ['video_view'],
    'LANDING_PAGE_VIEWS': ['omni_landing_page_view', 'landing_page_view'],
    'LINK_CLICKS': ['link_click'],
    'POST_ENGAGEMENT': ['post_engagement'],
    'MESSAGES': ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_connection', 'messaging_connection'],
    'LEAD_GENERATION': ['on_facebook_lead', 'lead'],
    'OFFSITE_CONVERSIONS': ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase', 'lead'],
    'CONVERSIONS': ['purchase', 'omni_purchase'],
    'VALUE': ['purchase', 'omni_purchase']
};

const getActionLabel = (type: string): string => {
    if (!type) return '成果';
    if (type.includes('thruplay')) return 'ThruPlay';
    if (type.includes('landing_page_view')) return '連結頁面瀏覽';
    if (type === 'link_click') return '連結點擊';
    if (type.includes('purchase')) return '網站購買';
    if (type.includes('lead')) return '潛在客戶';
    if (type.includes('messaging_conversation_started')) return '開始訊息對話';
    if (type.includes('messaging_connection')) return '訊息聯繫';
    if (type.includes('post_engagement')) return '貼文互動';
    if (type === 'like') return '粉絲專頁按讚';
    if (type.includes('video_view')) return '影片觀看';
    if (type === 'reach') return '觸及人數';
    if (type === 'impressions') return '曝光次數';
    return type;
};

const getActionValue = (actions: any[], actionType: string): number => {
    if (!actions || actions.length === 0) return 0;
    const action = actions.find((a: any) => a.action_type === actionType);
    return action ? parseFloat(action.value) : 0;
};

const getPrimaryResult = (
    item: any, 
    optGoal: string | undefined, 
    objective: string | undefined
): { value: number, actionType: string, label: string, debugInfo: string } => {
    const rawActions = item.actions || [];
    const name = (item.ad_name || item.adset_name || item.campaign_name || '').toLowerCase();
    const objUpper = (objective || '').toUpperCase();

    const actionDict: Record<string, number> = {};
    for (const act of rawActions) {
        const val = parseFloat(act.value);
        const atype = act.action_type;
        if (['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase', 'onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_connection', 'messaging_connection'].includes(atype)) {
             if (val > 0) actionDict[atype] = val;
        } else if (val > 3) {
             actionDict[atype] = val;
        }
    }

    if (optGoal === 'REACH' && !actionDict['reach']) return { value: parseFloat(item.reach || 0), actionType: 'reach', label: '觸及人數', debugInfo: 'GOAL: REACH' };
    if (optGoal === 'IMPRESSIONS' && !actionDict['impressions']) return { value: parseFloat(item.impressions || 0), actionType: 'impressions', label: '曝光次數', debugInfo: 'GOAL: IMPRESSIONS' };

    if (Object.keys(actionDict).length === 0) {
        return { value: 0, actionType: '', label: '成果', debugInfo: 'no valid actions' };
    }

    let bestKeywordMatch: string | null = null;
    let maxKeywordVal = -1;

    for (const [kw, candidates] of Object.entries(KEYWORD_MAPPING)) {
        if (name.includes(kw)) {
            if (optGoal && GOAL_TO_ACTION_MAP[optGoal]) {
                const goalTargets = GOAL_TO_ACTION_MAP[optGoal];
                const matchingGoal = candidates.find(c => goalTargets.includes(c) && actionDict[c] > 0);
                if (matchingGoal) {
                    return {
                        value: actionDict[matchingGoal],
                        actionType: matchingGoal,
                        label: getActionLabel(matchingGoal),
                        debugInfo: `matched KEYWORD + GOAL: ${matchingGoal}`
                    };
                }
            }
            for (const cand of candidates) {
                const val = actionDict[cand] || 0;
                if (val > maxKeywordVal) {
                    maxKeywordVal = val;
                    bestKeywordMatch = cand;
                }
            }
        }
    }

    if (bestKeywordMatch && maxKeywordVal > 0) {
        return { 
            value: maxKeywordVal, 
            actionType: bestKeywordMatch, 
            label: getActionLabel(bestKeywordMatch),
            debugInfo: `matched KEYWORD (MAX): ${bestKeywordMatch}` 
        };
    }

    if (optGoal && GOAL_TO_ACTION_MAP[optGoal]) {
        for (const type of GOAL_TO_ACTION_MAP[optGoal]) {
            if (actionDict[type] > 0) {
                 return {
                    value: actionDict[type],
                    actionType: type,
                    label: getActionLabel(type),
                    debugInfo: `matched GOAL: ${optGoal}`
                 };
            }
        }
    }

    if (objUpper === 'OUTCOME_ENGAGEMENT' || objUpper === 'POST_ENGAGEMENT') {
        const candidates: string[] = [];
        KEYWORD_MAPPING['message'].forEach(k => { if(actionDict[k]) candidates.push(k); });
        KEYWORD_MAPPING['video'].forEach(k => { if(actionDict[k]) candidates.push(k); });
        if (actionDict['post_engagement']) candidates.push('post_engagement');

        let bestCand: string | null = null;
        let maxScore = -1;

        for (const cand of candidates) {
            const val = actionDict[cand];
            const weight = ACTION_WEIGHTS[cand] || 1.0;
            const score = val * weight;
            if (score > maxScore) {
                maxScore = score;
                bestCand = cand;
            }
        }

        if (bestCand) {
            return {
                value: actionDict[bestCand],
                actionType: bestCand,
                label: getActionLabel(bestCand),
                debugInfo: `matched OBJECTIVE_WEIGHT: ${bestCand}`
            };
        }
    }

    let bestFallback: string | null = null;
    let maxFallbackScore = -1;

    for (const [atype, val] of Object.entries(actionDict)) {
        const weight = ACTION_WEIGHTS[atype] || 1.0;
        const score = val * weight;
        if (score > maxFallbackScore) {
            maxFallbackScore = score;
            bestFallback = atype;
        }
    }

    if (bestFallback) {
        return {
            value: actionDict[bestFallback],
            actionType: bestFallback,
            label: getActionLabel(bestFallback),
            debugInfo: `fallback MAX_WEIGHT: ${bestFallback}`
        };
    }

    return { value: 0, actionType: '', label: '成果', debugInfo: 'none' };
};

const calculateCPA = (item: any, actionType: string, resultValue: number): number => {
    if (resultValue <= 0) return 0;
    if (item.cost_per_action_type && Array.isArray(item.cost_per_action_type)) {
        const cpaObj = item.cost_per_action_type.find((c: any) => c.action_type === actionType);
        if (cpaObj) {
            return parseFloat(cpaObj.value);
        }
    }
    const spend = parseFloat(item.spend || 0);
    return spend / resultValue;
};

// --- CREATIVE PARSING LOGIC ---

const extractCreativeDetails = (creative: any): AdCreativeDetails | undefined => {
    if (!creative) return undefined;
    
    // Initialize vars
    let imageUrl: string | undefined = undefined;
    let thumbnailUrl = creative.thumbnail_url; // Fallback
    let title = creative.title;
    let body = creative.body;
    let linkDescription = creative.link_description;
    let callToAction = creative.call_to_action_type;
    const pageId = creative.actor_id;

    // 1. Prioritize Object Story Spec (Standard Ads & Video)
    const spec = creative.object_story_spec;
    if (spec) {
        // Link Data
        if (spec.link_data) {
            const ld = spec.link_data;
            // Handle Carousel (child_attachments)
            if (ld.child_attachments && ld.child_attachments.length > 0) {
                const firstChild = ld.child_attachments[0];
                if (firstChild.picture) imageUrl = firstChild.picture;
                // If main title/body is missing, grab from first child
                if (!body) body = firstChild.description || firstChild.name; // Carousel usually puts text in name/description
                if (!title) title = firstChild.name;
            } else {
                // Standard Single Image
                if (ld.full_picture) imageUrl = ld.full_picture; // Highest Res
                else if (ld.picture) imageUrl = ld.picture;
            }

            if (!body) body = ld.message;
            if (!title) title = ld.name;
            if (!linkDescription) linkDescription = ld.description;
            if (ld.call_to_action) callToAction = ld.call_to_action.type;
        } 
        // Video Data
        else if (spec.video_data) {
             const vd = spec.video_data;
             if (vd.image_url) imageUrl = vd.image_url; // Video Poster
             if (!body) body = vd.message; 
             if (!title) title = vd.title;
             if (vd.call_to_action) callToAction = vd.call_to_action.type;
        }
    }
    
    // 2. Fallback for Asset Feed (Dynamic Creative / DCO)
    if (creative.asset_feed_spec) {
        const afs = creative.asset_feed_spec;
        
        // Dynamic Images: check 'ad_images' or 'images'
        if (!imageUrl) {
            if (afs.images && afs.images.length > 0) imageUrl = afs.images[0].url;
            else if (afs.ad_images && afs.ad_images.length > 0) imageUrl = afs.ad_images[0].url;
        }
        
        // Dynamic Bodies (Text)
        if (!body && afs.bodies && afs.bodies.length > 0) body = afs.bodies[0].text;
        
        // Dynamic Titles
        if (!title && afs.titles && afs.titles.length > 0) title = afs.titles[0].text;
        
        // Dynamic Link Description
        if (!linkDescription) {
             if (afs.link_urls && afs.link_urls.length > 0) linkDescription = afs.link_urls[0].website_url;
             else if (afs.descriptions && afs.descriptions.length > 0) linkDescription = afs.descriptions[0].text;
        }
    }

    // 3. Last resort fallback to top-level properties
    // IMPORTANT: Avoid thumbnail_url if possible as it might be a low-res logo.
    if (!imageUrl) {
        if (creative.image_url) imageUrl = creative.image_url;
        else if (creative.thumbnail_url) imageUrl = creative.thumbnail_url;
    }
    
    // Clean up CTA
    if (callToAction) {
        callToAction = callToAction.replace(/_/g, ' '); // LEARN_MORE -> LEARN MORE
    }

    return {
        title,
        body,
        linkDescription,
        callToAction,
        imageUrl,
        thumbnailUrl,
        pageId
    };
};

const mapStatus = (effectiveStatus: string, stopTime?: string): string => {
    const isRunning = ['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES'].includes(effectiveStatus);
    if (isRunning && stopTime) {
        const end = new Date(stopTime).getTime();
        const now = Date.now();
        if (end < now) return '已完成';
    }
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

const getBudgetDivider = (currency: string): number => {
    const zeroDecimalCurrencies = ['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF', 'HUF'];
    if (currency && zeroDecimalCurrencies.includes(currency.toUpperCase())) return 1;
    return 100;
};

const calculateMetrics = (item: any, level: AdRow['level'], effectiveStatus: string, structInfo: any, currency: string, adCreativeMap?: Map<string, any>, extraProps: Partial<AdRow> = {}, objective?: string, optGoal?: string): AdRow => {
    const actions = item.actions || [];
    const actionValues = item.action_values || [];

    const spend = parseFloat(item.spend) || 0;
    const clicks = parseFloat(item.clicks) || 0; 
    const impressions = parseFloat(item.impressions) || 0;
    const reach = parseFloat(item.reach) || 0;
    const linkClicks = parseFloat(item.inline_link_clicks) || 0;
    const cpm = parseFloat(item.cpm) || 0;
    const frequency = parseFloat(item.frequency) || 0;

    const findVal = (type: string) => getActionValue(actions, type);

    const websitePurchases = findVal('offsite_conversion.fb_pixel_purchase') || findVal('purchase') || findVal('omni_purchase');
    
    const videoViews = findVal('video_view'); 
    const landingPageViews = findVal('landing_page_view') || findVal('omni_landing_page_view');

    const { value: conversions, actionType: resultActionType, label: resultType, debugInfo } = getPrimaryResult(item, optGoal, objective);
    
    const costPerResult = calculateCPA(item, resultActionType, conversions);

    const conversionValueObj = actionValues.find((a: any) => a.action_type === 'purchase') || actionValues.find((a: any) => a.action_type === 'omni_purchase');
    const conversionValue = conversionValueObj ? parseFloat(conversionValueObj.value) : 0;

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const linkCtr = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
    const linkCpc = linkClicks > 0 ? spend / linkClicks : 0;
    
    let cpa = 0;
    if (websitePurchases > 0) {
        cpa = calculateCPA(item, 'purchase', websitePurchases);
    } else if (conversions > 0) {
        cpa = costPerResult; 
    }
    
    const conversionMetricTypes = ['purchase', 'lead', 'messaging', 'schedule', 'contact', 'complete_registration', 'submit_application'];
    const isConversionType = conversionMetricTypes.some(k => resultActionType.toLowerCase().includes(k));

    const cvrNumerator = isConversionType ? conversions : websitePurchases;
    const cvrDenominator = linkClicks > 0 ? linkClicks : clicks;
    const conversionRate = cvrDenominator > 0 ? (cvrNumerator / cvrDenominator) * 100 : 0;
    
    const roas = spend > 0 ? conversionValue / spend : 0;

    // Creative Data
    let creative: AdCreativeDetails | undefined = undefined;
    let imageUrl: string | undefined = undefined;

    if (level === 'ad') {
        const rawCreative = adCreativeMap && item.ad_id ? adCreativeMap.get(item.ad_id) : undefined;
        if (rawCreative) {
            creative = extractCreativeDetails(rawCreative);
            imageUrl = creative?.imageUrl || creative?.thumbnailUrl;
        }
    }

    const finalStatus = mapStatus(effectiveStatus, structInfo?.stopTime || structInfo?.endTime);

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
        budgetType = 'ABO'; 
    }

    const messagingConversationsStarted = findVal('onsite_conversion.messaging_conversation_started_7d');
    
    let msgConnKey = 'onsite_conversion.messaging_connection';
    let newMessagingConnections = findVal(msgConnKey);
    if (!newMessagingConnections) {
        msgConnKey = 'messaging_connection';
        newMessagingConnections = findVal(msgConnKey);
    }
    
    const costPerNewMessagingConnection = calculateCPA(item, msgConnKey, newMessagingConnections);

    const postEngagement = findVal('post_engagement');
    const costPerPageEngagement = calculateCPA(item, 'post_engagement', postEngagement);

    return {
        id: `meta-${level}-${item.id || Math.random().toString(36).substr(2, 9)}`,
        originalId: item.id || item.ad_id || item.adset_id || item.campaign_id,
        platform: 'meta',
        level,
        name: item.ad_name || item.adset_name || item.campaign_name || 'Unknown',
        status: finalStatus, 
        impressions, clicks, spend, conversions, conversionValue,
        reach, linkClicks, websitePurchases, videoViews, landingPageViews,
        ctr, cpc, cpa, roas, linkCtr, linkCpc, conversionRate,
        cpm, frequency, costPerResult,
        resultType,
        budget,
        budgetType,
        optimizationGoal: optGoal,
        costPerPageEngagement,
        newMessagingConnections,
        costPerNewMessagingConnection,
        messagingConversationsStarted,
        campaignName: item.campaign_name,
        adGroupName: item.adset_name,
        imageUrl,
        creative, // Structured Data
        objective,
        rawActions: actions,
        costPerActionType: item.cost_per_action_type || [], 
        primaryActionType: resultActionType, 
        debugInfo,
        ...extraProps
    };
};

export const fetchMetaAdsData = async (token: string, accountId: string, startDate: string, endDate: string, currency: string): Promise<AdRow[]> => {
  const timeRange = JSON.stringify({ since: startDate, until: endDate });
  
  const commonFields = 'campaign_name,adset_name,campaign_id,adset_id,impressions,clicks,spend,actions,action_values,cost_per_action_type,reach,inline_link_clicks,cpm,frequency';
  
  const params = new URLSearchParams({
      time_range: timeRange,
      limit: '500',
      access_token: token,
      use_unified_attribution_setting: 'true',
  });

  const buildUrl = (level: string, extraFields: string = '') => {
      const p = new URLSearchParams(params);
      p.append('level', level);
      p.append('fields', `${commonFields},objective${extraFields}`);
      return `${BASE_URL}/act_${accountId}/insights?${p.toString()}`;
  };

  const campaignInsightsUrl = buildUrl('campaign');
  const adsetInsightsUrl = buildUrl('adset');
  const adInsightsUrl = buildUrl('ad', ',ad_name,ad_id');
  
  const campaignsUrl = `${BASE_URL}/act_${accountId}/campaigns?` + new URLSearchParams({ fields: 'name,effective_status,objective,stop_time,daily_budget,lifetime_budget', limit: '500', access_token: token });
  const adsetsUrl = `${BASE_URL}/act_${accountId}/adsets?` + new URLSearchParams({ fields: 'name,effective_status,end_time,campaign_id,daily_budget,lifetime_budget,optimization_goal', limit: '500', access_token: token });
  
  // Update: Fetch deep creative fields including actor_id for page info
  // Added: child_attachments for Carousel
  const adsUrl = `${BASE_URL}/act_${accountId}/ads?` + new URLSearchParams({ fields: 'name,effective_status,creative{actor_id,thumbnail_url,image_url,title,body,object_story_spec,link_url,call_to_action_type,asset_feed_spec},adset_id', limit: '500', access_token: token });
  
  const genderUrl = buildUrl('campaign') + '&breakdowns=gender';
  const ageUrl = buildUrl('campaign') + '&breakdowns=age';

  const [campData, setData, adData, campStruct, setStruct, adStruct, genderData, ageData] = await Promise.all([
      fetchAllPages(campaignInsightsUrl), fetchAllPages(adsetInsightsUrl), fetchAllPages(adInsightsUrl),
      fetchAllPages(campaignsUrl), fetchAllPages(adsetsUrl), fetchAllPages(adsUrl),
      fetchAllPages(genderUrl), fetchAllPages(ageUrl)
  ]);

  interface CampInfo { status: string; objective: string; stopTime?: string; daily_budget?: string; lifetime_budget?: string }
  const campaignMap = new Map<string, CampInfo>();
  (campStruct || []).forEach((c: any) => {
      campaignMap.set(c.id, { status: c.effective_status, objective: c.objective, stopTime: c.stop_time, daily_budget: c.daily_budget, lifetime_budget: c.lifetime_budget });
  });

  interface AdSetInfo { status: string; endTime?: string; campaignId?: string; daily_budget?: string; lifetime_budget?: string; optimization_goal?: string }
  const adSetMap = new Map<string, AdSetInfo>();
  (setStruct || []).forEach((s: any) => {
      adSetMap.set(s.id, { 
          status: s.effective_status, 
          endTime: s.end_time, 
          campaignId: s.campaign_id, 
          daily_budget: s.daily_budget, 
          lifetime_budget: s.lifetime_budget,
          optimization_goal: s.optimization_goal
      });
  });

  const adStatusMap = new Map<string, string>();
  const adCreativeMap = new Map<string, any>(); // Store the whole creative object
  const adParentMap = new Map<string, string>(); 

  (adStruct || []).forEach((ad: any) => {
      adStatusMap.set(ad.id, ad.effective_status);
      adParentMap.set(ad.id, ad.adset_id);
      if (ad.creative) adCreativeMap.set(ad.id, ad.creative);
  });

  const campaignRows = (campData || []).map((item: any) => {
      const info = campaignMap.get(item.campaign_id);
      return calculateMetrics(item, 'campaign', info?.status || 'UNKNOWN', info, currency, undefined, undefined, item.objective || info?.objective, undefined);
  });

  const adSetRows = (setData || []).map((item: any) => {
      const info = adSetMap.get(item.adset_id);
      const campInfo = campaignMap.get(item.campaign_id); 
      return calculateMetrics(item, 'adset', info?.status || 'UNKNOWN', { stopTime: info?.endTime, ...info }, currency, undefined, undefined, item.objective || campInfo?.objective, info?.optimization_goal);
  });

  const adRows = (adData || []).map((item: any) => {
      const status = adStatusMap.get(item.ad_id) || 'UNKNOWN';
      const adSetId = item.adset_id || adParentMap.get(item.ad_id);
      const adSetInfo = adSetId ? adSetMap.get(adSetId) : undefined;
      const campInfo = campaignMap.get(item.campaign_id);
      return calculateMetrics(item, 'ad', status, { stopTime: adSetInfo?.endTime }, currency, adCreativeMap, undefined, item.objective || campInfo?.objective, adSetInfo?.optimization_goal);
  });

  const genderRows = (genderData || []).map((item: any) => {
    const info = campaignMap.get(item.campaign_id);
    return calculateMetrics(item, 'gender', info?.status || 'Active', undefined, currency, undefined, { name: item.gender === 'unknown' ? '未知' : (item.gender === 'female' ? '女性' : '男性'), gender: item.gender }, item.objective || info?.objective, undefined);
  });

  const ageRows = (ageData || []).map((item: any) => {
      const info = campaignMap.get(item.campaign_id);
      return calculateMetrics(item, 'age', info?.status || 'Active', undefined, currency, undefined, { name: item.age, age: item.age }, item.objective || info?.objective, undefined);
  });

  return [...campaignRows, ...adSetRows, ...adRows, ...genderRows, ...ageRows];
};
