import { gql } from '@apollo/client'

export const FORMULA_ASSISTANT_CHAT = gql`
  mutation FormulaAssistantChat($input: FormulaAssistantChatInput!) {
    formulaAssistantChat(input: $input) {
      role
      content
    }
  }
`

export interface FormulaAssistantMessageInput {
  role: string
  content: string
}

export interface FormulaAssistantChatInput {
  messages: FormulaAssistantMessageInput[]
}

export interface FormulaAssistantResponse {
  role: string
  content: string
}
