import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { MESSAGE_MAX_LENGTH, type Conversation, type Message } from './types'

/** 顧客が新しい会話を作る。customer_id は匿名サインイン済みの auth.uid()（RLS が一致を強制） */
export async function createConversation(supabase: SupabaseClient): Promise<Conversation> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    throw new Error('匿名サインインが完了していません')
  }
  const { data, error } = await supabase
    .from('conversations')
    .insert({ customer_id: userData.user.id })
    .select()
    .single()
  if (error) throw error
  return data as Conversation
}

/** 顧客としてメッセージを送る（sender_type は RLS 上 'customer' のみ許可） */
export async function sendCustomerMessage(
  supabase: SupabaseClient,
  conversationId: string,
  body: string,
): Promise<Message> {
  const text = body.trim()
  if (text.length === 0 || text.length > MESSAGE_MAX_LENGTH) {
    throw new Error(`メッセージは1〜${MESSAGE_MAX_LENGTH}文字で入力してください`)
  }
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_type: 'customer', body: text })
    .select()
    .single()
  if (error) throw error
  return data as Message
}

/** 会話の既存メッセージを古い順に取得する（購読開始前/再接続時の取りこぼし補完用） */
export async function fetchMessages(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select()
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Message[]
}

/**
 * 1つの会話の新着メッセージを購読する。戻り値の関数を呼ぶと購読解除。
 * 配信は RLS で絞られる（顧客は自分の会話のみ）。
 */
export function subscribeToMessages(
  supabase: SupabaseClient,
  conversationId: string,
  onInsert: (message: Message) => void,
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onInsert(payload.new as Message),
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

/**
 * 会話の状態変化を購読する。
 * conversationId を渡すとその会話のみ（顧客用）、省略すると見える全会話の
 * 追加・更新（オペレーター用。一覧の自動更新の土台）。
 */
export function subscribeToConversations(
  supabase: SupabaseClient,
  onChange: (event: 'INSERT' | 'UPDATE', conversation: Conversation) => void,
  conversationId?: string,
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(conversationId ? `conversation:${conversationId}` : 'conversations:all')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
        ...(conversationId ? { filter: `id=eq.${conversationId}` } : {}),
      },
      (payload) => {
        if (payload.eventType === 'DELETE') return
        onChange(payload.eventType, payload.new as Conversation)
      },
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
