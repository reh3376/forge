/**
 * Utility functions for handling temperature setpoints in mashing protocols
 */

export interface TemperatureStep {
  holdType?: 'Heat' | 'Cool' | 'None'
  heatTempSp?: number
  coolTempSp?: number
  temperatureSetpoint?: number // Legacy field for backward compatibility
}

/**
 * Gets the appropriate temperature value based on holdType configuration
 * Returns empty string if no temperature is configured
 * 
 * Note: Due to a bug in the system, some Cool steps have their temperature
 * stored in heatTempSp instead of coolTempSp. This function handles both cases.
 */
export function getTemperatureValue(step: TemperatureStep): string {
  if (step.holdType === 'Heat' && step.heatTempSp) {
    return step.heatTempSp.toString()
  }
  
  if (step.holdType === 'Cool') {
    // First check coolTempSp (correct field)
    if (step.coolTempSp) {
      return step.coolTempSp.toString()
    }
    // Fallback to heatTempSp (bug workaround - some Cool steps have temp stored here)
    if (step.heatTempSp) {
      return step.heatTempSp.toString()
    }
  }
  
  if (step.holdType === 'None') {
    // For 'None' holdType, prefer heatTempSp, then coolTempSp, then legacy temperatureSetpoint
    if (step.heatTempSp) return step.heatTempSp.toString()
    if (step.coolTempSp) return step.coolTempSp.toString()
    if (step.temperatureSetpoint) return step.temperatureSetpoint.toString()
  }
  
  // Fallback to legacy temperatureSetpoint if available
  if (step.temperatureSetpoint) {
    return step.temperatureSetpoint.toString()
  }
  
  return ''
}

/**
 * Gets the numeric temperature value for calculations
 * Returns 0 if no temperature is configured
 */
export function getTemperatureNumericValue(step: TemperatureStep): number {
  const value = getTemperatureValue(step)
  return value ? Number(value) : 0
}

/**
 * Gets the display string for temperature with unit
 * Returns empty string if no temperature is configured
 */
export function getTemperatureDisplay(step: TemperatureStep): string {
  const value = getTemperatureValue(step)
  return value ? `${value}°F` : ''
}

/**
 * Checks if a step has temperature data stored incorrectly
 * (Cool steps with temperature in heatTempSp instead of coolTempSp)
 */
export function hasIncorrectTemperatureStorage(step: TemperatureStep): boolean {
  return step.holdType === 'Cool' && step.heatTempSp !== undefined && step.coolTempSp === undefined
}

/**
 * Gets the correct temperature field name for a given hold type
 */
export function getCorrectTemperatureField(holdType: string): 'heatTempSp' | 'coolTempSp' | null {
  switch (holdType) {
    case 'Heat':
    case 'Hold':
      return 'heatTempSp'
    case 'Cool':
      return 'coolTempSp'
    default:
      return null
  }
}

/**
 * Determines which temperature field should be used based on holdType
 */
export function getTemperatureFieldName(holdType?: 'Heat' | 'Cool' | 'None'): 'heatTempSp' | 'coolTempSp' | null {
  switch (holdType) {
    case 'Heat':
      return 'heatTempSp'
    case 'Cool':
      return 'coolTempSp'
    case 'None':
      return 'heatTempSp' // Default to heat for 'None' type
    default:
      return null
  }
} 