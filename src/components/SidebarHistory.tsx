import React, { useState } from "react";
import { ProcessedVideo } from "../types";
import { History, Trash2, Search, ExternalLink, Video, PlusCircle, CheckCircle } from "lucide-react";

interface SidebarHistoryProps {
  history: ProcessedVideo[];
  activeVideoId: string | null;
  onSelectVideo: (videoId: string) => void;
  onDeleteVideo: (videoId: string) => void;
  onNewVideoClick: () => void;
}

export default function SidebarHistory({
  history,
  activeVideoId,
  onSelectVideo,
  onDeleteVideo,
  onNewVideoClick,
}: SidebarHistoryProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredHistory = history.filter((v) =>
    v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.author.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full md:w-80 border-r border-slate-800 bg-slate-900 flex flex-col h-full flex-shrink-0">
      {/* Header section */}
      <div className="p-4 border-b border-slate-800 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold text-white text-lg">
            <History className="w-5 h-5 text-indigo-400" />
            <span>學習歷史記錄</span>
          </div>
          <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full font-semibold">
            {history.length} 部影片
          </span>
        </div>

        <button
          onClick={onNewVideoClick}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-900/20 active:scale-98 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>分析新影片</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="px-4 py-2 border-b border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="搜尋標題、頻道名稱..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-slate-800 text-white placeholder-slate-500 transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-slate-500">
            <Video className="w-10 h-10 text-slate-600 mb-2 stroke-1" />
            <p className="text-sm text-slate-400">
              {searchQuery ? "找不到符合的歷史紀錄" : "尚未分析任何影片"}
            </p>
            {!searchQuery && (
              <p className="text-xs mt-1 text-slate-500">
                在上方輸入 URL 開始分析您的第一部 YouTube 影片吧！
              </p>
            )}
          </div>
        ) : (
          filteredHistory.map((video) => {
            const isActive = video.videoId === activeVideoId;
            return (
              <div
                key={video.videoId}
                className={`group relative flex gap-3 p-2.5 rounded-xl transition-all border cursor-pointer ${
                  isActive
                    ? "bg-indigo-500/10 border-indigo-500/40 hover:bg-indigo-500/15"
                    : "bg-slate-900 hover:bg-slate-800 border-transparent hover:border-slate-800"
                }`}
                onClick={() => onSelectVideo(video.videoId)}
              >
                {/* Thumbnail */}
                <div className="relative w-20 h-12 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0 border border-slate-700">
                  <img
                    src={video.thumbnailUrl || `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`}
                    alt={video.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {video.summary && (
                    <div className="absolute top-0.5 right-0.5 bg-green-500 text-white rounded-full p-0.5" title="重點摘要已生成">
                      <CheckCircle className="w-3 h-3 fill-current text-white stroke-2" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-6">
                  <h4
                    className={`text-xs font-semibold line-clamp-2 leading-tight ${
                      isActive ? "text-indigo-300" : "text-slate-200"
                    }`}
                  >
                    {video.title}
                  </h4>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-slate-400 truncate max-w-[120px]">
                      {video.author}
                    </p>
                    <span className="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded font-mono">
                      {video.selectedLanguage.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Hover Delete Action */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteVideo(video.videoId);
                  }}
                  className="absolute right-2 bottom-2 p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-950/50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="刪除紀錄"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer info */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/50 text-center">
        <a
          href="https://youtube.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-400 transition-colors"
        >
          <span>開啟 YouTube 官方網站</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
