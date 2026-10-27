// DB スキーマ（supabase/migrations）に対応する型

export type ConversationStatus =
  | 'ai_handling'
  | 'resolved_by_ai'
  | 'escalated'
  | 'queued'
  | 'operator_handling'
  | 'closed'

export type SenderType = 'customer' | 'ai' | 'operator' | 'system'

export interface Conversation {
  id: string
  customer_id: string
  status: ConversationStatus
  category: string | null
  assigned_operator_id: string | null
  is_after_hours: boolean
  customer_email: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface Message {
  id: string
  conversation_id: string
  sender_type: SenderType
  sender_operator_id: string | null
  body: string
  used_faq_ids: string[]
  created_at: string
}

export const MESSAGE_MAX_LENGTH = 1000
