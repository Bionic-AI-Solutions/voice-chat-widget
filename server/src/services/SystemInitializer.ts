import { DatabaseInitializer } from './DatabaseInitializer'
import { MinIOInitializer } from './MinIOInitializer'
import { EdgeFunctionDeployer } from './EdgeFunctionDeployer'
import { logger } from '../utils/logger'

interface SystemConfig {
  supabase: {
    url: string
    serviceKey: string
    projectId: string
  }
  minio: {
    endPoint: string
    port: number
    useSSL: boolean
    accessKey: string
    secretKey: string
    region?: string
  }
  paths: {
    migrations: string
    functions: string
  }
}

export class SystemInitializer {
  private config: SystemConfig
  private databaseInitializer: DatabaseInitializer
  private minioInitializer: MinIOInitializer
  private edgeFunctionDeployer: EdgeFunctionDeployer

  constructor(config: SystemConfig) {
    this.config = config
    this.databaseInitializer = new DatabaseInitializer({
      supabaseUrl: config.supabase.url,
      supabaseServiceKey: config.supabase.serviceKey,
      migrationsPath: config.paths.migrations
    })
    this.minioInitializer = new MinIOInitializer(config.minio)
    this.edgeFunctionDeployer = new EdgeFunctionDeployer({
      supabaseUrl: config.supabase.url,
      supabaseServiceKey: config.supabase.serviceKey,
      functionsPath: config.paths.functions,
      projectId: config.supabase.projectId
    })
  }

  async initialize(): Promise<boolean> {
    try {
      logger.info('🚀 Starting system initialization...')
      
      const results = await Promise.allSettled([
        this.initializeDatabase(),
        this.initializeMinIO(),
        this.deployEdgeFunctions()
      ])

      const success = results.every(result => 
        result.status === 'fulfilled' && result.value === true
      )

      if (success) {
        logger.info('✅ System initialization completed successfully!')
        await this.performHealthCheck()
      } else {
        logger.error('❌ System initialization completed with errors')
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            logger.error(`Component ${index} failed:`, result.reason)
          } else if (result.value === false) {
            logger.error(`Component ${index} returned false`)
          }
        })
      }

      return success
    } catch (error) {
      logger.error('❌ System initialization failed:', error)
      return false
    }
  }

  private async initializeDatabase(): Promise<boolean> {
    try {
      logger.info('📊 Initializing database...')
      const result = await this.databaseInitializer.initialize()
      if (result) {
        logger.info('✅ Database initialization completed')
      } else {
        logger.error('❌ Database initialization failed')
      }
      return result
    } catch (error) {
      logger.error('❌ Database initialization error:', error)
      return false
    }
  }

  private async initializeMinIO(): Promise<boolean> {
    try {
      logger.info('🗄️ Initializing MinIO...')
      const result = await this.minioInitializer.initialize()
      if (result) {
        logger.info('✅ MinIO initialization completed')
      } else {
        logger.error('❌ MinIO initialization failed')
      }
      return result
    } catch (error) {
      logger.error('❌ MinIO initialization error:', error)
      return false
    }
  }

  private async deployEdgeFunctions(): Promise<boolean> {
    try {
      logger.info('⚡ Deploying edge functions...')
      const result = await this.edgeFunctionDeployer.deployAllFunctions()
      if (result) {
        logger.info('✅ Edge function deployment completed')
      } else {
        logger.error('❌ Edge function deployment failed')
      }
      return result
    } catch (error) {
      logger.error('❌ Edge function deployment error:', error)
      return false
    }
  }

  async performHealthCheck(): Promise<boolean> {
    try {
      logger.info('🏥 Performing system health check...')
      
      const results = await Promise.allSettled([
        this.databaseInitializer.healthCheck(),
        this.minioInitializer.healthCheck(),
        this.edgeFunctionDeployer.healthCheck()
      ])

      const healthStatus = {
        database: results[0].status === 'fulfilled' && results[0].value === true,
        minio: results[1].status === 'fulfilled' && results[1].value === true,
        edgeFunctions: results[2].status === 'fulfilled' && results[2].value === true
      }

      const allHealthy = Object.values(healthStatus).every(status => status === true)

      logger.info('📋 Health Check Results:')
      logger.info(`  Database: ${healthStatus.database ? '✅ Healthy' : '❌ Unhealthy'}`)
      logger.info(`  MinIO: ${healthStatus.minio ? '✅ Healthy' : '❌ Unhealthy'}`)
      logger.info(`  Edge Functions: ${healthStatus.edgeFunctions ? '✅ Healthy' : '❌ Unhealthy'}`)
      logger.info(`  Overall: ${allHealthy ? '✅ All Systems Healthy' : '❌ Some Systems Unhealthy'}`)

      return allHealthy
    } catch (error) {
      logger.error('❌ Health check failed:', error)
      return false
    }
  }

  async getSystemStatus(): Promise<{
    database: boolean
    minio: boolean
    edgeFunctions: boolean
    overall: boolean
  }> {
    try {
      const [database, minio, edgeFunctions] = await Promise.all([
        this.databaseInitializer.healthCheck(),
        this.minioInitializer.healthCheck(),
        this.edgeFunctionDeployer.healthCheck()
      ])

      const overall = database && minio && edgeFunctions

      return {
        database,
        minio,
        edgeFunctions,
        overall
      }
    } catch (error) {
      logger.error('Failed to get system status:', error)
      return {
        database: false,
        minio: false,
        edgeFunctions: false,
        overall: false
      }
    }
  }

  async resetSystem(): Promise<boolean> {
    try {
      logger.warn('⚠️ Resetting system - this will clear all data!')
      
      // This is a destructive operation - implement with caution
      // For now, just reinitialize
      return await this.initialize()
    } catch (error) {
      logger.error('❌ System reset failed:', error)
      return false
    }
  }
}
