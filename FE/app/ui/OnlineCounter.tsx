"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SESSION_KEY = "cdl-session-id";
const HEARTBEAT_MS = 5_000;

function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export default function OnlineCounter({
  className = "",
}: {
  className?: string;
}) {
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    let stopped = false;
    const sessionId = getSessionId();

    const heartbeat = async () => {
      try {
        const res = await fetch(`${API_URL}/api/presence/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped && typeof data.online === "number") setOnline(data.online);
      } catch {
        // Giữ số cũ khi BE offline, không làm vỡ UI
      }
    };

    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/api/presence/online`);
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped && typeof data.online === "number") setOnline(data.online);
      } catch {
        // bỏ qua
      }
    };

    heartbeat();
    const hbTimer = setInterval(heartbeat, HEARTBEAT_MS);
    const pollTimer = setInterval(poll, HEARTBEAT_MS);

    const handleLeave = () => {
      try {
        const blob = new Blob([JSON.stringify({ sessionId })], {
          type: "application/json",
        });
        navigator.sendBeacon(`${API_URL}/api/presence/leave`, blob);
      } catch {
        // bỏ qua
      }
    };
    window.addEventListener("pagehide", handleLeave);

    return () => {
      stopped = true;
      clearInterval(hbTimer);
      clearInterval(pollTimer);
      window.removeEventListener("pagehide", handleLeave);
    };
  }, []);

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100/90 border border-zinc-200/80 text-[11px] font-mono text-zinc-600 ${className}`}
      title="Số người đang online"
    >
      <span className="relative flex w-1.5 h-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
      </span>
      <span>{online === null ? "Đang tải…" : `${online} đang online`}</span>
    </span>
  );
}
