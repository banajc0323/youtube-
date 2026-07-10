import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Gemini client lazily
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Enable body parsing
app.use(express.json({ limit: "15mb" }));

// Helper: Extract YouTube video ID
function getYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }
  if (url.trim().length === 11 && !url.includes("/") && !url.includes(".")) {
    return url.trim();
  }
  return null;
}

// Helper: Decode basic HTML entities
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Helper: Extract caption tracks from YouTube watch page HTML
function extractCaptionTracks(html: string) {
  // Try ytInitialPlayerResponse
  const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
  if (match) {
    try {
      const json = JSON.parse(match[1]);
      const captionTracks = json.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (captionTracks && Array.isArray(captionTracks)) {
        return captionTracks;
      }
    } catch (e) {
      console.error("Failed to parse ytInitialPlayerResponse JSON", e);
    }
  }

  // Fallback: search for captionTracks regex directly
  const captionTracksMatch = html.match(/"captionTracks"\s*:\s*(\[.+?\])/);
  if (captionTracksMatch) {
    try {
      const captionTracks = JSON.parse(captionTracksMatch[1]);
      if (captionTracks && Array.isArray(captionTracks)) {
        return captionTracks;
      }
    } catch (e) {
      console.error("Failed to parse captionTracks regex JSON", e);
    }
  }

  return null;
}

// Helper: Extract metadata from watch page HTML
function extractMetadata(html: string) {
  let title = "YouTube 影片";
  let author = "未知創作者";
  let thumbnailUrl = "";

  const titleMatch = html.match(/<meta\s+name="title"\s+content="([^"]+)"/i) ||
                     html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                     html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1]).replace(" - YouTube", "");
  }

  const authorMatch = html.match(/<link\s+itemprop="name"\s+content="([^"]+)"/i) ||
                      html.match(/<meta\s+name="author"\s+content="([^"]+)"/i) ||
                      html.match(/"author"\s*:\s*"([^"]+)"/i);
  if (authorMatch) {
    author = decodeHtmlEntities(authorMatch[1]);
  }

  const thumbMatch = html.match(/<link\s+itemprop="thumbnailUrl"\s+href="([^"]+)"/i) ||
                     html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  if (thumbMatch) {
    thumbnailUrl = thumbMatch[1];
  }

  return { title, author, thumbnailUrl };
}

// Helper: Parse XML captions format to JSON array
function parseXmlCaptions(xml: string) {
  const result: { start: number; duration: number; text: string }[] = [];
  const textRegex = /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/gi;
  let match;
  while ((match = textRegex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const duration = match[2] ? parseFloat(match[2]) : 0;
    const text = decodeHtmlEntities(match[3]);
    result.push({ start, duration, text });
  }
  return result;
}

// ----------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", apiKeyConfigured: !!process.env.GEMINI_API_KEY });
});

// Endpoint 1: Fetch available caption tracks and basic info
app.post("/api/youtube/info", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "請提供 YouTube 影片網址或 ID" });
  }

  const videoId = getYouTubeId(url);
  if (!videoId) {
    return res.status(400).json({ error: "無效的 YouTube 影片網址" });
  }

  try {
    // 1. Fetch metadata using oEmbed (very reliable, avoids bot redirection/consent blocks)
    let metadata = { title: "YouTube 影片", author: "未知創作者", thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` };
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        if (oembed.title) metadata.title = oembed.title;
        if (oembed.author_name) metadata.author = oembed.author_name;
        if (oembed.thumbnail_url) metadata.thumbnailUrl = oembed.thumbnail_url;
      }
    } catch (e) {
      console.warn("Failed to fetch oEmbed metadata, falling back to watch page HTML", e);
    }

    // 2. Fetch the watch page HTML to extract captions, with headers to bypass consent screens
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cookie": "CONSENT=YES+cb.20210328-17-p0.en+FX+999; SOCS=CAESEwgDEgk0ODE3Nzk3NTQaAnpoIAEaBgiA_eWfBg;",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "無法從 YouTube 讀取影片頁面" });
    }

    const html = await response.text();
    
    // If oEmbed didn't yield values, or to merge, run HTML extraction
    const htmlMetadata = extractMetadata(html);
    if (metadata.title === "YouTube 影片" && htmlMetadata.title !== "YouTube 影片") {
      metadata.title = htmlMetadata.title;
    }
    if (metadata.author === "未知創作者" && htmlMetadata.author !== "未知創作者") {
      metadata.author = htmlMetadata.author;
    }
    if (!metadata.thumbnailUrl && htmlMetadata.thumbnailUrl) {
      metadata.thumbnailUrl = htmlMetadata.thumbnailUrl;
    }

    const captionTracks = extractCaptionTracks(html);

    if (!captionTracks || captionTracks.length === 0) {
      return res.json({
        videoId,
        metadata,
        captionTracks: [],
        warning: "此影片未提供可解析的字幕軌。這可能是因為 YouTube 封鎖了伺服器的存取，或者本影片確實不包含字幕。您可以點擊下方「手動貼上/上傳字幕」來匯入內容！"
      });
    }

    // Format caption tracks list nicely
    const formattedTracks = captionTracks.map((track: any) => ({
      baseUrl: track.baseUrl,
      languageCode: track.languageCode,
      name: track.name?.simpleText || track.name?.runs?.[0]?.text || track.languageCode,
      isAutoGenerated: track.vssId?.startsWith("a.") || false,
    }));

    // Prioritize Traditional Chinese (zh-TW, zh-Hant), then zh-CN, then English, then others
    formattedTracks.sort((a: any, b: any) => {
      const codeA = a.languageCode.toLowerCase();
      const codeB = b.languageCode.toLowerCase();
      
      const score = (code: string) => {
        if (code === "zh-tw" || code === "zh-hant") return 100;
        if (code.startsWith("zh")) return 80;
        if (code === "en") return 50;
        return 10;
      };
      
      return score(codeB) - score(codeA);
    });

    res.json({
      videoId,
      metadata,
      captionTracks: formattedTracks,
    });
  } catch (error: any) {
    console.error("Error in /api/youtube/info:", error);
    res.status(500).json({ error: "讀取影片資訊時發生錯誤：" + error.message });
  }
});

// Endpoint 2: Fetch and parse a specific caption track
app.post("/api/youtube/transcript", async (req, res) => {
  const { baseUrl } = req.body;
  if (!baseUrl) {
    return res.status(400).json({ error: "請提供字幕軌 URL" });
  }

  try {
    const response = await fetch(baseUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: "無法下載 YouTube 字幕軌檔案" });
    }

    const xml = await response.text();
    const parsed = parseXmlCaptions(xml);

    if (parsed.length === 0) {
      return res.status(400).json({ error: "字幕解析結果為空" });
    }

    // Combine consecutive segments if they are short to make the transcript cleaner
    const formattedTranscript = parsed;

    // Generate single joined text block
    const fullText = parsed.map((item) => item.text).join(" ");

    res.json({
      transcript: formattedTranscript,
      fullText,
    });
  } catch (error: any) {
    console.error("Error in /api/youtube/transcript:", error);
    res.status(500).json({ error: "讀取字幕內容時發生錯誤：" + error.message });
  }
});

// Endpoint 3: Summarize transcript using Gemini
app.post("/api/youtube/summary", async (req, res) => {
  const { transcript, videoTitle } = req.body;
  if (!transcript) {
    return res.status(400).json({ error: "請提供要摘要的逐字稿內容" });
  }

  try {
    const ai = getGeminiClient();

    // Prepare prompt
    const prompt = `你是一個專業的影片重點整理秘書。
請詳細分析以下 YouTube 影片的逐字稿內容，並使用繁體中文（zh-TW）輸出精確的影片大綱與重點摘要。

[影片名稱]: ${videoTitle || "未指定"}
[逐字稿內容]:
${transcript}

請依據以下需求回傳 JSON 資料：
1. 分析出影片的整體大綱 (title) 與精準的核心高階摘要 (overallSummary，約 150 字)。
2. 列出 3-6 個核心關鍵要點 (keyTakeaways)，每個要點附帶詳細描述。
3. 依時間順序標記精采時刻/重點章節 (chapters)。請根據影片長度規劃 4-8 個章節。
   * 重要：請從逐字稿推估並提供精確的起始秒數 (seconds, 整數，例如 125) 以及時間字串 (timeLabel, 例如 "02:05")。
4. 規劃一個多層次的心智圖 (mindmap) 樹狀結構，用來展示影片的論點或內容脈絡（最多三層：中心主題 -> 主分支 -> 次分支）。

請嚴格遵守 JSON schema 的規格。`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "心智圖中心或影片核心標題" },
            overallSummary: { type: Type.STRING, description: "影片核心摘要（繁體中文，150字左右，語氣親切專業）" },
            keyTakeaways: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  point: { type: Type.STRING, description: "核心關鍵點標題" },
                  description: { type: Type.STRING, description: "該點之詳細解說與分析" }
                },
                required: ["point", "description"]
              },
              description: "影片中的幾大關鍵核心要點"
            },
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  seconds: { type: Type.INTEGER, description: "該段落/章節起始秒數（整數，必須從 0 開始）" },
                  timeLabel: { type: Type.STRING, description: "格式化的時間標籤（如 01:23 或 10:45）" },
                  title: { type: Type.STRING, description: "該章節或時刻的主題標題" },
                  summary: { type: Type.STRING, description: "該時段內所討論的主要內容大綱" }
                },
                required: ["seconds", "timeLabel", "title", "summary"]
              },
              description: "影片的時間軸重點與章節，依時間先後排序"
            },
            mindmap: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: "心智圖的中心節點名稱" },
                children: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING, description: "主分支節點標題" },
                      children: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            label: { type: Type.STRING, description: "次分支/子節點細節" }
                          },
                          required: ["label"]
                        }
                      }
                    },
                    required: ["label"]
                  }
                }
              },
              required: ["label"]
            }
          },
          required: ["title", "overallSummary", "keyTakeaways", "chapters", "mindmap"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini 沒有回傳任何文字內容");
    }

    const data = JSON.parse(text);
    res.json(data);
  } catch (error: any) {
    console.error("Error in /api/youtube/summary:", error);
    res.status(500).json({ error: "產生摘要時發生錯誤：" + error.message });
  }
});

// Endpoint 4: Chat about the video
app.post("/api/youtube/chat", async (req, res) => {
  const { transcript, messages, userQuestion, videoTitle } = req.body;
  if (!transcript || !userQuestion) {
    return res.status(400).json({ error: "請提供逐字稿與問題" });
  }

  try {
    const ai = getGeminiClient();

    // Prepare structural conversation history
    const historyContext = (messages || [])
      .map((m: any) => `${m.role === "user" ? "使用者" : "助手"}: ${m.content}`)
      .join("\n");

    const prompt = `你是一個專業且親切的影片內容 AI 學習助理。你的任務是協助使用者理解以下這部 YouTube 影片的內容，並回答使用者的各種提問。

[影片主題]: ${videoTitle || "YouTube 影片"}
[整部影片的逐字稿]:
${transcript}

---
[先前對話紀錄]:
${historyContext}

---
[使用者的最新提問]:
${userQuestion}

請詳細閱讀逐字稿並為使用者解答：
1. 你的回答必須完全依據影片的逐字稿內容，不要胡言亂語或憑空捏造影片中沒有提到的細節。
2. 語氣要親切、有條理、易於閱讀。
3. 務必使用 繁體中文 (zh-TW) 進行回覆。
4. 在需要時，可以提及影片大約在哪個段落或概念，來幫助使用者理解。

請開始回答：`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    const text = response.text;
    res.json({ text });
  } catch (error: any) {
    console.error("Error in /api/youtube/chat:", error);
    res.status(500).json({ error: "AI 回應失敗：" + error.message });
  }
});

// Serve frontend static assets in production or boot dev server middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
