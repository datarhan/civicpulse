import type { Context, SessionFlavor } from 'grammy'
import type { Conversation, ConversationFlavor } from '@grammyjs/conversations'

export interface SessionData {
  // Reserved for future use.
}

export type MyContext = ConversationFlavor<Context & SessionFlavor<SessionData>>
export type MyConversation = Conversation<MyContext, MyContext>
