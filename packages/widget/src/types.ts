export type SenderType = "customer" | "ai" | "operator" | "system";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  body: string;
  created_at: string;
}
