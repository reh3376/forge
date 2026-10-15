import React from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'symbol' | 'logotype' | 'horizontal' | 'full'
  theme?: 'dark' | 'light' | 'auto'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  priority?: boolean
  useSvg?: boolean
}

const sizeMap = {
  xs: { width: 16, height: 16 },
  sm: { width: 24, height: 24 },
  md: { width: 32, height: 32 },
  lg: { width: 48, height: 48 },
  xl: { width: 64, height: 64 }
}

const horizontalSizeMap = {
  xs: { width: 60, height: 16 },
  sm: { width: 80, height: 24 },
  md: { width: 120, height: 32 },
  lg: { width: 160, height: 48 },
  xl: { width: 200, height: 64 }
}

// Simple SVG logo for better performance
function LogoSvg({ 
  variant, 
  theme, 
  size, 
  className 
}: { 
  variant: 'symbol' | 'logotype' | 'horizontal' | 'full'
  theme: 'dark' | 'light' | 'auto'
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string 
}) {
  const dimensions = variant === 'horizontal' || variant === 'full' 
    ? horizontalSizeMap[size as keyof typeof horizontalSizeMap]
    : sizeMap[size as keyof typeof sizeMap]
  
  const isDark = theme === 'dark'
  const fillColor = isDark ? '#ffffff' : '#374151'
  
  if (variant === 'symbol') {
    return (
      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox="0 0 24 24"
        fill="none"
        className={cn("flex-shrink-0", className)}
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" r="10" fill={fillColor} opacity="0.1" />
        <path
          d="M8 8h8v8H8V8zm2 2v4h4V10h-4z"
          fill={fillColor}
        />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize="6"
          fill={fillColor}
          fontWeight="bold"
        >
          WHK
        </text>
      </svg>
    )
  }
  
  return (
    <svg
      width={dimensions.width}
      height={dimensions.height}
      viewBox="0 0 80 24"
      fill="none"
      className={cn("flex-shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="6" width="12" height="12" fill={fillColor} opacity="0.1" rx="2" />
      <path
        d="M4 8h8v8H4V8zm2 2v4h4v-4H6z"
        fill={fillColor}
      />
      <text
        x="20"
        y="16"
        fontSize="10"
        fill={fillColor}
        fontWeight="bold"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Whiskey House
      </text>
    </svg>
  )
}

export function Logo({ 
  variant = 'horizontal', 
  theme = 'auto', 
  size = 'md',
  className,
  priority = false,
  useSvg = false
}: LogoProps) {
  // Use SVG for better performance if requested
  if (useSvg) {
    return (
      <LogoSvg 
        variant={variant}
        theme={theme}
        size={size}
        {...(className && { className })}
      />
    )
  }

  // Determine the logo file based on variant and theme
  const getLogoSrc = () => {
    const themePrefix = theme === 'auto' 
      ? 'DkGrey' // Default to dark grey for auto theme
      : theme === 'dark' 
        ? 'RevWhite' 
        : 'DkGrey'
    
    switch (variant) {
      case 'symbol':
        return `/WHK_Logo_Symbol_${themePrefix}.png`
      case 'logotype':
        return `/WHK_Logo_Logotype_${themePrefix}.png`
      case 'horizontal':
        return `/WHK_Logo_Horizontal_${themePrefix}.png`
      case 'full':
        return `/WHK_Logo_Full_${themePrefix}.png`
      default:
        return `/WHK_Logo_Horizontal_${themePrefix}.png`
    }
  }

  // Get dimensions based on variant and size
  const getDimensions = () => {
    if (variant === 'horizontal' || variant === 'full') {
      return horizontalSizeMap[size]
    }
    return sizeMap[size]
  }

  const dimensions = getDimensions()
  const logoSrc = getLogoSrc()

  return (
    <Image
      src={logoSrc}
      alt="Whiskey House Logo"
      width={dimensions.width}
      height={dimensions.height}
      className={cn(
        "object-contain transition-opacity duration-200",
        // Theme-based visibility for auto theme
        theme === 'auto' && [
          "dark:hidden", // Hide dark grey version in dark mode
        ],
        className
      )}
      priority={priority}
      quality={90}
      placeholder="blur"
      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
    />
  )
}

// Auto theme version that shows different logos for light/dark mode
export function LogoAuto({ 
  variant = 'horizontal', 
  size = 'md',
  className,
  priority = false,
  useSvg = false
}: Omit<LogoProps, 'theme'>) {
  // Use SVG for better performance if requested
  if (useSvg) {
    return (
      <div className={cn("relative", className)}>
        <div className="dark:hidden">
          <LogoSvg 
            variant={variant}
            theme="light"
            size={size}
          />
        </div>
        <div className="hidden dark:block">
          <LogoSvg 
            variant={variant}
            theme="dark"
            size={size}
          />
        </div>
      </div>
    )
  }

  const getDimensions = () => {
    if (variant === 'horizontal' || variant === 'full') {
      return horizontalSizeMap[size]
    }
    return sizeMap[size]
  }

  const dimensions = getDimensions()

  return (
    <div className={cn("relative", className)} style={{ width: dimensions.width, height: dimensions.height }}>
      {/* Light mode logo (dark grey) */}
      <Image
        src={`/WHK_Logo_${variant === 'symbol' ? 'Symbol' : variant === 'logotype' ? 'Logotype' : variant === 'horizontal' ? 'Horizontal' : 'Full'}_DkGrey.png`}
        alt="Whiskey House Logo"
        width={dimensions.width}
        height={dimensions.height}
        className="object-contain dark:hidden transition-opacity duration-200"
        priority={priority}
        quality={90}
        placeholder="blur"
        blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
      />
      
      {/* Dark mode logo (white) */}
      <Image
        src={`/WHK_Logo_${variant === 'symbol' ? 'Symbol' : variant === 'logotype' ? 'Logotype' : variant === 'horizontal' ? 'Horizontal' : 'Full'}_RevWhite.png`}
        alt="Whiskey House Logo"
        width={dimensions.width}
        height={dimensions.height}
        className="object-contain hidden dark:block transition-opacity duration-200"
        priority={priority}
        quality={90}
        placeholder="blur"
        blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
      />
    </div>
  )
} 