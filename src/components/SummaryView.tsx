import React, { useState, useEffect } from "react";
import { VideoSummary } from "../types";
import { Sparkles, Calendar, BookOpen, Clock, Play, FileText, ChevronRight } from "lucide-react";

interface SummaryViewProps {
  summary: VideoSummary | null;
  videoTitle: string;
  isGenerating: boolean;
  onGenerate: () => void;
  onSeek: (seconds: number) => void;
}

const LOADING_STEPS = [
  "正在深入分析完整影片逐字稿...",
  "正在辨識與劃分段落章節主題...",
  "正在為您淬煉 3~5 大核心知識點...",
  "正在統整邏輯並產出心智圖樹狀圖...",
  "報告即將完成，請稍候..."
];

export default function SummaryView({
  summary,
  videoTitle,
  isGenerating,
  onGenerate,
  onSeek,
}: SummaryViewProps) {
  const [loadingStep, setLoadingStep] = useState(0);

  // Cycle loading steps
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % LOADING_STEPS.length);
      }, 3500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating]);

  // Format seconds to time label
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? `0${m}` : m}:${s < 10 ? `0${s}` : s}`;
  };

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[300px] bg-slate-950">
        {isGenerating ? (
          <div className="flex flex-col items-center max-w-sm px-4">
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin flex items-center justify-center" />
              <Sparkles className="w-6 h-6 text-indigo-400 absolute top-5 left-5 animate-pulse" />
            </div>
            <h3 className="text-base font-semibold text-slate-200 mb-2">
              AI 學習秘書正在全力處理中
            </h3>
            <p className="text-sm text-indigo-400 font-medium h-6 animate-pulse">
              {LOADING_STEPS[loadingStep]}
            </p>
            <p className="text-xs text-slate-550 mt-4 leading-relaxed">
              分析時間長度取決於影片字幕的多寡，通常約需 5-15 秒。
            </p>
          </div>
        ) : (
          <div className="max-w-md p-6 border border-dashed border-slate-800 rounded-3xl bg-slate-900/60 backdrop-blur-md flex flex-col items-center">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl mb-4">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 font-display">
              生成 AI 影片重點報告
            </h3>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              點擊下方按鈕，AI 將深度閱讀整部影片的對話，為您自動提煉「高階核心大綱」、「關鍵學習要點」與「章節時間軸目錄」。
            </p>
            <button
              onClick={onGenerate}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl shadow-lg active:scale-98 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>立即生成重點報告</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 space-y-6 bg-slate-950">
      {/* Title block */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900 p-5 rounded-2xl border border-indigo-500/20 shadow-md">
        <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold mb-1.5 uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI 影片精華分析報告</span>
        </div>
        <h2 className="text-lg font-bold text-white font-display leading-tight mb-2">
          {summary.title || videoTitle}
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed font-normal">
          {summary.overallSummary}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Key Takeaways (Left/Top) */}
        <div className="xl:col-span-7 flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <BookOpen className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white font-display">
              影片 3 大關鍵學習要點
            </h3>
          </div>

          <div className="space-y-4">
            {summary.keyTakeaways.map((item, index) => (
              <div
                key={index}
                className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md hover:border-slate-700 transition-all animate-fade-in"
              >
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-300 flex items-center justify-center font-mono font-bold text-xs mt-0.5">
                    {index + 1}
                  </span>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-200">
                      {item.point}
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chapters Timeline (Right/Bottom) */}
        <div className="xl:col-span-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <div className="p-1.5 bg-purple-500/10 text-purple-400 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white font-display">
              精彩章節時間軸
            </h3>
          </div>

          <div className="relative border-l border-slate-800 ml-4 pl-6 space-y-4 py-2">
            {summary.chapters.map((chapter, index) => (
              <div key={index} className="relative group">
                {/* Timeline Dot Icon */}
                <button
                  onClick={() => onSeek(chapter.seconds)}
                  className="absolute -left-[35px] top-0.5 w-6 h-6 rounded-full bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-transparent text-slate-400 hover:text-white flex items-center justify-center transition-all shadow-sm cursor-pointer"
                  title="點擊跳轉播放"
                >
                  <Play className="w-2 h-2 fill-current" />
                </button>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSeek(chapter.seconds)}
                      className="font-mono text-xs font-bold text-indigo-400 hover:underline cursor-pointer bg-indigo-500/10 px-2 py-0.5 rounded-md"
                    >
                      {chapter.timeLabel || formatTime(chapter.seconds)}
                    </button>
                    <h4 className="text-sm font-bold text-slate-200">
                      {chapter.title}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed pl-1">
                    {chapter.summary}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
