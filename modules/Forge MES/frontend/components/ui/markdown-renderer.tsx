'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Copy, Check, ArrowRight } from 'lucide-react'

interface MarkdownRendererProps {
  content: string
  className?: string
  onUseCode?: (code: string) => void
}

function CodeBlock({
  code,
  onUseCode,
}: {
  code: string
  onUseCode?: (code: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative my-2 group">
      <pre className="bg-muted rounded-lg p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        {onUseCode && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onUseCode(code)}
            title="Use this code"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

export function MarkdownRenderer({ content, className, onUseCode }: MarkdownRendererProps) {
  return (
    <div className={className}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ children, className: codeClassName, ...props }) {
          const isBlock = codeClassName?.startsWith('language-') ||
            (typeof children === 'string' && children.includes('\n'))

          if (isBlock) {
            const code = String(children).replace(/\n$/, '')
            return <CodeBlock code={code} {...(onUseCode ? { onUseCode } : {})} />
          }

          return (
            <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
              {children}
            </code>
          )
        },
        pre({ children }) {
          // The pre wrapper is handled by the code component
          return <>{children}</>
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>
        },
        ul({ children }) {
          return <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
        },
        ol({ children }) {
          return <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
        },
        li({ children }) {
          return <li className="text-sm">{children}</li>
        },
        h1({ children }) {
          return <h1 className="text-lg font-bold mb-2">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="text-base font-semibold mb-1.5">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="text-sm font-semibold mb-1">{children}</h3>
        },
        strong({ children }) {
          return <strong className="font-semibold">{children}</strong>
        },
        em({ children }) {
          return <em className="italic">{children}</em>
        },
        a({ children, href }) {
          return (
            <a href={href} className="text-primary underline hover:no-underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          )
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-2 text-muted-foreground italic">
              {children}
            </blockquote>
          )
        },
        table({ children }) {
          return (
            <div className="my-2 overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">{children}</table>
            </div>
          )
        },
        thead({ children }) {
          return <thead className="bg-muted">{children}</thead>
        },
        tbody({ children }) {
          return <tbody className="divide-y">{children}</tbody>
        },
        tr({ children }) {
          return <tr className="border-b last:border-0">{children}</tr>
        },
        th({ children }) {
          return <th className="px-3 py-1.5 text-left font-medium">{children}</th>
        },
        td({ children }) {
          return <td className="px-3 py-1.5">{children}</td>
        },
        hr() {
          return <hr className="my-3 border-muted" />
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  )
}
