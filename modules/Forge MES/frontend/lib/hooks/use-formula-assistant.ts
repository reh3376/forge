'use client'

import { useState, useCallback } from 'react'
import { useMutation } from '@apollo/client'
import {
  FORMULA_ASSISTANT_CHAT,
  FormulaAssistantMessageInput,
} from '@/lib/api/formula-assistant-queries'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function useFormulaAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const [chatMutation] = useMutation(FORMULA_ASSISTANT_CHAT)

  const sendMessage = useCallback(
    async (content: string) => {
      const userMessage: ChatMessage = { role: 'user', content }
      const updatedMessages = [...messages, userMessage]
      setMessages(updatedMessages)
      setIsLoading(true)

      try {
        const input: FormulaAssistantMessageInput[] = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const { data, errors } = await chatMutation({
          variables: { input: { messages: input } },
        })

        if (errors && errors.length > 0) {
          setMessages([
            ...updatedMessages,
            {
              role: 'assistant',
              content: `Error: ${errors[0]?.message || 'Failed to get response'}`,
            },
          ])
          return
        }

        const response = data?.formulaAssistantChat
        if (response) {
          setMessages([
            ...updatedMessages,
            { role: 'assistant', content: response.content },
          ])
        }
      } catch (error) {
        setMessages([
          ...updatedMessages,
          {
            role: 'assistant',
            content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}. Make sure OPENROUTER_API_KEY is configured on the server.`,
          },
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [messages, chatMutation],
  )

  const clearChat = useCallback(() => {
    setMessages([])
  }, [])

  return { messages, isLoading, sendMessage, clearChat }
}
