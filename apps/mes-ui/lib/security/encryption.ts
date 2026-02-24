import crypto from 'crypto'

// Encryption configuration for production data
const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-cbc',
  keyLength: 32, // 256 bits
  ivLength: 16,  // 128 bits
  saltLength: 32 // 256 bits for key derivation
} as const

// Production data classification levels
export enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential', // Standard production data
  PROPRIETARY = 'proprietary',   // Proprietary recipes, formulations
  REGULATED = 'regulated'        // Regulatory compliance data
}

// Manufacturing data types requiring encryption
export enum ManufacturingDataType {
  RECIPE_FORMULATION = 'recipe_formulation',
  BATCH_PARAMETERS = 'batch_parameters',
  QUALITY_METRICS = 'quality_metrics',
  PRODUCTION_YIELDS = 'production_yields',
  COST_DATA = 'cost_data',
  CUSTOMER_SPECIFICATIONS = 'customer_specifications',
  COMPLIANCE_DATA = 'compliance_data'
}

interface EncryptionMetadata {
  algorithm: string
  keyVersion: string
  classification: DataClassification
  dataType: ManufacturingDataType
  encryptedAt: string
  expiresAt?: string
}

interface EncryptedData {
  encryptedContent: string
  iv: string
  hmac: string
  metadata: EncryptionMetadata
}

interface EncryptionKey {
  keyId: string
  version: string
  key: string
  hmacKey: string
  createdAt: string
  rotatedAt?: string
  isActive: boolean
  classification: DataClassification[]
}

// Type definitions for production data
export interface RecipeData {
  name: string
  ingredients: Array<{ name: string; quantity: number; unit: string }>
  parameters: Record<string, string | number | boolean>
  mashingProtocol: Array<{
    step: string
    type: string
    temperature?: number
    time?: number
    [key: string]: string | number | boolean | undefined
  }>
  customer?: string
}

export interface BatchData {
  batchId: string
  recipeId: string
  parameters: Record<string, string | number | boolean>
  qualityMetrics?: Record<string, string | number | boolean>
  yields?: Record<string, number>
}

export interface QualityData {
  batchId: string
  testResults: Record<string, string | number | boolean>
  specifications: Record<string, string | number | boolean>
  complianceData?: Record<string, string | number | boolean>
}

type ProductionDataTypes = RecipeData | BatchData | QualityData | Record<string, unknown>

class ProductionDataEncryption {
  private keys: Map<string, EncryptionKey> = new Map()
  private masterKey: string

  constructor(masterKey?: string) {
    this.masterKey = masterKey || process.env['PRODUCTION_MASTER_KEY'] || this.generateMasterKey()
    this.initializeDefaultKeys()
  }

  /**
   * Generate a secure master key for production environments
   */
  private generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Initialize default encryption keys for different data classifications
   */
  private initializeDefaultKeys(): void {
    const classifications = Object.values(DataClassification)
    
    classifications.forEach(classification => {
      const keyId = `${classification}_key_v1`
      const key = this.deriveKey(this.masterKey, keyId)
      const hmacKey = this.deriveKey(this.masterKey, `${keyId}_hmac`)
      
      this.keys.set(keyId, {
        keyId,
        version: 'v1',
        key,
        hmacKey,
        createdAt: new Date().toISOString(),
        isActive: true,
        classification: [classification]
      })
    })
  }

  /**
   * Derive encryption key using PBKDF2
   */
  private deriveKey(masterKey: string, salt: string): string {
    return crypto.pbkdf2Sync(
      masterKey,
      salt,
      100000, // iterations
      ENCRYPTION_CONFIG.keyLength,
      'sha256'
    ).toString('hex')
  }

  /**
   * Get active encryption key for data classification
   */
  private getEncryptionKey(classification: DataClassification): EncryptionKey | null {
    for (const [, key] of this.keys) {
      if (key.isActive && key.classification.includes(classification)) {
        return key
      }
    }
    return null
  }

  /**
   * Encrypt sensitive production data
   */
  encryptProductionData(
    data: ProductionDataTypes,
    classification: DataClassification,
    dataType: ManufacturingDataType,
    expirationDays?: number
  ): EncryptedData {
    try {
      const encryptionKey = this.getEncryptionKey(classification)
      if (!encryptionKey) {
        throw new Error(`No active encryption key found for classification: ${classification}`)
      }

      // Convert data to JSON string
      const plaintext = JSON.stringify(data)
      
      // Generate random IV
      const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength)
      
      // Create cipher
      const cipher = crypto.createCipher(ENCRYPTION_CONFIG.algorithm, Buffer.from(encryptionKey.key, 'hex'))

      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      
      // Create HMAC for authentication
      const hmac = crypto.createHmac('sha256', Buffer.from(encryptionKey.hmacKey, 'hex'))
      hmac.update(encrypted)
      hmac.update(iv)
      hmac.update(JSON.stringify({ classification, dataType }))
      const hmacDigest = hmac.digest('hex')

      // Calculate expiration if specified
      const expiresAt = expirationDays 
        ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined

      const metadata: EncryptionMetadata = {
        algorithm: ENCRYPTION_CONFIG.algorithm,
        keyVersion: encryptionKey.version,
        classification,
        dataType,
        encryptedAt: new Date().toISOString(),
        ...(expiresAt && { expiresAt })
      }

      return {
        encryptedContent: encrypted,
        iv: iv.toString('hex'),
        hmac: hmacDigest,
        metadata
      }
    } catch (error) {
      throw new Error(`Production data encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Decrypt sensitive production data
   */
  decryptProductionData(encryptedData: EncryptedData): ProductionDataTypes {
    try {
      const { encryptedContent, iv, hmac, metadata } = encryptedData

      // Check if data has expired
      if (metadata.expiresAt && new Date() > new Date(metadata.expiresAt)) {
        throw new Error('Encrypted data has expired')
      }

      // Get decryption key
      const keyId = `${metadata.classification}_key_${metadata.keyVersion}`
      const encryptionKey = this.keys.get(keyId)
      
      if (!encryptionKey) {
        throw new Error(`Decryption key not found: ${keyId}`)
      }

      // Verify HMAC
      const expectedHmac = crypto.createHmac('sha256', Buffer.from(encryptionKey.hmacKey, 'hex'))
      expectedHmac.update(encryptedContent)
      expectedHmac.update(Buffer.from(iv, 'hex'))
      expectedHmac.update(JSON.stringify({
        classification: metadata.classification,
        dataType: metadata.dataType
      }))
      const expectedHmacDigest = expectedHmac.digest('hex')

      if (hmac !== expectedHmacDigest) {
        throw new Error('Data integrity check failed')
      }

      // Create decipher
      const decipher = crypto.createDecipher(
        metadata.algorithm,
        Buffer.from(encryptionKey.key, 'hex')
      )

      // Decrypt data
      let decrypted = decipher.update(encryptedContent, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return JSON.parse(decrypted) as ProductionDataTypes
    } catch (error) {
      throw new Error(`Production data decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Encrypt recipe formulation data
   */
  encryptRecipeData(recipeData: RecipeData): EncryptedData {
    return this.encryptProductionData(
      recipeData,
      DataClassification.PROPRIETARY,
      ManufacturingDataType.RECIPE_FORMULATION
    )
  }

  /**
   * Encrypt batch parameters and production data
   */
  encryptBatchData(batchData: BatchData): EncryptedData {
    return this.encryptProductionData(
      batchData,
      DataClassification.CONFIDENTIAL,
      ManufacturingDataType.BATCH_PARAMETERS
    )
  }

  /**
   * Encrypt quality control metrics
   */
  encryptQualityData(qualityData: QualityData): EncryptedData {
    return this.encryptProductionData(
      qualityData,
      DataClassification.REGULATED,
      ManufacturingDataType.QUALITY_METRICS
    )
  }

  /**
   * Rotate encryption keys for security
   */
  rotateEncryptionKey(classification: DataClassification): EncryptionKey {
    const currentKey = this.getEncryptionKey(classification)
    if (!currentKey) {
      throw new Error(`No current key found for classification: ${classification}`)
    }

    // Mark current key as inactive
    currentKey.isActive = false
    currentKey.rotatedAt = new Date().toISOString()

    // Generate new key version
    const newVersion = `v${parseInt(currentKey.version.substring(1)) + 1}`
    const newKeyId = `${classification}_key_${newVersion}`
    const newKey = this.deriveKey(this.masterKey, newKeyId)
    const newHmacKey = this.deriveKey(this.masterKey, `${newKeyId}_hmac`)

    const rotatedKey: EncryptionKey = {
      keyId: newKeyId,
      version: newVersion,
      key: newKey,
      hmacKey: newHmacKey,
      createdAt: new Date().toISOString(),
      isActive: true,
      classification: [classification]
    }

    this.keys.set(newKeyId, rotatedKey)
    return rotatedKey
  }

  /**
   * Get encryption key information for audit purposes
   */
  getKeyInfo(classification: DataClassification): Omit<EncryptionKey, 'key' | 'hmacKey'> | null {
    const key = this.getEncryptionKey(classification)
    if (!key) return null

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { key: keyValue, hmacKey, ...keyInfo } = key
    return keyInfo
  }

  /**
   * Validate encrypted data integrity
   */
  validateEncryptedData(encryptedData: EncryptedData): boolean {
    try {
      // Attempt to decrypt to verify integrity
      this.decryptProductionData(encryptedData)
      return true
    } catch {
      return false
    }
  }
}

// Singleton instance for production use
export const productionEncryption = new ProductionDataEncryption()

// Utility functions for common encryption operations
export const encryptionUtils = {
  /**
   * Encrypt recipe data for storage
   */
  encryptRecipe: (recipeData: RecipeData) => 
    productionEncryption.encryptRecipeData(recipeData),

  /**
   * Decrypt recipe data for use
   */
  decryptRecipe: (encryptedData: EncryptedData) => 
    productionEncryption.decryptProductionData(encryptedData) as RecipeData,

  /**
   * Encrypt batch production data
   */
  encryptBatch: (batchData: BatchData) => 
    productionEncryption.encryptBatchData(batchData),

  /**
   * Decrypt batch production data
   */
  decryptBatch: (encryptedData: EncryptedData) => 
    productionEncryption.decryptProductionData(encryptedData) as BatchData,

  /**
   * Encrypt quality control data
   */
  encryptQuality: (qualityData: QualityData) => 
    productionEncryption.encryptQualityData(qualityData),

  /**
   * Decrypt quality control data
   */
  decryptQuality: (encryptedData: EncryptedData) => 
    productionEncryption.decryptProductionData(encryptedData) as QualityData,

  /**
   * Validate data classification and encryption requirements
   */
  getRequiredClassification: (dataType: ManufacturingDataType): DataClassification => {
    const classificationMap: Record<ManufacturingDataType, DataClassification> = {
      [ManufacturingDataType.RECIPE_FORMULATION]: DataClassification.PROPRIETARY,
      [ManufacturingDataType.BATCH_PARAMETERS]: DataClassification.CONFIDENTIAL,
      [ManufacturingDataType.QUALITY_METRICS]: DataClassification.REGULATED,
      [ManufacturingDataType.PRODUCTION_YIELDS]: DataClassification.CONFIDENTIAL,
      [ManufacturingDataType.COST_DATA]: DataClassification.CONFIDENTIAL,
      [ManufacturingDataType.CUSTOMER_SPECIFICATIONS]: DataClassification.CONFIDENTIAL,
      [ManufacturingDataType.COMPLIANCE_DATA]: DataClassification.REGULATED
    }
    return classificationMap[dataType]
  }
}

export type { EncryptedData, EncryptionMetadata } 