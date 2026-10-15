'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

interface PageTransitionProps {
  children: React.ReactNode
  className?: string
}

// Animation variants for different transition types
const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 }
}

const slideVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 }
}

const scaleVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.05 }
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(false)
  const previousPathnameRef = useRef(pathname)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Handle route change loading state with proper cleanup
  useEffect(() => {
    // Only trigger loading state if pathname actually changed
    if (previousPathnameRef.current !== pathname) {
      setIsLoading(true)
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      timeoutRef.current = setTimeout(() => {
        setIsLoading(false)
      }, 150) // Short delay to show transition

      previousPathnameRef.current = pathname
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [pathname])

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={slideVariants}
        transition={{
          duration: 0.2,
          ease: 'easeInOut'
        }}
        className={`${className} ${isLoading ? 'pointer-events-none' : ''}`}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

// Specialized transition components for different use cases
export function FadeTransition({ children, className = '' }: PageTransitionProps) {
  const pathname = usePathname()
  const previousPathnameRef = useRef(pathname)

  // Only re-render if pathname actually changed
  const stablePathname = previousPathnameRef.current !== pathname ? pathname : previousPathnameRef.current
  previousPathnameRef.current = pathname

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stablePathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={fadeVariants}
        transition={{
          duration: 0.15,
          ease: 'easeInOut'
        }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export function ScaleTransition({ children, className = '' }: PageTransitionProps) {
  const pathname = usePathname()
  const previousPathnameRef = useRef(pathname)

  // Only re-render if pathname actually changed
  const stablePathname = previousPathnameRef.current !== pathname ? pathname : previousPathnameRef.current
  previousPathnameRef.current = pathname

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stablePathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={scaleVariants}
        transition={{
          duration: 0.2,
          ease: 'easeOut'
        }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

// Loading indicator for route transitions
export function RouteLoadingIndicator() {
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(false)
  const previousPathnameRef = useRef(pathname)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Only trigger loading if pathname actually changed
    if (previousPathnameRef.current !== pathname) {
      setIsLoading(true)
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      timeoutRef.current = setTimeout(() => {
        setIsLoading(false)
      }, 300)

      previousPathnameRef.current = pathname
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [pathname])

  if (!isLoading) return null

  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, scaleX: 0 }}
      className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 z-50 origin-left"
      transition={{ duration: 0.3, ease: 'easeOut' }}
    />
  )
}

// Staggered animation for lists and grids
export function StaggeredTransition({ 
  children, 
  className = '',
  staggerDelay = 0.1 
}: PageTransitionProps & { staggerDelay?: number }) {
  const pathname = usePathname()
  const previousPathnameRef = useRef(pathname)

  // Only re-render if pathname actually changed
  const stablePathname = previousPathnameRef.current !== pathname ? pathname : previousPathnameRef.current
  previousPathnameRef.current = pathname

  const containerVariants = {
    initial: {},
    animate: {
      transition: {
        staggerChildren: staggerDelay
      }
    },
    exit: {}
  }

  const itemVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stablePathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={containerVariants}
        className={className}
      >
        {Array.isArray(children) ? (
          children.map((child, index) => (
            <motion.div key={index} variants={itemVariants}>
              {child}
            </motion.div>
          ))
        ) : (
          <motion.div variants={itemVariants}>
            {children}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  )
} 