import React, { useState, useEffect, useRef } from "react";
import {
  ProcessedVideo,
  CaptionTrack,
  VideoSummary,
  ChatMessage,
  TranscriptSegment,
} from "./types";
import SidebarHistory from "./components/SidebarHistory";
import SummaryView from "./components/SummaryView";
import MindmapView from "./components/MindmapView";
import TranscriptView from "./components/TranscriptView";
import ChatView from "./components/ChatView";
import NotesView from "./components/NotesView";
import {
  Sparkles,
  Search,
  BookOpen,
  Clock,
  GitPullRequest,
  MessageSquare,
  Edit3,
  Video,
  ArrowRight,
  AlertTriangle,
  History,
  Menu,
  X,
  PlusCircle,
  Cpu,
  FileDown,
  Mic,
  MicOff,
} from "lucide-react";

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

// Utility to parse SRT, VTT, or plain text transcripts
function parseSrtOrVtt(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Clean double-newlines blocks
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

  // Fallback if no timeline SRT/VTT matches: treat as plain text line by line
  if (segments.length === 0) {
    const lines = cleanText.split("\n").map(l => l.trim()).filter(l => l !== "");
    let currentTime = 0;
    for (const line of lines) {
      if (line.toUpperCase() === "WEBVTT" || /^\d+$/.test(line)) continue;
      segments.push({
        start: currentTime,
        duration: 5,
        text: line,
      });
      currentTime += 5;
    }
  }

  return segments;
}

export default function App() {
  const [history, setHistory] = useState<ProcessedVideo[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  
  // Input flow states
  const [inputUrl, setInputUrl] = useState("");
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);

  // Temporary video analysis state
  const [fetchedMeta, setFetchedMeta] = useState<{
    videoId: string;
    title: string;
    author: string;
    thumbnailUrl: string;
    captionTracks: CaptionTrack[];
  } | null>(null);
  const [selectedLanguageIndex, setSelectedLanguageIndex] = useState(0);
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false);
  const [isManualInput, setIsManualInput] = useState(false);
  const [manualText, setManualText] = useState("");
  const [manualLanguageName, setManualLanguageName] = useState("繁體中文 (手動匯入)");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("很抱歉，您的瀏覽器不支援 Web Speech API 語音聽寫辨識。建議使用 Google Chrome 或 Edge 瀏覽器！");
        return;
      }

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "zh-TW";

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          if (event.error === "not-allowed") {
            alert("請允許網頁存取您的麥克風權限，才能進行語音聽寫！");
          }
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          if (finalTranscript) {
            setManualText((prev) => {
              const trimmed = prev.trim();
              return trimmed ? `${trimmed}\n${finalTranscript}` : finalTranscript;
            });
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err) {
        console.error("Failed to start SpeechRecognition", err);
        setIsListening(false);
      }
    }
  };

  // UI States
  const [activeTab, setActiveTab] = useState<"summary" | "mindmap" | "transcript" | "chat" | "notes">("summary");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);

  // YouTube player states
  const [currentTime, setCurrentTime] = useState(0);
  const [playerIframeSrc, setPlayerIframeSrc] = useState("");
  const playerRef = useRef<any>(null);
  const timeUpdateInterval = useRef<NodeJS.Timeout | null>(null);

  // Load history on mount
  useEffect(() => {
    // Check API Key health
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        if (!data.apiKeyConfigured) {
          setIsApiKeyMissing(true);
        }
      })
      .catch((err) => console.error("Failed to check health endpoint", err));

    const saved = localStorage.getItem("yt_study_history_v1");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ProcessedVideo[];
        setHistory(parsed);
        
        // Auto select last active
        const lastActive = localStorage.getItem("yt_last_active_id_v1");
        if (lastActive && parsed.some((v) => v.videoId === lastActive)) {
          setActiveVideoId(lastActive);
        } else if (parsed.length > 0) {
          setActiveVideoId(parsed[0].videoId);
        }
      } catch (e) {
        console.error("Error loading history", e);
      }
    }

    // Initialize YouTube iframe API
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Capture standard global callback
    window.onYouTubeIframeAPIReady = () => {
      initYoutubePlayer();
    };

    return () => {
      if (timeUpdateInterval.current) clearInterval(timeUpdateInterval.current);
    };
  }, []);

  // Sync active video ID changes
  useEffect(() => {
    if (activeVideoId) {
      localStorage.setItem("yt_last_active_id_v1", activeVideoId);
      
      // Load/Reset Player Iframe
      setPlayerIframeSrc(`https://www.youtube.com/embed/${activeVideoId}?enablejsapi=1&origin=${window.location.origin}`);
      
      // Delay initialization to let iframe render
      setTimeout(() => {
        initYoutubePlayer();
      }, 800);
    } else {
      setPlayerIframeSrc("");
      playerRef.current = null;
      if (timeUpdateInterval.current) {
        clearInterval(timeUpdateInterval.current);
        timeUpdateInterval.current = null;
      }
    }
  }, [activeVideoId]);

  // Save history to localstorage whenever it changes
  const saveHistory = (updatedHistory: ProcessedVideo[]) => {
    setHistory(updatedHistory);
    localStorage.setItem("yt_study_history_v1", JSON.stringify(updatedHistory));
  };

  // Find active video object
  const activeVideo = history.find((v) => v.videoId === activeVideoId) || null;

  // Initialize YT Player on iframe
  const initYoutubePlayer = () => {
    if (timeUpdateInterval.current) {
      clearInterval(timeUpdateInterval.current);
      timeUpdateInterval.current = null;
    }

    if (window.YT && window.YT.Player && activeVideoId) {
      try {
        playerRef.current = new window.YT.Player("youtube-player", {
          events: {
            onStateChange: (event: any) => {
              // Playing state is event.data === 1
              if (event.data === 1) {
                startTimeTracker();
              } else {
                stopTimeTracker();
              }
            },
          },
        });
      } catch (e) {
        console.warn("Failed to bind YouTube Player instance", e);
      }
    }
  };

  // Start tracking active playing seconds
  const startTimeTracker = () => {
    if (timeUpdateInterval.current) clearInterval(timeUpdateInterval.current);
    timeUpdateInterval.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
        setCurrentTime(playerRef.current.getCurrentTime());
      }
    }, 500);
  };

  // Stop tracking seconds
  const stopTimeTracker = () => {
    if (timeUpdateInterval.current) {
      clearInterval(timeUpdateInterval.current);
      timeUpdateInterval.current = null;
    }
  };

  // Jump player to target seconds
  const handleSeek = (seconds: number) => {
    setCurrentTime(seconds);
    if (playerRef.current && typeof playerRef.current.seekTo === "function") {
      playerRef.current.seekTo(seconds, true);
    } else {
      // Fallback: re-render iframe with starting query parameter
      setPlayerIframeSrc(
        `https://www.youtube.com/embed/${activeVideoId}?enablejsapi=1&origin=${window.location.origin}&start=${Math.floor(seconds)}&autoplay=1`
      );
      setTimeout(() => {
        initYoutubePlayer();
      }, 1000);
    }
  };

  // Step 1: Query video URL details and metadata from our server scraper
  const handleAnalyzeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;

    setIsFetchingInfo(true);
    setErrorMessage(null);
    setFetchedMeta(null);

    try {
      const response = await fetch("/api/youtube/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "讀取影片資訊時發生錯誤");
      }

      // Check if video is already imported
      const existing = history.find((h) => h.videoId === data.videoId);
      if (existing) {
        setActiveVideoId(data.videoId);
        setInputUrl("");
        setIsFetchingInfo(false);
        return;
      }

      setFetchedMeta({
        videoId: data.videoId,
        title: data.metadata.title,
        author: data.metadata.author,
        thumbnailUrl: data.metadata.thumbnailUrl,
        captionTracks: data.captionTracks || [],
      });
      setSelectedLanguageIndex(0);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsFetchingInfo(false);
    }
  };

  // Step 2: Choose language and download the transcript, adding to history
  const handleImportTranscript = async () => {
    if (!fetchedMeta) return;

    setIsFetchingTranscript(true);
    setErrorMessage(null);

    // Support manual input
    if (isManualInput) {
      if (!manualText.trim()) {
        setErrorMessage("請輸入或上傳您的字幕/逐字稿內容！");
        setIsFetchingTranscript(false);
        return;
      }

      const parsedSegments = parseSrtOrVtt(manualText);
      if (parsedSegments.length === 0) {
        setErrorMessage("無法解析您的字幕內容，請確認格式（例如包含時間戳，或貼上純文字/逐字稿）！");
        setIsFetchingTranscript(false);
        return;
      }

      const newVideoItem: ProcessedVideo = {
        videoId: fetchedMeta.videoId,
        title: fetchedMeta.title,
        author: fetchedMeta.author,
        thumbnailUrl: fetchedMeta.thumbnailUrl,
        captionTracks: fetchedMeta.captionTracks,
        selectedLanguage: manualLanguageName || "繁體中文 (手動匯入)",
        transcript: parsedSegments,
        summary: null,
        notes: "",
        chatHistory: [],
        lastAccessed: Date.now(),
      };

      const newHist = [newVideoItem, ...history.filter((h) => h.videoId !== newVideoItem.videoId)];
      saveHistory(newHist);
      setActiveVideoId(newVideoItem.videoId);
      
      // Clear input flows
      setFetchedMeta(null);
      setInputUrl("");
      setIsManualInput(false);
      setManualText("");
      setActiveTab("summary");
      setIsFetchingTranscript(false);
      return;
    }

    const isNoCaptions = fetchedMeta.captionTracks.length === 0;
    
    // If there are zero captions, we can still create a dummy transcript item
    // but warn the user they will have to write notes or chat with zero captions
    if (isNoCaptions) {
      const dummyItem: ProcessedVideo = {
        videoId: fetchedMeta.videoId,
        title: fetchedMeta.title,
        author: fetchedMeta.author,
        thumbnailUrl: fetchedMeta.thumbnailUrl,
        captionTracks: [],
        selectedLanguage: "無字幕",
        transcript: [{ start: 0, duration: 10, text: "[本影片沒有字幕軌]" }],
        summary: null,
        notes: "",
        chatHistory: [],
        lastAccessed: Date.now(),
      };
      
      const newHist = [dummyItem, ...history.filter((h) => h.videoId !== dummyItem.videoId)];
      saveHistory(newHist);
      setActiveVideoId(dummyItem.videoId);
      
      setFetchedMeta(null);
      setInputUrl("");
      setIsFetchingTranscript(false);
      return;
    }

    const selectedTrack = fetchedMeta.captionTracks[selectedLanguageIndex];

    try {
      const response = await fetch("/api/youtube/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: selectedTrack.baseUrl }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "無法下載並解析此字幕");
      }

      const newVideoItem: ProcessedVideo = {
        videoId: fetchedMeta.videoId,
        title: fetchedMeta.title,
        author: fetchedMeta.author,
        thumbnailUrl: fetchedMeta.thumbnailUrl,
        captionTracks: fetchedMeta.captionTracks,
        selectedLanguage: selectedTrack.name,
        transcript: data.transcript,
        summary: null,
        notes: "",
        chatHistory: [],
        lastAccessed: Date.now(),
      };

      const newHist = [newVideoItem, ...history.filter((h) => h.videoId !== newVideoItem.videoId)];
      saveHistory(newHist);
      setActiveVideoId(newVideoItem.videoId);
      
      // Clear input flows
      setFetchedMeta(null);
      setInputUrl("");
      setActiveTab("summary");
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsFetchingTranscript(false);
    }
  };

  // Step 3: Trigger server-side Gemini summary generation
  const handleGenerateSummary = async () => {
    if (!activeVideo || isGeneratingSummary) return;

    setIsGeneratingSummary(true);
    setErrorMessage(null);

    // Join all transcripts for context
    const fullTextContext = activeVideo.transcript
      .map((t) => `[${Math.floor(t.start)}s] ${t.text}`)
      .join("\n");

    try {
      const response = await fetch("/api/youtube/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: fullTextContext,
          videoTitle: activeVideo.title,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "無法產生摘要");
      }

      // Update history element
      const updated = history.map((item) => {
        if (item.videoId === activeVideo.videoId) {
          return {
            ...item,
            summary: data as VideoSummary,
          };
        }
        return item;
      });

      saveHistory(updated);
    } catch (err: any) {
      setErrorMessage("生成重點報告失敗: " + err.message);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Step 4: Handle interactive AI Assistant messages
  const handleSendChatMessage = async (text: string) => {
    if (!activeVideo || isSendingChatMessage) return;

    // Local append user message
    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const nextHistory = [...activeVideo.chatHistory, userMsg];
    
    // Quick update state
    const currentVideoId = activeVideo.videoId;
    let tempHist = history.map((item) => {
      if (item.videoId === currentVideoId) {
        return { ...item, chatHistory: nextHistory };
      }
      return item;
    });
    setHistory(tempHist);
    setIsSendingChatMessage(true);

    const fullTranscriptText = activeVideo.transcript.map((t) => t.text).join(" ");

    try {
      const response = await fetch("/api/youtube/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: fullTranscriptText,
          messages: nextHistory,
          userQuestion: text,
          videoTitle: activeVideo.title,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "助教無法回答");
      }

      const aiMsg: ChatMessage = {
        id: "ai-" + Date.now(),
        role: "assistant",
        content: data.text,
        timestamp: Date.now(),
      };

      const finalChat = [...nextHistory, aiMsg];
      
      const finalHist = history.map((item) => {
        if (item.videoId === currentVideoId) {
          return { ...item, chatHistory: finalChat };
        }
        return item;
      });
      saveHistory(finalHist);
    } catch (err: any) {
      setErrorMessage("助教回應失敗: " + err.message);
    } finally {
      setIsSendingChatMessage(false);
    }
  };

  // Step 5: Save Notes
  const handleNotesChange = (text: string) => {
    if (!activeVideo) return;
    const updated = history.map((item) => {
      if (item.videoId === activeVideo.videoId) {
        return { ...item, notes: text };
      }
      return item;
    });
    saveHistory(updated);
  };

  // Delete video study item
  const handleDeleteVideo = (videoId: string) => {
    const updated = history.filter((item) => item.videoId !== videoId);
    saveHistory(updated);
    if (activeVideoId === videoId) {
      if (updated.length > 0) {
        setActiveVideoId(updated[0].videoId);
      } else {
        setActiveVideoId(null);
      }
    }
  };

  // UI action: click to select video from sidebar
  const handleSelectVideo = (videoId: string) => {
    setActiveVideoId(videoId);
    setErrorMessage(null);
  };

  // Tab configurations
  const TABS = [
    { id: "summary", label: "重點摘要報告", icon: BookOpen },
    { id: "mindmap", label: "邏輯心智圖", icon: GitPullRequest },
    { id: "transcript", label: "完整逐字稿", icon: Clock },
    { id: "chat", label: "AI 助教問答", icon: MessageSquare },
    { id: "notes", label: "我的學習筆記", icon: Edit3 },
  ] as const;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      
      {/* Sidebar History (Collapsible on mobile, regular on desktop) */}
      <div
        className={`fixed inset-y-0 left-0 z-30 transform md:relative md:translate-x-0 transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarHistory
          history={history}
          activeVideoId={activeVideoId}
          onSelectVideo={handleSelectVideo}
          onDeleteVideo={handleDeleteVideo}
          onNewVideoClick={() => {
            setActiveVideoId(null);
            setFetchedMeta(null);
            setInputUrl("");
            setErrorMessage(null);
          }}
        />
      </div>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Navigation / Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
              title="切換側邊歷史記錄"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-900/30">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-bold font-display tracking-tight text-white">
                  YouTube 影音學習工作區
                </h1>
                <p className="text-[10px] text-indigo-400 font-semibold">
                  智慧型逐字稿與重點摘要工具
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isApiKeyMissing && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-950/40 text-amber-300 border border-amber-800 rounded-xl text-xs font-semibold animate-pulse">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>請在設定中的 Secrets 配置 GEMINI_API_KEY</span>
              </div>
            )}
          </div>
        </header>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="bg-red-950/80 text-red-200 px-4 sm:px-6 py-2.5 border-b border-red-800/60 flex items-center justify-between text-xs sm:text-sm font-semibold z-10 animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 text-red-400 hover:text-red-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Workspace core */}
        <div className="flex-1 overflow-hidden">
          {!activeVideoId ? (
            
            /* Landing/Import Welcome Screen */
            <div className="h-full overflow-y-auto p-4 sm:p-12 flex flex-col items-center justify-center bg-slate-950">
              <div className="max-w-2xl w-full text-center space-y-8 py-8 px-4">
                
                {/* Hero Headers */}
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-bold animate-pulse">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Gemini 3.5-Flash 驅動影片精煉技術</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold font-display tracking-tight text-white leading-tight">
                    把 YouTube 變成您的專屬個人書房
                  </h2>
                  <p className="text-sm sm:text-base text-slate-400 max-w-lg mx-auto leading-relaxed">
                    輸入任何 YouTube 影片連結，AI 學習秘書即可為您全自動產出完整字幕逐字稿、重點章節目錄、核心思維導圖與進行即時問答！
                  </p>
                </div>

                {/* Main Action Url Input */}
                <div className="bg-slate-900/60 p-4 sm:p-6 rounded-3xl shadow-xl border border-slate-800 space-y-4 backdrop-blur-md">
                  <form onSubmit={handleAnalyzeUrl} className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-500" />
                      <input
                        type="text"
                        placeholder="請貼上 YouTube 影片網址 (例如 https://www.youtube.com/watch?v=...)"
                        value={inputUrl}
                        onChange={(e) => setInputUrl(e.target.value)}
                        disabled={isFetchingInfo || isFetchingTranscript}
                        className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-slate-800 text-white placeholder-slate-500 transition-all disabled:opacity-75"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isFetchingInfo || !inputUrl.trim() || isFetchingTranscript}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white disabled:text-slate-500 font-bold rounded-2xl shadow-lg shadow-indigo-900/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer border border-transparent disabled:border-slate-700"
                    >
                      {isFetchingInfo ? (
                        <div className="w-4.5 h-4.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span>立即分析</span>
                      )}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>

                  {/* Step 2: Language Selector modal panel */}
                  {fetchedMeta && (
                    <div className="p-4 rounded-2xl bg-slate-900 border border-indigo-500/30 text-left animate-fade-in space-y-4">
                      <div>
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          偵測到影片
                        </span>
                        <h4 className="text-sm font-bold text-white mt-1 line-clamp-2">
                          {fetchedMeta.title}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          頻道主：{fetchedMeta.author}
                        </p>
                      </div>

                      {/* Dual Mode Import Tab Bar */}
                      <div className="flex border-b border-slate-800 mb-3">
                        <button
                          type="button"
                          onClick={() => setIsManualInput(false)}
                          className={`flex-1 pb-2 text-xs font-bold transition-all border-b-2 text-center ${
                            !isManualInput
                              ? "border-indigo-500 text-white"
                              : "border-transparent text-slate-400 hover:text-slate-300"
                          }`}
                        >
                          自動偵測字幕 ({fetchedMeta.captionTracks.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsManualInput(true);
                            if (!manualText) {
                              setManualText("");
                            }
                          }}
                          className={`flex-1 pb-2 text-xs font-bold transition-all border-b-2 text-center ${
                            isManualInput
                              ? "border-indigo-500 text-white"
                              : "border-transparent text-slate-400 hover:text-slate-300"
                          }`}
                        >
                          手動匯入字幕 / 貼上逐字稿
                        </button>
                      </div>

                      {!isManualInput ? (
                        <div className="space-y-1.5 animate-fade-in">
                          <label className="block text-xs font-bold text-slate-300">
                            選擇字幕語言：
                          </label>
                          {fetchedMeta.captionTracks.length === 0 ? (
                            <div className="space-y-3">
                              <div className="text-xs text-amber-300 font-semibold p-3 bg-amber-950/40 border border-amber-800 rounded-xl leading-relaxed">
                                ⚠️ 偵測到 YouTube 伺服器並未回傳此影片的字幕，或此影片不包含公開字幕軌。
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsManualInput(true)}
                                className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center block"
                              >
                                切換至「手動匯入字幕 / 貼上逐字稿」👉
                              </button>
                            </div>
                          ) : (
                            <select
                              value={selectedLanguageIndex}
                              onChange={(e) => setSelectedLanguageIndex(Number(e.target.value))}
                              className="w-full p-2.5 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
                            >
                              {fetchedMeta.captionTracks.map((track, idx) => (
                                <option key={idx} value={idx} className="bg-slate-800 text-slate-200">
                                  {track.name} {track.isAutoGenerated ? "(自動生成)" : "(官方字幕)"}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 animate-fade-in">
                          <div className="flex items-center justify-between gap-2">
                            <label className="block text-xs font-bold text-slate-300">
                              字幕名稱/語言：
                            </label>
                            <input 
                              type="text" 
                              value={manualLanguageName}
                              onChange={(e) => setManualLanguageName(e.target.value)}
                              className="px-2.5 py-1 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs w-48 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder="例如：繁體中文 (手動)"
                            />
                          </div>

                          <div className="border border-dashed border-slate-700 hover:border-indigo-500/50 bg-slate-800/30 rounded-xl p-3 text-center transition-colors relative group cursor-pointer">
                            <input 
                              type="file" 
                              accept=".srt,.vtt,.txt"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (evt) => {
                                    const text = evt.target?.result as string;
                                    setManualText(text);
                                    // Auto detect language name from filename if possible
                                    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                                    setManualLanguageName(nameWithoutExt + " (手動)");
                                  };
                                  reader.readAsText(file);
                                }
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex flex-col items-center gap-1">
                              <FileDown className="w-6 h-6 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                              <span className="text-xs text-slate-300">點擊或拖曳上傳 .srt / .vtt / .txt 檔案</span>
                              <span className="text-[10px] text-slate-500">上傳後系統會全自動分割時間戳段落</span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <label className="block text-[10px] font-bold text-slate-400">
                                貼上字幕內文 / 逐字稿：
                              </label>
                              <button
                                type="button"
                                onClick={toggleListening}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all shadow-sm cursor-pointer ${
                                  isListening 
                                    ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                                    : "bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30"
                                }`}
                              >
                                {isListening ? (
                                  <>
                                    <MicOff className="w-3 h-3 text-white" />
                                    <span>結束聽寫...</span>
                                  </>
                                ) : (
                                  <>
                                    <Mic className="w-3 h-3 text-indigo-400" />
                                    <span>🎙️ 語音即時聽寫</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <textarea 
                              value={manualText}
                              onChange={(e) => setManualText(e.target.value)}
                              className="w-full h-28 p-2.5 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono resize-none placeholder-slate-600"
                              placeholder={isListening ? "🎙️ 正在聆聽麥克風或喇叭播放的聲音... 請播放影片或對麥克風說話，逐字稿將自動填寫到這裡。" : "貼上您的字幕內容 (例如帶有時間戳的 SRT/VTT 內容)；或者是整篇複製的純文字逐字稿，系統會為您每 5 秒劃分一段..."}
                            />
                          </div>

                          <p className="text-[10px] text-slate-500 leading-relaxed">
                            💡 提示：本機播放器的官方字幕，或者在 YouTube 右下角「顯示逐字稿」複製出的文字，皆可以直接貼上或存成文字檔上傳喔！
                          </p>
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => setFetchedMeta(null)}
                          className="px-4 py-2 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleImportTranscript}
                          disabled={isFetchingTranscript}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg cursor-pointer flex items-center gap-1.5"
                        >
                          {isFetchingTranscript ? (
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          <span>開始載入與分析</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Features bento display */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                  <div className="p-5 bg-slate-900 rounded-2xl border border-slate-800 shadow-lg shadow-indigo-950/10 space-y-2 text-left">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs">
                      1
                    </div>
                    <h4 className="text-sm font-bold text-white">章節時間軸目錄</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      AI 為您精緻切分時間軸，點擊章節時間標籤隨心跳轉影片，節省查閱時間。
                    </p>
                  </div>

                  <div className="p-5 bg-slate-900 rounded-2xl border border-slate-800 shadow-lg shadow-purple-950/10 space-y-2 text-left">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-xs">
                      2
                    </div>
                    <h4 className="text-sm font-bold text-white">互動式心智圖</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      視覺化呈現影片的大綱論點層級，隨意展開與收合，理清邏輯架構。
                    </p>
                  </div>

                  <div className="p-5 bg-slate-900 rounded-2xl border border-slate-800 shadow-lg shadow-teal-950/10 space-y-2 text-left">
                    <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center font-bold text-xs">
                      3
                    </div>
                    <h4 className="text-sm font-bold text-white">搜尋與跳轉字幕</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      全文搜尋逐字稿，點擊字幕立即驅動 YouTube 播放器定位至該秒對話。
                    </p>
                  </div>

                  <div className="p-5 bg-slate-900 rounded-2xl border border-slate-800 shadow-lg shadow-pink-950/10 space-y-2 text-left">
                    <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-400 flex items-center justify-center font-bold text-xs">
                      4
                    </div>
                    <h4 className="text-sm font-bold text-white">AI 助教即時問答</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      針對對話逐字稿提出任何學術或技術提問，AI 助教一秒幫您找到精確回答。
                    </p>
                  </div>
                </div>

                {/* History Quick-load */}
                {history.length > 0 && (
                  <div className="pt-6 text-left space-y-3">
                    <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-wider">
                      <History className="w-4 h-4 text-indigo-400" />
                      <span>最近的學習影片：</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {history.slice(0, 2).map((item) => (
                        <div
                          key={item.videoId}
                          onClick={() => handleSelectVideo(item.videoId)}
                          className="flex gap-3 p-3 bg-slate-900 rounded-2xl border border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 cursor-pointer shadow-lg hover:shadow-indigo-950/10 transition-all group"
                        >
                          <img
                            src={item.thumbnailUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-24 h-14 rounded-lg object-cover bg-slate-800 border border-slate-700 flex-shrink-0"
                          />
                          <div className="min-w-0 flex flex-col justify-between">
                            <h4 className="text-xs font-bold text-slate-200 line-clamp-2 leading-tight group-hover:text-indigo-400">
                              {item.title}
                            </h4>
                            <p className="text-[10px] text-slate-400 mt-1 truncate">
                              {item.author}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          ) : (
            
            /* Active Video Learning Split Workspace */
            <div className="h-full flex flex-col lg:flex-row overflow-hidden">
              
              {/* Left Column (Video player, meta tags, config) */}
              <div className="w-full lg:w-1/2 p-4 lg:p-6 border-r border-slate-800 flex flex-col gap-4 overflow-y-auto h-full bg-slate-950">
                
                {/* Back to Home Button */}
                <button
                  onClick={() => {
                    setActiveVideoId(null);
                    setFetchedMeta(null);
                    setInputUrl("");
                    setErrorMessage(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 w-fit rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
                >
                  <span>← 返回儀表板</span>
                </button>

                {/* Player embed aspect-video wrapper */}
                <div className="w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-slate-800 relative">
                  {playerIframeSrc ? (
                    <iframe
                      id="youtube-player"
                      src={playerIframeSrc}
                      title="YouTube Video Player"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                      正在加載影片播放器...
                    </div>
                  )}
                </div>

                {/* Active Video Meta Info Display */}
                {activeVideo && (
                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800/80 shadow-md space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                          {activeVideo.title}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">
                          頻道名稱：{activeVideo.author}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1.5 border-t border-slate-800 text-[11px] font-semibold text-slate-400">
                      <span className="bg-slate-800 px-2 py-0.5 rounded-md text-slate-300">
                        字幕語言：{activeVideo.selectedLanguage}
                      </span>
                      <span className="bg-slate-800 px-2 py-0.5 rounded-md text-slate-300">
                        逐字稿長度：{activeVideo.transcript.length} 行
                      </span>
                    </div>
                  </div>
                )}

                {/* Language change dropdown within workspace */}
                {activeVideo && activeVideo.captionTracks.length > 1 && (
                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800/80 shadow-md space-y-2">
                    <label className="block text-xs font-bold text-slate-300">
                      重新載入其他字幕語言：
                    </label>
                    <div className="flex gap-2">
                      <select
                        onChange={async (e) => {
                          const idx = Number(e.target.value);
                          const track = activeVideo.captionTracks[idx];
                          setIsFetchingTranscript(true);
                          setErrorMessage(null);
                          try {
                            const res = await fetch("/api/youtube/transcript", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ baseUrl: track.baseUrl }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error);

                            const updated = history.map((item) => {
                              if (item.videoId === activeVideo.videoId) {
                                return {
                                  ...item,
                                  selectedLanguage: track.name,
                                  transcript: data.transcript,
                                  summary: null, // Reset summary since language changed
                                };
                              }
                              return item;
                            });
                            saveHistory(updated);
                          } catch (err: any) {
                            setErrorMessage("切換字幕失敗: " + err.message);
                          } finally {
                            setIsFetchingTranscript(false);
                          }
                        }}
                        className="flex-1 p-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs focus:outline-none"
                      >
                        {activeVideo.captionTracks.map((t, idx) => (
                          <option key={idx} value={idx} selected={t.name === activeVideo.selectedLanguage} className="bg-slate-800 text-slate-200">
                            {t.name} {t.isAutoGenerated ? "(自動生成)" : "(官方字幕)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

              </div>

              {/* Right Column (AI Workspace Tabs) */}
              <div className="w-full lg:w-1/2 flex flex-col h-full overflow-hidden bg-slate-950">
                
                {/* Workspace tab selector */}
                <div className="flex border-b border-slate-800 overflow-x-auto flex-shrink-0 bg-slate-900/50 shadow-md z-10 scrollbar-none">
                  {TABS.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 px-4.5 py-4 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                          isActive
                            ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                            : "border-transparent text-slate-400 hover:text-white hover:bg-slate-800/30"
                        }`}
                      >
                        <TabIcon className="w-4 h-4" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab content panel */}
                <div className="flex-1 overflow-hidden relative">
                  {activeVideo && (
                    <>
                      {activeTab === "summary" && (
                        <SummaryView
                          summary={activeVideo.summary}
                          videoTitle={activeVideo.title}
                          isGenerating={isGeneratingSummary}
                          onGenerate={handleGenerateSummary}
                          onSeek={handleSeek}
                        />
                      )}

                      {activeTab === "mindmap" && (
                        <MindmapView
                          mindmap={activeVideo.summary?.mindmap}
                          isGeneratingSummary={isGeneratingSummary}
                          onGenerateSummary={handleGenerateSummary}
                        />
                      )}

                      {activeTab === "transcript" && (
                        <TranscriptView
                          transcript={activeVideo.transcript}
                          currentTime={currentTime}
                          onSeek={handleSeek}
                          onUpdateTranscript={(newTranscript) => {
                            const updated = history.map((item) => {
                              if (item.videoId === activeVideo.videoId) {
                                return {
                                  ...item,
                                  transcript: newTranscript,
                                  summary: null, // Clear summary to allow re-generating with the new transcript
                                };
                              }
                              return item;
                            });
                            saveHistory(updated);
                          }}
                        />
                      )}

                      {activeTab === "chat" && (
                        <ChatView
                          chatHistory={activeVideo.chatHistory}
                          onSendMessage={handleSendChatMessage}
                          isSending={isSendingChatMessage}
                          videoTitle={activeVideo.title}
                        />
                      )}

                      {activeTab === "notes" && (
                        <NotesView
                          notes={activeVideo.notes}
                          onChangeNotes={handleNotesChange}
                          currentTime={currentTime}
                          onSeek={handleSeek}
                        />
                      )}
                    </>
                  )}
                </div>

              </div>

            </div>
          )}
        </div>

      </div>

    </div>
  );
}
