import React, { useState, useMemo } from "react";
import { Clock, Save, Edit2, Eye, HelpCircle, FileDown, PlusCircle } from "lucide-react";

interface NotesViewProps {
  notes: string;
  onChangeNotes: (notes: string) => void;
  currentTime: number;
  onSeek: (seconds: number) => void;
}

export default function NotesView({
  notes,
  onChangeNotes,
  currentTime,
  onSeek,
}: NotesViewProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [saveStatus, setSaveStatus] = useState("已自動儲存");

  // Helper: format seconds into [MM:SS]
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `[${m < 10 ? `0${m}` : m}:${s < 10 ? `0${s}` : s}]`;
  };

  // Convert time string [MM:SS] or [HH:MM:SS] to total seconds
  const parseTimeToSeconds = (timeStr: string): number => {
    const clean = timeStr.replace(/[\[\]]/g, "");
    const parts = clean.split(":").map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  };

  // Insert timestamp tag at the cursor's location
  const handleInsertTimestamp = () => {
    const textarea = document.getElementById("study-notes-textarea") as HTMLTextAreaElement;
    const timestamp = formatTime(currentTime);
    const tag = ` ${timestamp} `;
    
    if (!textarea) {
      // Fallback if textarea not loaded
      onChangeNotes(notes + tag);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end);

    const updatedText = before + tag + after;
    onChangeNotes(updatedText);

    // Save indicator
    setSaveStatus("正在儲存...");
    setTimeout(() => setSaveStatus("已自動儲存"), 500);

    // Focus back on the textarea and set cursor position after the tag
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + tag.length;
    }, 50);
  };

  // Auto-save typing helper
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChangeNotes(e.target.value);
    setSaveStatus("正在儲存...");
    // Mock save complete since we update local state on the fly
    setTimeout(() => setSaveStatus("已自動儲存"), 500);
  };

  // Export notes as markdown file
  const handleDownloadMarkdown = () => {
    const blob = new Blob([notes], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `notes_${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Render Note text replacing timestamp pattern [MM:SS] with clickable buttons
  const renderedPreview = useMemo(() => {
    if (!notes.trim()) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
          <Edit2 className="w-10 h-10 text-slate-800 mb-2 stroke-1" />
          <p className="text-sm text-slate-400">筆記內容為空</p>
          <p className="text-xs mt-1 text-slate-500">
            切換至「編輯模式」記錄您的第一條學習筆記！
          </p>
        </div>
      );
    }

    // Split text by lines
    const lines = notes.split("\n");

    return (
      <div className="space-y-2.5 text-sm text-slate-300 leading-relaxed max-w-none">
        {lines.map((line, idx) => {
          // Find any occurrence of [00:00] or [00:00:00] style timestamps
          const timestampRegex = /\[\d{1,2}:\d{2}(?::\d{2})?\]/g;
          const parts = line.split(timestampRegex);
          const matches = line.match(timestampRegex) || [];

          if (matches.length === 0) {
            return <p key={idx} className="min-h-[1.5em]">{line}</p>;
          }

          return (
            <p key={idx} className="flex flex-wrap items-center gap-1.5 min-h-[1.5em]">
              {parts.map((part, pIdx) => (
                <React.Fragment key={pIdx}>
                  <span>{part}</span>
                  {matches[pIdx] && (
                    <button
                      onClick={() => onSeek(parseTimeToSeconds(matches[pIdx]))}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-500/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/20 hover:border-transparent font-mono text-xs font-bold rounded transition-colors shadow-sm cursor-pointer"
                      title="點擊跳轉影片時間"
                    >
                      <Clock className="w-3 h-3" />
                      <span>{matches[pIdx]}</span>
                    </button>
                  )}
                </React.Fragment>
              ))}
            </p>
          );
        })}
      </div>
    );
  }, [notes, onSeek]);

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Tab bar and save indicators */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("edit")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "edit"
                ? "bg-slate-950 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>編輯模式</span>
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "preview"
                ? "bg-slate-950 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>預覽模式</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400 font-medium animate-pulse">
            {saveStatus}
          </span>
          <button
            onClick={handleDownloadMarkdown}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-indigo-400 transition-all cursor-pointer"
            title="下載筆記 (.md)"
          >
            <FileDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Insert Tool Rail */}
      <div className="px-4 py-2 bg-slate-900/30 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleInsertTimestamp}
            className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md active:scale-98 transition-all cursor-pointer"
            title="將影片當前的播放秒數插至目前游標位置"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>插入當前時間戳 {formatTime(currentTime)}</span>
          </button>
        </div>

        <div className="group relative flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-300 transition-colors cursor-help">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>格式技巧</span>
          {/* Tooltip */}
          <div className="absolute right-0 bottom-6 w-56 p-2.5 bg-slate-800 text-slate-200 border border-slate-700 text-[10px] leading-relaxed rounded-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20 shadow-xl">
            在編輯區輸入例如 <code className="bg-slate-700 px-1 py-0.2 rounded font-mono">[01:23]</code> 的時間格式，在預覽模式下即會自動轉化為「可點擊的跳轉時間按鈕」喔！
          </div>
        </div>
      </div>

      {/* Workspace Area */}
      <div className="flex-1 p-4 overflow-y-auto">
        {activeTab === "edit" ? (
          <textarea
            id="study-notes-textarea"
            value={notes}
            onChange={handleTextChange}
            placeholder={`在此記錄您的筆記...
您可以：
1. 點擊「插入當前時間戳」在特定句子前方標記影片播放點
2. 自由輸入文字、符號與大綱結構
3. 切換至「預覽模式」來點擊時間戳記、回到影片對應內容撥放！`}
            className="w-full h-full min-h-[300px] resize-none focus:outline-none text-slate-200 text-sm leading-relaxed placeholder-slate-600 font-sans bg-transparent"
          />
        ) : (
          <div className="prose prose-indigo max-w-none bg-slate-900/40 p-4 rounded-xl border border-slate-800 min-h-full">
            {renderedPreview}
          </div>
        )}
      </div>
    </div>
  );
}
