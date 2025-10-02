import { Client } from 'minio'
import { logger } from '../utils/logger'

interface MinIOConfig {
  endPoint: string
  port: number
  useSSL: boolean
  accessKey: string
  secretKey: string
  region?: string
}

export class MinIOInitializer {
  private client: Client
  private config: MinIOConfig

  constructor(config: MinIOConfig) {
    this.config = config
    this.client = new Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      region: config.region || 'us-east-1'
    })
  }

  async initialize(): Promise<boolean> {
    try {
      logger.info('Starting MinIO initialization...')
      
      // Check connection
      const isConnected = await this.checkConnection()
      if (!isConnected) {
        throw new Error('Failed to connect to MinIO')
      }

      // Create buckets
      await this.createBuckets()
      
      // Set bucket policies
      await this.setBucketPolicies()
      
      logger.info('MinIO initialization completed successfully')
      return true
    } catch (error) {
      logger.error('MinIO initialization failed:', error)
      return false
    }
  }

  private async checkConnection(): Promise<boolean> {
    try {
      await this.client.listBuckets()
      logger.info('MinIO connection successful')
      return true
    } catch (error) {
      logger.error('MinIO connection failed:', error)
      return false
    }
  }

  private async createBuckets(): Promise<void> {
    const buckets = [
      {
        name: 'voice-chat-audio',
        policy: 'private'
      },
      {
        name: 'voice-chat-reports',
        policy: 'private'
      },
      {
        name: 'voice-chat-temp',
        policy: 'private'
      },
      {
        name: 'voice-chat-backups',
        policy: 'private'
      }
    ]

    for (const bucket of buckets) {
      try {
        const exists = await this.client.bucketExists(bucket.name)
        if (!exists) {
          await this.client.makeBucket(bucket.name, this.config.region)
          logger.info(`Created bucket: ${bucket.name}`)
        } else {
          logger.info(`Bucket already exists: ${bucket.name}`)
        }
      } catch (error) {
        logger.warn(`Failed to create bucket ${bucket.name}:`, error)
      }
    }
  }

  private async setBucketPolicies(): Promise<void> {
    const policies = {
      'voice-chat-audio': {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::voice-chat-audio/*`],
            Condition: {
              StringEquals: {
                's3:ExistingObjectTag/access': 'public'
              }
            }
          }
        ]
      },
      'voice-chat-reports': {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::voice-chat-reports/*`],
            Condition: {
              StringEquals: {
                's3:ExistingObjectTag/access': 'public'
              }
            }
          }
        ]
      }
    }

    for (const [bucketName, policy] of Object.entries(policies)) {
      try {
        await this.client.setBucketPolicy(bucketName, JSON.stringify(policy))
        logger.info(`Set policy for bucket: ${bucketName}`)
      } catch (error) {
        logger.warn(`Failed to set policy for bucket ${bucketName}:`, error)
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.listBuckets()
      return true
    } catch (error) {
      logger.error('MinIO health check failed:', error)
      return false
    }
  }

  async createSignedUrl(bucketName: string, objectName: string, expiry: number = 3600): Promise<string> {
    try {
      return await this.client.presignedGetObject(bucketName, objectName, expiry)
    } catch (error) {
      logger.error('Failed to create signed URL:', error)
      throw error
    }
  }

  async uploadFile(bucketName: string, objectName: string, filePath: string): Promise<void> {
    try {
      await this.client.fPutObject(bucketName, objectName, filePath)
      logger.info(`Uploaded file: ${objectName} to bucket: ${bucketName}`)
    } catch (error) {
      logger.error('Failed to upload file:', error)
      throw error
    }
  }

  async downloadFile(bucketName: string, objectName: string, filePath: string): Promise<void> {
    try {
      await this.client.fGetObject(bucketName, objectName, filePath)
      logger.info(`Downloaded file: ${objectName} from bucket: ${bucketName}`)
    } catch (error) {
      logger.error('Failed to download file:', error)
      throw error
    }
  }

  async deleteFile(bucketName: string, objectName: string): Promise<void> {
    try {
      await this.client.removeObject(bucketName, objectName)
      logger.info(`Deleted file: ${objectName} from bucket: ${bucketName}`)
    } catch (error) {
      logger.error('Failed to delete file:', error)
      throw error
    }
  }

  async listFiles(bucketName: string, prefix?: string): Promise<any[]> {
    try {
      const objects: any[] = []
      const stream = this.client.listObjects(bucketName, prefix, true)
      
      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => objects.push(obj))
        stream.on('error', reject)
        stream.on('end', () => resolve(objects))
      })
    } catch (error) {
      logger.error('Failed to list files:', error)
      throw error
    }
  }
}
