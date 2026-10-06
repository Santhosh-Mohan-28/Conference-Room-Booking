"use client";

import React, { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  X,
  Send,
  Bot,
  User,
  Sparkles,
  Calendar,
  Clock,
  Building,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { UserSession, ChatPendingAction } from "@/types";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
  pendingAction?: ChatPendingAction | null;
  actionExecuted?: "BOOKING_CREATED" | "BOOKING_REQUEST_CREATED" | "CANCELLED" | null;
}

export function ChatbotDrawer() {
  const { data: session } = useSession();
  const user = session?.user as unknown as UserSession;
  const isAdmin = user?.role === "ADMIN";
  const pathname = usePathname();

  // Extract room ID from URL if user is viewing /rooms/[id]
  const roomContextId = pathname?.startsWith("/rooms/") && pathname !== "/rooms/new"
    ? pathname.replace("/rooms/", "").split("/")[0]
    : null;

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<ChatPendingAction | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "bot",
      text: `Hello ${user?.name || "there"}! I'm your Conference Assistant. You can ask me to check availability or schedule rooms using natural language.\n\nTry saying: "Book Conference Room A from 5 to 6pm tomorrow."`,
      timestamp: new Date(),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend || input).trim();
    if (!messageText || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          roomContextId: roomContextId || undefined,
          pendingAction,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to process message");
      }

      const botReply = json.data?.reply || "I encountered an issue processing your request.";
      const updatedPendingAction = json.data?.pendingAction ?? null;
      setPendingAction(updatedPendingAction);

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: botReply,
        timestamp: new Date(),
        pendingAction: updatedPendingAction,
        actionExecuted: json.data?.actionExecuted,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          sender: "bot",
          text: `Error: ${err.message || "Failed to process request. Please try again."}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = () => {
    handleSendMessage("Yes");
  };

  const handleCancelAction = () => {
    handleSendMessage("Cancel");
  };

  if (!user) return null;

  return (
    <>
      {/* Floating Trigger Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Open AI Booking Assistant"
          className="group relative flex items-center space-x-2.5 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl shadow-xl shadow-blue-500/25 transition-all duration-200 transform hover:scale-[1.02] active:scale-95"
        >
          <div className="relative">
            <Bot className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-blue-600 animate-pulse" />
          </div>
          <span className="text-xs font-bold tracking-wide">
            {isOpen ? "Close Assistant" : "AI Assistant"}
          </span>
        </button>
      </div>

      {/* Slide-over Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold">Conference Assistant</h3>
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                      {isAdmin ? "Admin" : "Employee"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isAdmin
                      ? "Direct booking with confirmation"
                      : "Booking requests with admin review"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div className="flex items-end space-x-2 max-w-[90%]">
                    {msg.sender === "bot" && (
                      <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0 mb-1">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                    )}

                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                        msg.sender === "user"
                          ? "bg-blue-600 text-white rounded-br-xs shadow-xs"
                          : "bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs shadow-xs whitespace-pre-line"
                      }`}
                    >
                      {msg.text}
                    </div>

                    {msg.sender === "user" && (
                      <div className="w-6 h-6 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center flex-shrink-0 mb-1">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  {/* Pending Confirmation Visual Card */}
                  {msg.pendingAction && (
                    <div className="mt-3 ml-8 p-3.5 rounded-xl bg-blue-50 border border-blue-200 max-w-[85%] text-xs space-y-2.5">
                      <div className="font-bold text-blue-900 flex items-center space-x-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>Action Details</span>
                      </div>
                      <div className="space-y-1 text-slate-700 text-[11px]">
                        <div><strong>Room:</strong> {msg.pendingAction.roomName}</div>
                        <div><strong>Date:</strong> {msg.pendingAction.formattedDate}</div>
                        <div><strong>Time:</strong> {msg.pendingAction.startTime} – {msg.pendingAction.endTime} (24-hour)</div>
                      </div>

                      <div className="pt-2 border-t border-blue-200/70 flex items-center space-x-2">
                        <button
                          onClick={handleConfirmAction}
                          disabled={loading}
                          className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center space-x-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isAdmin ? "Yes, Book It" : "Yes, Send Request"}</span>
                        </button>
                        <button
                          onClick={handleCancelAction}
                          disabled={loading}
                          className="py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center space-x-1"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex items-center space-x-2 text-xs text-slate-400 p-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Processing request...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Suggestions when idle */}
            {!pendingAction && messages.length <= 3 && (
              <div className="p-2.5 bg-slate-100 border-t border-slate-200 flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleSendMessage("Book this room tomorrow from 5 to 6pm")}
                  className="px-2.5 py-1 text-[10px] bg-white text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Book tomorrow 5 to 6pm
                </button>
                <button
                  onClick={() => handleSendMessage("Are any rooms available tomorrow at 10am?")}
                  className="px-2.5 py-1 text-[10px] bg-white text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Check tomorrow 10am
                </button>
              </div>
            )}

            {/* Input Bar */}
            <div className="p-3 bg-white border-t border-slate-200">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center space-x-2"
              >
                <input
                  type="text"
                  placeholder={
                    pendingAction
                      ? "Type 'Yes' to confirm or 'No' to cancel..."
                      : "Type a booking request..."
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
