'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UserDetailView } from './user-detail-view'
import { User, Info } from 'lucide-react'

interface UserDetailModalProps {
  trigger?: React.ReactNode
  triggerText?: string
  triggerVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  triggerSize?: 'default' | 'sm' | 'lg' | 'icon'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function UserDetailModal({
  trigger,
  triggerText = "View Details",
  triggerVariant = "outline",
  triggerSize = "sm",
  open,
  onOpenChange
}: UserDetailModalProps) {
  const defaultTrigger = (
    <Button variant={triggerVariant} size={triggerSize}>
      <Info className="h-3 w-3 mr-1" />
      {triggerText}
    </Button>
  )

  return (
    <Dialog {...(open !== undefined && { open })} {...(onOpenChange && { onOpenChange })}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Details & Permissions
          </DialogTitle>
          <DialogDescription>
            Comprehensive view of user access rights and system capabilities
          </DialogDescription>
        </DialogHeader>
        <UserDetailView showHeader={false} className="mt-4" />
      </DialogContent>
    </Dialog>
  )
}

export default UserDetailModal 