'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { Send, Trash2, Loader2 } from 'lucide-react'
import { useFormulaAssistant, ChatMessage } from '@/lib/hooks/use-formula-assistant'

interface FormulaAssistantChatProps {
  onUseFormula?: (expression: string) => void
}

const STARTER_PROMPTS = [
  'Calculate corn grain weight from grain load',
  'Water-to-bushel ratio formula',
  'Enzyme dosing based on grain load',
  'Conditional formula for different grain types',
]

function MessageBubble({
  message,
  onUseFormula,
}: {
  message: ChatMessage
  onUseFormula?: (expression: string) => void
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        }`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <MarkdownRenderer
            content={message.content}
            {...(onUseFormula ? { onUseCode: onUseFormula } : {})}
          />
        )}
      </div>
    </div>
  )
}

export function FormulaAssistantChat({ onUseFormula }: FormulaAssistantChatProps) {
  const { messages, isLoading, sendMessage, clearChat } = useFormulaAssistant()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    setInput('')
    sendMessage(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b mb-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Ask me to help craft formulas for BOM calculations
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearChat}>
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 pr-2" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Get help writing formulas for BOM calculations.
              Try one of these prompts:
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {STARTER_PROMPTS.map((prompt) => (
                <Badge
                  key={prompt}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted transition-colors py-1.5 px-3"
                  onClick={() => sendMessage(prompt)}
                >
                  {prompt}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} {...(onUseFormula ? { onUseFormula } : {})} />
            ))}
            {isLoading && (
              <div className="flex justify-start mb-3">
                <div className="bg-muted rounded-lg px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="flex gap-2 pt-3 border-t mt-3">
        <Input
          placeholder="Describe the formula you need..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <Button onClick={handleSend} disabled={!input.trim() || isLoading} size="icon">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
