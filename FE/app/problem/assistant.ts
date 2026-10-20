export type ChatRole = "user" | "assistant";
export type ChatTurn = { role: ChatRole; content: string };

export const MAX_HISTORY_TURNS = 10;

export function withTurn(history: ChatTurn[], turn: ChatTurn): ChatTurn[] {
  return [...history, turn].slice(-MAX_HISTORY_TURNS);
}
