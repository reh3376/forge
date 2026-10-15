'use client'

import { useState, useEffect, ReactNode } from 'react'

interface HydrationBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * HydrationBoundary prevents hydration mismatches by ensuring
 * components only render after client-side hydration is complete.
 */
export function HydrationBoundary({ children, fallback = null }: HydrationBoundaryProps) {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  if (!isHydrated) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * NoSSR component that only renders on the client side
 */
export function NoSSR({ children, fallback = null }: HydrationBoundaryProps) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return <>{fallback}</>
  }

  return <>{children}</>
} 