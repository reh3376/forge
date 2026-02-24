import CryptoJS from 'crypto-js'

// Production Data Encryption for Whiskey House MES
// Handles encryption of sensitive manufacturing data including recipes, batches, and quality metrics

export interface EncryptionConfig {
  algorithm: 'AES-256-GCM' | 'AES-256-CBC'
  keySize: 256 | 512
  iterations: number
  saltSize: number
}

export interface EncryptedData {
  data: string
  salt: string
  iv: string
  tag?: string // For GCM mode
  algorithm: string
  timestamp: number
}

export interface ProductionDataTypes {
  recipe: {
    code: string
    mashBill: string
    proof: number
    fermentationDetails: string
    distillationParams: string
  }
  batchData: {
    batchId: string
    ingredients: string
    qualityMetrics: string
    temperatureProfile: string
    timingData: string
  }
  qualityControl: {
    testResults: string
    inspectorNotes: string
    certificationData: string
    complianceRecords: string
  }
  businessIntelligence: {
    costAnalysis: string
    profitMargins: string
    customerData: string
    salesMetrics: string
  }
}

// Default encryption configuration for production environments
export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: 'AES-256-GCM',
  keySize: 256,
  iterations: 100000,
  saltSize: 16
}

// Production-grade encryption service
export class ProductionDataEncryption {
  private config: EncryptionConfig
  private masterKey: string | null = null

  constructor(config: EncryptionConfig = DEFAULT_ENCRYPTION_CONFIG) {
    this.config = config
  }

  /**
   * Initialize encryption with master key
   * In production, this should come from secure key management service
   */
  initialize(masterKey: string): void {
    if (!masterKey || masterKey.length < 32) {
      throw new Error('Master key must be at least 32 characters long')
    }
    this.masterKey = masterKey
  }

  /**
   * Generate a secure random salt
   */
  private generateSalt(): string {
    return CryptoJS.lib.WordArray.random(this.config.saltSize).toString()
  }

  /**
   * Generate initialization vector
   */
  private generateIV(): string {
    return CryptoJS.lib.WordArray.random(16).toString()
  }

  /**
   * Derive encryption key from master key and salt
   */
  private deriveKey(salt: string): string {
    if (!this.masterKey) {
      throw new Error('Encryption not initialized. Call initialize() first.')
    }
    
    return CryptoJS.PBKDF2(this.masterKey, salt, {
      keySize: this.config.keySize / 32,
      iterations: this.config.iterations
    }).toString()
  }

  /**
   * Encrypt sensitive production data
   */
  encrypt(data: string, _dataType: keyof ProductionDataTypes): EncryptedData {
    if (!data) {
      throw new Error('Data cannot be empty')
    }

    const salt = this.generateSalt()
    const iv = this.generateIV()
    const key = this.deriveKey(salt)

    let encrypted: CryptoJS.lib.CipherParams
    let tag: string | undefined

    // Use AES-GCM for authenticated encryption (preferred for production data)
    if (this.config.algorithm === 'AES-256-GCM') {
      // Note: crypto-js doesn't have native GCM support, 
      // so we'll use CBC with HMAC for production safety
      encrypted = CryptoJS.AES.encrypt(data, key, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      })
      
      // Generate HMAC tag for authentication
      tag = CryptoJS.HmacSHA256(encrypted.toString(), key).toString()
    } else {
      // AES-256-CBC mode
      encrypted = CryptoJS.AES.encrypt(data, key, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      })
      tag = undefined
    }

    const result: EncryptedData = {
      data: encrypted.toString(),
      salt,
      iv,
      algorithm: this.config.algorithm,
      timestamp: Date.now()
    }

    if (tag !== undefined) {
      result.tag = tag
    }

    return result
  }

  /**
   * Decrypt sensitive production data
   */
  decrypt(encryptedData: EncryptedData): string {
    const key = this.deriveKey(encryptedData.salt)

    // Verify authentication tag if present (GCM mode)
    if (encryptedData.tag && encryptedData.algorithm === 'AES-256-GCM') {
      const computedTag = CryptoJS.HmacSHA256(encryptedData.data, key).toString()
      if (computedTag !== encryptedData.tag) {
        throw new Error('Authentication failed: Data may have been tampered with')
      }
    }

    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedData.data, key, {
        iv: CryptoJS.enc.Hex.parse(encryptedData.iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      })

      const decryptedText = decrypted.toString(CryptoJS.enc.Utf8)
      
      if (!decryptedText) {
        throw new Error('Decryption failed: Invalid key or corrupted data')
      }

      return decryptedText
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Encrypt recipe data with specialized handling
   */
  encryptRecipeData(recipe: ProductionDataTypes['recipe']): EncryptedData {
    const sensitiveData = JSON.stringify({
      ...recipe,
      encrypted_at: new Date().toISOString(),
      data_type: 'recipe'
    })
    return this.encrypt(sensitiveData, 'recipe')
  }

  /**
   * Encrypt batch data with specialized handling
   */
  encryptBatchData(batchData: ProductionDataTypes['batchData']): EncryptedData {
    const sensitiveData = JSON.stringify({
      ...batchData,
      encrypted_at: new Date().toISOString(),
      data_type: 'batch'
    })
    return this.encrypt(sensitiveData, 'batchData')
  }

  /**
   * Encrypt quality control data
   */
  encryptQualityData(qualityData: ProductionDataTypes['qualityControl']): EncryptedData {
    const sensitiveData = JSON.stringify({
      ...qualityData,
      encrypted_at: new Date().toISOString(),
      data_type: 'quality_control'
    })
    return this.encrypt(sensitiveData, 'qualityControl')
  }

  /**
   * Encrypt business intelligence data
   */
  encryptBusinessData(businessData: ProductionDataTypes['businessIntelligence']): EncryptedData {
    const sensitiveData = JSON.stringify({
      ...businessData,
      encrypted_at: new Date().toISOString(),
      data_type: 'business_intelligence'
    })
    return this.encrypt(sensitiveData, 'businessIntelligence')
  }

  /**
   * Decrypt and parse recipe data
   */
  decryptRecipeData(encryptedData: EncryptedData): ProductionDataTypes['recipe'] {
    const decrypted = this.decrypt(encryptedData)
    const parsed = JSON.parse(decrypted)
    
    if (parsed.data_type !== 'recipe') {
      throw new Error('Invalid data type: Expected recipe data')
    }
    
    return parsed
  }

  /**
   * Decrypt and parse batch data
   */
  decryptBatchData(encryptedData: EncryptedData): ProductionDataTypes['batchData'] {
    const decrypted = this.decrypt(encryptedData)
    const parsed = JSON.parse(decrypted)
    
    if (parsed.data_type !== 'batch') {
      throw new Error('Invalid data type: Expected batch data')
    }
    
    return parsed
  }

  /**
   * Verify encryption integrity
   */
  verifyIntegrity(encryptedData: EncryptedData): boolean {
    try {
      this.decrypt(encryptedData)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get encryption metadata
   */
  getMetadata(encryptedData: EncryptedData): {
    algorithm: string
    timestamp: Date
    age: string
  } {
    return {
      algorithm: encryptedData.algorithm,
      timestamp: new Date(encryptedData.timestamp),
      age: `${Math.round((Date.now() - encryptedData.timestamp) / 1000)} seconds ago`
    }
  }
}

// Key Management Service for production environments
export class ProductionKeyManager {
  private keys: Map<string, string> = new Map()
  private keyRotationInterval: number = 24 * 60 * 60 * 1000 // 24 hours

  /**
   * Generate a secure master key
   */
  generateMasterKey(): string {
    return CryptoJS.lib.WordArray.random(32).toString()
  }

  /**
   * Store key with environment-specific identifier
   */
  storeKey(environment: 'development' | 'staging' | 'production', key: string): void {
    this.keys.set(environment, key)
  }

  /**
   * Retrieve key for environment
   */
  getKey(environment: 'development' | 'staging' | 'production'): string | null {
    return this.keys.get(environment) || null
  }

  /**
   * Rotate encryption keys (for production key management)
   */
  rotateKey(environment: 'development' | 'staging' | 'production'): string {
    const newKey = this.generateMasterKey()
    this.storeKey(environment, newKey)
    return newKey
  }

  /**
   * Check if key rotation is needed
   */
  needsRotation(lastRotation: Date): boolean {
    return (Date.now() - lastRotation.getTime()) > this.keyRotationInterval
  }
}

// Export singleton instances for application use
export const productionEncryption = new ProductionDataEncryption()
export const keyManager = new ProductionKeyManager()

// Utility functions for common encryption tasks
export const EncryptionUtils = {
  /**
   * Quick encryption for simple strings
   */
  quickEncrypt: (data: string, masterKey: string): EncryptedData => {
    const encryption = new ProductionDataEncryption()
    encryption.initialize(masterKey)
    return encryption.encrypt(data, 'recipe') // Default to recipe type
  },

  /**
   * Quick decryption for simple strings
   */
  quickDecrypt: (encryptedData: EncryptedData, masterKey: string): string => {
    const encryption = new ProductionDataEncryption()
    encryption.initialize(masterKey)
    return encryption.decrypt(encryptedData)
  },

  /**
   * Generate secure random password for key derivation
   */
  generateSecurePassword: (length: number = 32): string => {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
      .map(x => charset[x % charset.length])
      .join('')
  },

  /**
   * Validate encryption configuration
   */
  validateConfig: (config: EncryptionConfig): boolean => {
    return config.keySize >= 256 && 
           config.iterations >= 10000 && 
           config.saltSize >= 16
  }
} 