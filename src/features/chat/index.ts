// Chat feature barrel.

export { useChatStream, useIsStreaming } from "./model/useChatStream";
export type { ChatStreamActions, SendMessageInput } from "./model/useChatStream";
export {
  useChatStreamStore,
  isStreamActive,
  getStreamForConversation,
} from "./model/chatStreamStore";
export type { ActiveStreamState, StreamStatus } from "./model/chatStreamStore";
export { useConversations, useConversation } from "./model/useConversations";
export { useMessages, messagesQueryKey, useOptimisticMessageAppend } from "./model/useMessages";
export { createSseParser, tryParseSseData } from "./lib/sseParser";
export type { SseParsedEvent, SseParser } from "./lib/sseParser";
export { MessageList } from "./ui/MessageList";
export { MessageBubble } from "./ui/MessageBubble";
export { Composer } from "./ui/Composer";
export type { ComposerSendInput } from "./ui/Composer";
export { MarkdownRenderer } from "./ui/MarkdownRenderer";
export { CodeBlock } from "./ui/CodeBlock";
export { StopGeneratingButton } from "./ui/StopGeneratingButton";
export { ScrollToBottomButton } from "./ui/ScrollToBottomButton";
export { ThinkingIndicator } from "./ui/ThinkingIndicator";
export { StreamingCursor } from "./ui/StreamingCursor";
export { DateSeparator } from "./ui/DateSeparator";
export { MessageActions } from "./ui/MessageActions";
