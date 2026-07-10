import React, { useState, useRef, useEffect } from "react";
import { ChatMessage } from "../types";
import { MessageSquare, Send, Sparkles, User, RefreshCw, AlertCircle } from "lucide-react";

interface ChatViewProps {
  chatHistory: ChatMessage[];
  onSendMessage: (text: string) => void;
  isSending: boolean;
  videoTitle: string;
}

const SUGGESTIONS = [
  "這部影片的核心觀點是什麼？",
  "可以幫我詳細列出這部影片的結構與大綱嗎？",
  "影片中有提到什麼具體的建議、步驟或行動方案？",
  "請用一分鐘能看完的字數簡短摘要這段對話。"
];

export default function ChatView({
  chatHistory,
  onSendMessage,
  isSending,
  videoTitle,
}: ChatViewProps) {
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, isSending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;
    onSendMessage(inputText.trim());
    setInputText("");
  };

  const handleSuggestionClick = (text: string) => {
    if (isSending) return;
    onSendMessage(text);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <MessageSquare className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">AI 影片學習助手</h3>
            <p className="text-[10px] text-slate-400">依據影片逐字稿為您精準答疑</p>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl mb-3 animate-bounce">
              <Sparkles className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-bold text-slate-200 mb-1">
              我是您的 AI 影片助教
            </h4>
            <p className="text-xs text-slate-400 max-w-xs mb-6 leading-relaxed">
              我已讀完這部影片的逐字稿。對影片中的內容有疑問嗎？儘管提問，我將根據對話為您詳細解答！
            </p>

            {/* Suggestions Pills */}
            <div className="w-full max-w-md space-y-2 text-left">
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-2 text-center">
                試試看這樣問：
              </p>
              {SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(s)}
                  disabled={isSending}
                  className="w-full text-left p-2.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-indigo-500/10 hover:border-indigo-500/30 text-xs text-slate-300 hover:text-white transition-all font-medium shadow-md cursor-pointer disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {chatHistory.map((msg) => {
              const isAi = msg.role === "assistant";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-[85%] ${
                    isAi ? "mr-auto" : "ml-auto flex-row-reverse"
                  }`}
                >
                  {/* Avatar icon */}
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-md ${
                      isAi
                        ? "bg-slate-800 text-indigo-400"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {isAi ? <Sparkles className="w-4 h-4 text-indigo-400" /> : <User className="w-4 h-4" />}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`p-3.5 rounded-2xl text-sm leading-relaxed ${
                      isAi
                        ? "bg-slate-900 text-slate-200 border border-slate-800/80 shadow-md rounded-tl-none"
                        : "bg-indigo-600 text-white rounded-tr-none shadow-md"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <span
                      className={`block text-[9px] mt-1.5 text-right ${
                        isAi ? "text-slate-500" : "text-indigo-200"
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* AI is thinking loader */}
            {isSending && (
              <div className="flex gap-3 max-w-[80%] mr-auto items-center">
                <div className="w-8 h-8 rounded-xl bg-slate-800 text-indigo-400 flex items-center justify-center animate-spin">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div className="px-4 py-2.5 bg-slate-900 rounded-2xl border border-slate-800 shadow-md text-xs text-slate-400 font-medium flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span>AI 正在分析回答...</span>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        )}
      </div>

      {/* Input section */}
      <div className="p-4 bg-slate-900 border-t border-slate-800">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder={isSending ? "助教正在思考中..." : "輸入關於影片的問題..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isSending}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-slate-800 text-white placeholder-slate-500 transition-all disabled:opacity-75"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-850 text-white disabled:text-slate-500 font-semibold rounded-xl transition-all shadow-md active:scale-98 flex items-center justify-center cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
