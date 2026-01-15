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

// 2. Fetch Data & Creatives
export const fetchMetaAdsData = async (
  token: string, 
  accountId: string, 
  startDate: string, 
  endDate: string
): Promise<AdRow[]> => {
  // A. Fetch Insights (Ad Level)
  // Added: reach, inline_link_clicks
  const insightsUrl = `${BASE_URL}/act_${accountId}/insights?` + new URLSearchParams({
    level: 'ad',
    fields: 'campaign_name,adset_name,ad_name,ad_id,impressions,clicks,spend,actions,action_values,reach,inline_link_clicks,objective',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    limit: '500', 
    access_token: token
  });

  // B. Fetch Ads with Creatives
  const creativesUrl = `${BASE_URL}/act_${accountId}/ads?` + new URLSearchParams({
    fields: 'name,creative{thumbnail_url,image_url,title,body}',
    limit: '500',
    access_token: token
  });

  const [insightsRes, creativesRes] = await Promise.all([
    fetch(insightsUrl),
    fetch(creativesUrl)
  ]);

  const insightsData = await insightsRes.json();
  const creativesData = await creativesRes.json();

  if (insightsData.error) throw new Error(`Insights Error: ${insightsData.error.message}`);
  if (creativesData.error) throw new Error(`Creatives Error: ${creativesData.error.message}`);

  // Map Ad ID to Image URL
  const adImageMap = new Map<string, string>();
  creativesData.data?.forEach((ad: any) => {
    const creative = ad.creative;
    if (creative) {
      const img = creative.image_url || creative.thumbnail_url;
      if (img) adImageMap.set(ad.id, img);
    }
  });

  // Helper to re-calc rates
  const calcRates = (r: AdRow) => {
    r.ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
    r.cpc = r.clicks > 0 ? r.spend / r.clicks : 0;
    
    // Link Click Metrics
    r.linkCtr = r.impressions > 0 ? (r.linkClicks / r.impressions) * 100 : 0;
    r.linkCpc = r.linkClicks > 0 ? r.spend / r.linkClicks : 0;

    // Conversion Metrics
    // Use generic conversions for CPA calculation to be safe, or use websitePurchases if strict
    const conversionBasis = r.conversions; 
    r.cpa = conversionBasis > 0 ? r.spend / conversionBasis : 0;
    r.conversionRate = r.clicks > 0 ? (conversionBasis / r.clicks) * 100 : 0;
    
    r.roas = r.spend > 0 ? r.conversionValue / r.spend : 0;
    return r;
  };

  const ads: AdRow[] = [];
  const campaignsMap = new Map<string, AdRow>();
  const adSetsMap = new Map<string, AdRow>();

  // Process Rows
  (insightsData.data || []).forEach((item: any, idx: number) => {
    const actions = item.actions || [];
    const actionValues = item.action_values || [];

    // 1. Basic Metrics
    const spend = parseFloat(item.spend) || 0;
    const clicks = parseFloat(item.clicks) || 0;
    const impressions = parseFloat(item.impressions) || 0;
    const reach = parseFloat(item.reach) || 0;
    const linkClicks = parseFloat(item.inline_link_clicks) || 0;

    // 2. Conversion Parsing
    // "Results": Sum of Purchase + Lead + Registration (Customizable)
    const purchase = parseFloat(actions.find((a: any) => a.action_type === 'purchase' || a.action_type === 'omni_purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0);
    const leads = parseFloat(actions.find((a: any) => a.action_type === 'lead')?.value || 0);
    const completedReg = parseFloat(actions.find((a: any) => a.action_type === 'complete_registration')?.value || 0);
    
    // Website Purchases specifically (for the specific column request)
    const websitePurchases = parseFloat(actions.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0);

    const conversions = purchase + leads + completedReg;

    // Conversion Value
    const conversionValueObj = actionValues.find((a: any) => a.action_type === 'purchase') 
      || actionValues.find((a: any) => a.action_type === 'omni_purchase');
    const conversionValue = conversionValueObj ? parseFloat(conversionValueObj.value) : 0;

    const imageUrl = adImageMap.get(item.ad_id);

    // 3. Create Ad Row
    const adRow: AdRow = {
      id: `meta-ad-${item.ad_id}`,
      originalId: item.ad_id,
      platform: 'meta',
      level: 'ad',
      name: item.ad_name,
      status: 'Active', 
      impressions,
      clicks,
      spend,
      conversions,
      conversionValue,
      reach,
      linkClicks,
      websitePurchases,
      ctr: 0, cpc: 0, cpa: 0, roas: 0, linkCtr: 0, linkCpc: 0, conversionRate: 0, // Calc later
      campaignName: item.campaign_name,
      adGroupName: item.adset_name,
      imageUrl
    };
    calcRates(adRow);
    ads.push(adRow);

    // 4. Aggregate Campaign
    if (!campaignsMap.has(item.campaign_name)) {
        campaignsMap.set(item.campaign_name, {
            ...adRow,
            id: `meta-camp-${item.campaign_id || item.campaign_name}`,
            level: 'campaign',
            name: item.campaign_name,
            imageUrl: undefined,
            adGroupName: undefined,
            status: 'Active' // Simplification
        });
    } else {
        const c = campaignsMap.get(item.campaign_name)!;
        c.impressions += impressions;
        c.clicks += clicks;
        c.spend += spend;
        c.conversions += conversions;
        c.conversionValue += conversionValue;
        c.reach += reach; // Note: Reach isn't strictly additive across ads but approximating for table
        c.linkClicks += linkClicks;
        c.websitePurchases += websitePurchases;
    }

    // 5. Aggregate AdSet
    if (!adSetsMap.has(item.adset_name)) {
        adSetsMap.set(item.adset_name, {
            ...adRow,
            id: `meta-set-${item.adset_id || item.adset_name}`,
            level: 'adset',
            name: item.adset_name,
            imageUrl: undefined
        });
    } else {
        const s = adSetsMap.get(item.adset_name)!;
        s.impressions += impressions;
        s.clicks += clicks;
        s.spend += spend;
        s.conversions += conversions;
        s.conversionValue += conversionValue;
        s.reach += reach;
        s.linkClicks += linkClicks;
        s.websitePurchases += websitePurchases;
    }
  });

  // Final Recalculations
  const campaigns = Array.from(campaignsMap.values()).map(calcRates);
  const adSets = Array.from(adSetsMap.values()).map(calcRates);

  return [...campaigns, ...adSets, ...ads];
};
