import { GoogleGenAI } from "@google/genai";
import { AdRow } from "../types";

// Initialize using the environment variable as per instructions
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateInsights = async (rows: AdRow[]): Promise<string> => {
  try {
    // 1. Aggregate Data to save tokens and give high-level context
    const totalSpend = rows.reduce((acc, r) => acc + r.spend, 0);
    const totalConversions = rows.reduce((acc, r) => acc + r.conversions, 0);
    const totalClicks = rows.reduce((acc, r) => acc + r.clicks, 0);
    const avgCPA = totalConversions > 0 ? totalSpend / totalConversions : 0;
    const avgROAS = totalSpend > 0 ? rows.reduce((acc, r) => acc + r.conversionValue, 0) / totalSpend : 0;

    // 2. Find Outliers (Top 3 Best/Worst by ROAS)
    const sortedByRoas = [...rows].filter(r => r.spend > 0).sort((a, b) => b.roas - a.roas);
    const topPerformers = sortedByRoas.slice(0, 3).map(r => `${r.name} (${r.platform} ${r.level}): ROAS ${r.roas.toFixed(2)}`);
    const lowPerformers = sortedByRoas.slice(-3).map(r => `${r.name} (${r.platform} ${r.level}): ROAS ${r.roas.toFixed(2)}`);

    const prompt = `
      你是一位資深的廣告投放專家與數據分析師。請分析以下的廣告成效數據摘要。
      
      **整體指標 (Overall Metrics):**
      - 總花費 (Total Spend): $${totalSpend.toFixed(2)}
      - 總轉換次數 (Total Conversions): ${totalConversions}
      - 平均 CPA: $${avgCPA.toFixed(2)}
      - 整體 ROAS: ${avgROAS.toFixed(2)}x
      
      **表現最佳 (Top Performers by ROAS):**
      ${topPerformers.join('\n')}
      
      **成效待優化 (Low Performers by ROAS):**
      ${lowPerformers.join('\n')}

      請以繁體中文 (Traditional Chinese) 提供以下分析：
      1. **成效總結**：簡短說明目前的整體表現狀況。
      2. **優化建議**：提供三個具體可行的操作建議來提升 ROAS。
      3. **預算分配**：針對表現好壞的項目，給予預算調整的建議 (如：Meta vs Google 或特定廣告活動)。
      
      語氣請保持專業、直接且簡潔 (Linear 風格)，不要過度冗長。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "無法產生分析報告。";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "連接 AI 分析服務時發生錯誤，請檢查您的 API 金鑰是否正確。";
  }
};