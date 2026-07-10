import React, { useState, useMemo, useRef, useEffect } from "react";
import { TranscriptSegment } from "../types";
import { 
  Search, 
  Copy, 
  Download, 
  Play, 
  Check, 
  ChevronDown, 
  RefreshCw, 
  Edit, 
  Mic, 
  MicOff, 
  X, 
  Sparkles, 
  AlertCircle, 
  HelpCircle,
  Upload
} from "lucide-react";

interface TranscriptViewProps {
  transcript: TranscriptSegment[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  onUpdateTranscript?: (newTranscript: TranscriptSegment[]) => void;
}

// Utility to parse VTT, SRT or plain text transcript formats
function parseSrtOrVtt(text: string): { start: number; duration: number; text: string }[] {
  const segments: { start: number; duration: number; text: string }[] = [];
  const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = cleanText.split(/\n\s*\n/);
  
  const parseTimeToSeconds = (timeStr: string): number => {
    const cleanTime = timeStr.replace(",", ".");
    const parts = cleanTime.split(":");
    if (parts.length === 3) {
      const hrs = parseInt(parts[0], 10);
      const mins = parseInt(parts[1], 10);
      const secs = parseFloat(parts[2]);
      return hrs * 3600 + mins * 60 + secs;
    } else if (parts.length === 2) {
      const mins = parseInt(parts[0], 10);
      const secs = parseFloat(parts[1]);
      return mins * 60 + secs;
    }
    return 0;
  };

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    
    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("-->")) {
        timeLineIdx = i;
        break;
      }
    }
    
    if (timeLineIdx !== -1) {
      const timeLine = lines[timeLineIdx];
      const parts = timeLine.split("-->");
      if (parts.length === 2) {
        const startSec = parseTimeToSeconds(parts[0].trim());
        const endSec = parseTimeToSeconds(parts[1].trim());
        const duration = Math.max(0, endSec - startSec);
        
        const textLines = lines.slice(timeLineIdx + 1).map(l => l.trim()).filter(l => l !== "");
        const textStr = textLines.join(" ");
        if (textStr) {
          segments.push({
            start: startSec,
            duration: duration,
            text: textStr,
          });
        }
      }
    }
  }
  return segments;
}

function parseRawTranscriptText(text: string): { start: number; duration: number; text: string }[] {
  const segments: { start: number; duration: number; text: string }[] = [];
  const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Check if it's SRT/VTT
  if (cleanText.includes("-->")) {
    return parseSrtOrVtt(cleanText);
  }

  const lines = cleanText.split("\n").map(l => l.trim()).filter(l => l !== "");
  
  const parseTimeStr = (str: string): number | null => {
    const clean = str.replace(/[\[\]\(\)]/g, "").trim();
    const parts = clean.split(":");
    if (parts.length === 3) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const s = parseFloat(parts[2]);
      if (!isNaN(h) && !isNaN(m) && !isNaN(s)) return h * 3600 + m * 60 + s;
    } else if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const s = parseFloat(parts[1]);
      if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
    } else {
      const s = parseFloat(clean);
      if (!isNaN(s)) return s;
    }
    return null;
  };

  // Check alternating format (Format A):
  // Line 0: 0:15
  // Line 1: Hello
  let isAlternating = false;
  if (lines.length >= 2) {
    const firstTime = parseTimeStr(lines[0]);
    const secondTime = parseTimeStr(lines[1]);
    if (firstTime !== null && secondTime === null) {
      isAlternating = true;
    }
  }

  if (isAlternating) {
    let currentStart = 0;
    for (let i = 0; i < lines.length; i += 2) {
      const timeVal = parseTimeStr(lines[i]);
      const textVal = lines[i + 1];
      if (timeVal !== null && textVal) {
        currentStart = timeVal;
        segments.push({
          start: currentStart,
          duration: 5,
          text: textVal,
        });
      }
    }
    if (segments.length > 0) return segments;
  }

  // Line by line processing with leading timestamps: "00:15 text" or "[00:15] text"
  let currentTime = 0;
  for (const line of lines) {
    if (line.toUpperCase() === "WEBVTT" || /^\d+$/.test(line)) continue;
    
    const match = line.match(/^([\[\(\d][\d:.,\s\]\)]+?)(?:\s+|-|:)(.*)$/);
    if (match) {
      const timeStr = match[1].trim();
      const textPart = match[2].trim();
      const parsedTime = parseTimeStr(timeStr);
      if (parsedTime !== null && textPart) {
        currentTime = parsedTime;
        segments.push({
          start: currentTime,
          duration: 5,
          text: textPart,
        });
        continue;
      }
    }

    segments.push({
      start: currentTime,
      duration: 5,
      text: line,
    });
    currentTime += 5;
  }

  return segments;
}

export default function TranscriptView({
  transcript,
  currentTime,
  onSeek,
  onUpdateTranscript,
}: TranscriptViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Custom manual edit / input states
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLButtonElement>(null);

  // Helper: Format seconds to MM:SS or HH:MM:SS
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    
    const mm = m < 10 ? `0${m}` : m;
    const ss = s < 10 ? `0${s}` : s;
    
    if (h > 0) {
      const hh = h < 10 ? `0${h}` : h;
      return `${hh}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
  };

  // Check if current transcript is empty or dummy
  const isDummyTranscript = useMemo(() => {
    return transcript.length === 0 || 
           (transcript.length === 1 && (transcript[0].text.includes("沒有字幕軌") || transcript[0].text === "[本影片沒有字幕軌]"));
  }, [transcript]);

  // Pre-fill text editor when turning on edit mode
  const openEditor = () => {
    const formatted = transcript
      .map((item) => {
        if (item.text.includes("沒有字幕軌") || item.text === "[本影片沒有字幕軌]") return "";
        return `[${formatTime(item.start)}] ${item.text}`;
      })
      .filter(Boolean)
      .join("\n");
    
    setEditText(formatted);
    setIsEditing(true);
  };

  const handleSaveTranscript = () => {
    if (!onUpdateTranscript) return;
    const parsed = parseRawTranscriptText(editText);
    if (parsed.length === 0) {
      alert("請輸入有效的逐字稿或字幕文字內容！");
      return;
    }
    onUpdateTranscript(parsed);
    setIsEditing(false);
    if (isListening) {
      stopListening();
    }
  };

  // Speech Recognition control
  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("您的瀏覽器不支援 Web Speech API。建議使用 Google Chrome 或 Microsoft Edge！");
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "zh-TW";

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onerror = (e: any) => {
        console.error("Recognition error", e.error);
        if (e.error === "not-allowed") {
          alert("麥克風存取權限被拒絕，請開啟權限後再試。");
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.onresult = (e: any) => {
        let finalTrans = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            finalTrans += e.results[i][0].transcript;
          }
        }
        if (finalTrans) {
          setEditText((prev) => {
            const trimmed = prev.trim();
            const nowSec = Math.floor(currentTime);
            const timeTag = `[${formatTime(nowSec)}]`;
            return trimmed ? `${trimmed}\n${timeTag} ${finalTrans}` : `${timeTag} ${finalTrans}`;
          });
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  // Find currently active segment index
  const activeIndex = useMemo(() => {
    if (transcript.length === 0) return -1;
    
    const index = transcript.findIndex((item, i) => {
      const start = item.start;
      const nextStart = transcript[i + 1] ? transcript[i + 1].start : Infinity;
      return currentTime >= start && currentTime < nextStart;
    });

    return index;
  }, [transcript, currentTime]);

  // Auto-scroll the active segment into view if enabled
  useEffect(() => {
    if (autoScroll && activeIndex !== -1 && activeSegmentRef.current) {
      activeSegmentRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeIndex, autoScroll]);

  // Filter transcript segments based on search
  const filteredTranscript = useMemo(() => {
    if (!searchQuery.trim()) return transcript;
    return transcript.filter((item) =>
      item.text.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [transcript, searchQuery]);

  // Copy full transcript text
  const handleCopyText = () => {
    const fullText = transcript
      .map((item) => `[${formatTime(item.start)}] ${item.text}`)
      .join("\n");
    
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export as TXT file
  const handleDownloadTxt = () => {
    const fullText = transcript
      .map((item) => `[${formatTime(item.start)}] ${item.text}`)
      .join("\n");
    
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transcript_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Highlight matches in text
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return <span>{text}</span>;
    
    const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-yellow-100 text-yellow-900 rounded px-0.5 font-medium">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Render the manual editor screen or popup
  if (isEditing) {
    return (
      <div className="flex flex-col h-full bg-slate-950 p-4 sm:p-6 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Edit className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-white text-base">手動輸入 / 編輯修改逐字稿</h3>
          </div>
          <button 
            onClick={() => {
              setIsEditing(false);
              if (isListening) stopListening();
            }}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">請在下方編輯或貼上您的影片逐字稿：</span>
              
              {/* Mic transcription buttons */}
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                  isListening 
                    ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                    : "bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30"
                }`}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-3.5 h-3.5 text-white" />
                    <span>正在聽寫... 點此結束</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-indigo-400" />
                    <span>🎙️ 語音辨識/聽寫</span>
                  </>
                )}
              </button>
            </div>

            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full h-80 p-4 bg-slate-900 border border-slate-800 rounded-2xl text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed placeholder-slate-600"
              placeholder={`格式 A：每行一句，系統自動依時間分段（最推薦，最快！）
大家好，歡迎觀看本影片
今天我們要來探討...

格式 B：複製 YouTube 的「顯示逐字稿」時間格式：
0:00 大家好
0:05 今天我們要學習...

格式 C：自訂時間標記
[00:10] 第一個重點
[00:45] 第二個重點`}
            />

            {/* Quick action buttons */}
            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => {
                  setIsEditing(false);
                  if (isListening) stopListening();
                }}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSaveTranscript}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg transition-colors cursor-pointer"
              >
                儲存並重新產生摘要
              </button>
            </div>
          </div>

          {/* Quick tips sidebar */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4 text-xs text-slate-300 leading-relaxed">
            <div className="flex items-center gap-1.5 text-indigo-400 font-bold border-b border-slate-800 pb-2">
              <HelpCircle className="w-4 h-4" />
              <span>如何快速取得官方字幕？</span>
            </div>
            
            <ol className="list-decimal list-inside space-y-3 pl-1 text-slate-400">
              <li>
                打開您的 <strong className="text-white">YouTube 影片</strong>
              </li>
              <li>
                點擊影片標題下方右側的 <strong className="text-white">「...」 (更多)</strong> 按鈕
              </li>
              <li>
                點選 <strong className="text-white">「顯示逐字稿」</strong>，右側將會展開完整的時間字幕欄位
              </li>
              <li>
                全選複製那些文字，然後直接 <strong className="text-white">貼上到左側的輸入框</strong> 即可！
              </li>
            </ol>

            <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-xl p-3 text-slate-400 space-y-1">
              <p className="font-bold text-indigo-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>語音即時聽寫提示</span>
              </p>
              <p className="text-[11px]">
                點擊上方「語音辨識/聽寫」按鈕後，一邊播放影片、或者對麥克風說話，系統便會將聽到的聲音即時、精準地轉換為中文文字並附加目前影片的時間標記！
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If the video has no subtitles and is not in edit mode
  if (isDummyTranscript) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-12 text-center h-full min-h-[400px] bg-slate-950 overflow-y-auto">
        <div className="max-w-md p-6 sm:p-8 border border-dashed border-slate-800 rounded-3xl bg-slate-900/40 backdrop-blur-md flex flex-col items-center">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          
          <h3 className="text-lg font-bold text-white mb-2 font-display">
            此影片沒有自動偵測到字幕檔
          </h3>
          
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            這通常是因為 YouTube 官方阻擋了雲端伺服器的自動抓取，或影片本身為純音樂、不包含字幕軌。
            請別擔心！您可以使用以下超簡單的解決方案：
          </p>

          <div className="w-full text-left bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3.5 mb-6 text-xs text-slate-300">
            <div className="flex gap-2.5">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">1</div>
              <div>
                <p className="font-bold text-slate-200">複製 YouTube 官方逐字稿</p>
                <p className="text-slate-500 text-[11px] mt-0.5">在 YouTube 點擊「顯示逐字稿」並全選複製，貼上即可自動對齊時間！</p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">2</div>
              <div>
                <p className="font-bold text-slate-200">🎙️ 語音辨識 / 聽寫功能</p>
                <p className="text-slate-500 text-[11px] mt-0.5">開啟麥克風一邊播影片、一邊讓 AI 即時聽寫記錄字幕軌。</p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">3</div>
              <div>
                <p className="font-bold text-slate-200">直接上傳字幕檔案</p>
                <p className="text-slate-500 text-[11px] mt-0.5">支援上傳電腦本機的 .srt, .vtt 或 .txt 文字逐字稿。</p>
              </div>
            </div>
          </div>

          <button
            onClick={openEditor}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Edit className="w-4 h-4" />
            <span>立即手動輸入或上傳/聽寫字幕</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Search and control bar */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/50">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-500" />
          <input
            type="text"
            placeholder="搜尋逐字稿文字..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-slate-850 text-slate-200 shadow-sm transition-all placeholder-slate-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Edit Transcript Button */}
          {onUpdateTranscript && (
            <button
              onClick={openEditor}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border bg-indigo-600/10 hover:bg-indigo-600/20 border-indigo-500/20 hover:border-indigo-500/40 text-indigo-300 transition-all flex items-center gap-1.5 cursor-pointer"
              title="修改編輯或聽寫此影片的逐字稿內容"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>編輯逐字稿</span>
            </button>
          )}

          {/* Auto scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 cursor-pointer ${
              autoScroll
                ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                : "bg-slate-850 text-slate-400 border-slate-700 hover:bg-slate-700/50"
            }`}
            title="開啟時，字幕會隨著影片撥放自動捲動定位"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${autoScroll ? "bg-indigo-400 animate-pulse" : "bg-slate-500"}`} />
            <span>自動捲動</span>
          </button>

          {/* Copy button */}
          <button
            onClick={handleCopyText}
            className="p-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-indigo-400 text-slate-400 transition-colors cursor-pointer"
            title="複製完整逐字稿"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* Download button */}
          <button
            onClick={handleDownloadTxt}
            className="p-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-indigo-400 text-slate-400 transition-colors cursor-pointer"
            title="下載逐字稿 (.txt)"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Transcript Scrolling List */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-1.5"
      >
        {filteredTranscript.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
            <Search className="w-12 h-12 text-slate-800 mb-2 stroke-1" />
            <p className="text-sm">沒有找到符合搜尋條件的文字</p>
            <button
              onClick={() => setSearchQuery("")}
              className="mt-2 text-xs text-indigo-400 hover:underline cursor-pointer"
            >
              清除搜尋條件
            </button>
          </div>
        ) : (
          filteredTranscript.map((item, index) => {
            // Check if this segment is active based on full transcript array index
            const origIndex = transcript.indexOf(item);
            const isActive = origIndex === activeIndex;

            return (
              <button
                key={index}
                ref={isActive ? activeSegmentRef : null}
                onClick={() => onSeek(item.start)}
                className={`w-full text-left flex gap-4 p-3 rounded-xl transition-all border group text-sm cursor-pointer ${
                  isActive
                    ? "bg-indigo-500/10 border-indigo-500/30 shadow-md"
                    : "bg-slate-900/40 hover:bg-slate-900 border-transparent hover:border-slate-800"
                }`}
              >
                {/* Timestamp */}
                <div
                  className={`flex-shrink-0 font-mono text-xs font-semibold px-2 py-0.5 rounded-lg h-fit flex items-center gap-1 mt-0.5 ${
                    isActive
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-850 text-slate-400 group-hover:bg-indigo-500/10 group-hover:text-indigo-300"
                  }`}
                >
                  <Play className={`w-2.5 h-2.5 ${isActive ? "fill-current" : "opacity-0 group-hover:opacity-100"}`} />
                  <span>{formatTime(item.start)}</span>
                </div>

                {/* Text Content */}
                <div className="flex-1">
                  <p
                    className={`leading-relaxed ${
                      isActive
                        ? "text-white font-medium"
                        : "text-slate-300 group-hover:text-white"
                    }`}
                  >
                    {highlightMatch(item.text, searchQuery)}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Floating auto-scroll helper indicator */}
      {activeIndex !== -1 && !autoScroll && (
        <div className="absolute bottom-16 right-6 z-10 animate-bounce">
          <button
            onClick={() => setAutoScroll(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-full shadow-lg hover:bg-slate-900 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
            <span>追蹤影片字幕</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

