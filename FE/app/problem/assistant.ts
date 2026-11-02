export type ChatRole = "user" | "assistant";
export type ChatTurn = { role: ChatRole; content: string };

export const MAX_HISTORY_TURNS = 10;
export const MAX_MESSAGE_LENGTH = 2000;

export function withTurn(history: ChatTurn[], turn: ChatTurn): ChatTurn[] {
  return [...history, turn].slice(-MAX_HISTORY_TURNS);
}

export type ChatUser = { name: string | null; email: string };

export function displayNameOf(user: ChatUser | null | undefined): string {
  if (!user) return "Bạn";
  const name = (user.name ?? "").trim();
  if (name) return name;
  const email = (user.email ?? "").trim();
  if (email) return email;
  return "Bạn";
}

export function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

export interface ChatErrorPayload {
  status: number;
  message?: string | null;
}

export function errorMessageFor({ status, message }: ChatErrorPayload): string {
  if (status === 401) return "Phiên đã hết hạn, hãy đăng nhập lại.";
  if (status === 429) return "Bạn hỏi hơi nhanh, thử lại sau một phút.";
  if (status >= 500) return "Trợ lý đang bận, thử lại sau.";
  const trimmed = (message ?? "").trim();
  return trimmed || "Trợ lý đang bận, thử lại sau.";
}

export function trimMessage(value: string): string {
  return value.trim().slice(0, MAX_MESSAGE_LENGTH);
}
