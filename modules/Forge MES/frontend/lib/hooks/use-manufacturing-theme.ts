import { useTheme } from "@/components/theme-provider"

export type ProductionStatus = 'active' | 'idle' | 'error' | 'maintenance'
export type QualityStatus = 'good' | 'warning' | 'critical'
export type EquipmentStatus = 'running' | 'stopped' | 'alarm'

interface ManufacturingColors {
  production: Record<ProductionStatus, string>
  quality: Record<QualityStatus, string>
  equipment: Record<EquipmentStatus, string>
}

export function useManufacturingTheme() {
  const { theme, setTheme } = useTheme()

  const colors: ManufacturingColors = {
    production: {
      active: 'hsl(var(--production-active))',
      idle: 'hsl(var(--production-idle))',
      error: 'hsl(var(--production-error))',
      maintenance: 'hsl(var(--production-maintenance))',
    },
    quality: {
      good: 'hsl(var(--quality-good))',
      warning: 'hsl(var(--quality-warning))',
      critical: 'hsl(var(--quality-critical))',
    },
    equipment: {
      running: 'hsl(var(--equipment-running))',
      stopped: 'hsl(var(--equipment-stopped))',
      alarm: 'hsl(var(--equipment-alarm))',
    },
  }

  const getProductionStatusColor = (status: ProductionStatus): string => {
    return colors.production[status]
  }

  const getQualityStatusColor = (status: QualityStatus): string => {
    return colors.quality[status]
  }

  const getEquipmentStatusColor = (status: EquipmentStatus): string => {
    return colors.equipment[status]
  }

  const getStatusClass = (
    type: 'production' | 'quality' | 'equipment',
    status: string,
    variant: 'text' | 'bg' = 'text'
  ): string => {
    return `${variant}-${type}-${status}`
  }

  const isHighContrast = (): boolean => {
    return theme === 'high-contrast'
  }

  const isDarkMode = (): boolean => {
    return theme === 'dark' || theme === 'high-contrast'
  }

  const setFactoryTheme = (newTheme: 'light' | 'dark' | 'high-contrast' | 'system') => {
    setTheme(newTheme)
  }

  return {
    theme,
    colors,
    getProductionStatusColor,
    getQualityStatusColor,
    getEquipmentStatusColor,
    getStatusClass,
    isHighContrast,
    isDarkMode,
    setFactoryTheme,
  }
} 