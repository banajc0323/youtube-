import React, { useState } from "react";
import { MindmapNode } from "../types";
import { GitPullRequest, ChevronDown, ChevronRight, Sparkles } from "lucide-react";

interface MindmapViewProps {
  mindmap: MindmapNode | undefined;
  isGeneratingSummary: boolean;
  onGenerateSummary: () => void;
}

// Recursive Node Component
function MindmapTreeNode({
  node,
  level = 0,
}: {
  node: MindmapNode;
  level: number;
  key?: React.Key;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  // Custom colors based on tree level
  const levelStyles = [
    // Level 0 (Central Topic)
    "bg-indigo-600 text-white border-indigo-700 font-bold text-base shadow-lg px-5 py-3 rounded-2xl",
    // Level 1 (Main branches)
    "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 font-bold text-sm shadow-md px-4 py-2.5 rounded-xl",
    // Level 2 (Sub-topics)
    "bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-lg",
  ];

  const levelColorLine = [
    "border-indigo-500",
    "border-purple-500",
    "border-slate-700",
  ];

  return (
    <div className="flex flex-col ml-4 sm:ml-8 relative">
      {/* Connector lines */}
      {level > 0 && (
        <div
          className={`absolute -left-4 sm:-left-6 top-5 bottom-0 border-l-2 border-dashed ${
            levelColorLine[Math.min(level - 1, levelColorLine.length - 1)]
          }`}
        />
      )}

      {/* Node content block */}
      <div className="flex items-center gap-2 my-1.5 relative">
        {/* Horizontal connector line */}
        {level > 0 && (
          <div
            className={`absolute w-4 sm:w-6 -left-4 sm:-left-6 top-1/2 border-t-2 border-dashed -translate-y-1/2 ${
              levelColorLine[Math.min(level - 1, levelColorLine.length - 1)]
            }`}
          />
        )}

        {/* Expand/Collapse Trigger */}
        {hasChildren && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-colors z-10 cursor-pointer"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {/* Node Label Box */}
        <div
          className={`border transition-all flex items-center gap-1.5 ${
            levelStyles[Math.min(level, levelStyles.length - 1)]
          } ${hasChildren ? "" : "ml-6"}`}
        >
          {level === 0 && <GitPullRequest className="w-5 h-5" />}
          <span>{node.label}</span>
        </div>
      </div>

      {/* Children list with spacing */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col gap-1">
          {node.children!.map((child, idx) => (
            <MindmapTreeNode key={idx} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MindmapView({
  mindmap,
  isGeneratingSummary,
  onGenerateSummary,
}: MindmapViewProps) {
  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[300px] bg-slate-950">
        {isGeneratingSummary ? (
          <div className="flex flex-col items-center max-w-sm px-4">
            <div className="w-12 h-12 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin mb-4" />
            <h3 className="text-sm font-semibold text-slate-200 mb-1">
              正在繪製影片心智圖
            </h3>
            <p className="text-xs text-slate-500">
              AI 正在為您理清影片內容論點的脈絡...
            </p>
          </div>
        ) : (
          <div className="max-w-md p-6 border border-dashed border-slate-800 rounded-3xl bg-slate-900/60 backdrop-blur-md flex flex-col items-center">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl mb-4">
              <GitPullRequest className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 font-display">
              生成影片結構心智圖
            </h3>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              分析逐字稿並轉換為樹狀的心智圖結構，幫助您一眼看懂整部影片的論點、子主題與邏輯關聯。
            </p>
            <button
              onClick={onGenerateSummary}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl shadow-lg active:scale-98 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>立即生成心智圖與重點</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 overflow-y-auto">
      {/* Header info */}
      <div className="mb-6 pb-4 border-b border-slate-800">
        <h3 className="text-base font-bold text-white flex items-center gap-2 font-display">
          <GitPullRequest className="w-5 h-5 text-indigo-400" />
          <span>互動式結構心智圖</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          點擊節點旁的箭頭可以展開或收合子分支，理清影片的結構大綱與論點層級。
        </p>
      </div>

      {/* Tree stage container */}
      <div className="flex-1 min-h-[400px] border border-slate-800 rounded-2xl p-4 sm:p-6 bg-slate-900/30 overflow-x-auto">
        <div className="inline-block min-w-full">
          <MindmapTreeNode node={mindmap} level={0} />
        </div>
      </div>
    </div>
  );
}
