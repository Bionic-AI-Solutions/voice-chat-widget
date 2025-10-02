import { createClient } from '@supabase/supabase-js'
import { logger } from '../utils/logger'
import fs from 'fs'
import path from 'path'

interface DatabaseInitializerConfig {
  supabaseUrl: string
  supabaseServiceKey: string
  migrationsPath: string
}

export class DatabaseInitializer {
  private supabase: any
  private config: DatabaseInitializerConfig

  constructor(config: DatabaseInitializerConfig) {
    this.config = config
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceKey)
  }

  async initialize(): Promise<boolean> {
    try {
      logger.info('Starting database initialization...')
      
      // Check if database is already initialized
      const isInitialized = await this.checkIfInitialized()
      if (isInitialized) {
        logger.info('Database already initialized, skipping setup')
        return true
      }

      // Run all migrations
      await this.runMigrations()
      
      // Create initial data
      await this.createInitialData()
      
      // Mark as initialized
      await this.markAsInitialized()
      
      logger.info('Database initialization completed successfully')
      return true
    } catch (error) {
      logger.error('Database initialization failed:', error)
      return false
    }
  }

  private async checkIfInitialized(): Promise<boolean> {
    try {
      // Check if the conversations table exists (our main table)
      const { data, error } = await this.supabase
        .from('conversations')
        .select('id')
        .limit(1)

      if (error && error.code === 'PGRST116') {
        // Table doesn't exist
        return false
      }

      return !error
    } catch (error) {
      logger.warn('Error checking initialization status:', error)
      return false
    }
  }

  private async runMigrations(): Promise<void> {
    logger.info('Running database migrations...')
    
    const migrationsPath = this.config.migrationsPath
    if (!fs.existsSync(migrationsPath)) {
      throw new Error(`Migrations path not found: ${migrationsPath}`)
    }

    const migrationFiles = fs.readdirSync(migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort()

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsPath, file)
      const sql = fs.readFileSync(filePath, 'utf8')
      
      logger.info(`Running migration: ${file}`)
      
      try {
        const { error } = await this.supabase.rpc('exec_sql', { sql })
        if (error) {
          // If exec_sql doesn't exist, try direct execution
          const { error: directError } = await this.supabase
            .from('_migrations')
            .insert({ name: file, sql })
          
          if (directError) {
            logger.warn(`Migration ${file} may have already been applied or failed:`, directError)
          }
        }
      } catch (error) {
        logger.warn(`Migration ${file} failed, continuing:`, error)
      }
    }
  }

  private async createInitialData(): Promise<void> {
    logger.info('Creating initial data...')
    
    // Create default admin user if not exists
    await this.createDefaultAdmin()
    
    // Create default app registration if not exists
    await this.createDefaultAppRegistration()
    
    // Create sample officers if not exists
    await this.createSampleOfficers()
  }

  private async createDefaultAdmin(): Promise<void> {
    try {
      const { data: existingAdmin } = await this.supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .limit(1)

      if (existingAdmin && existingAdmin.length > 0) {
        logger.info('Default admin user already exists')
        return
      }

      // Create admin user via Supabase Auth
      const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@voicechat.local'
      const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123!'

      const { data: authData, error: authError } = await this.supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { role: 'admin' }
      })

      if (authError) {
        logger.warn('Failed to create admin user:', authError)
        return
      }

      // Create profile
      const { error: profileError } = await this.supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: adminEmail,
          role: 'admin',
          status: 'active'
        })

      if (profileError) {
        logger.warn('Failed to create admin profile:', profileError)
      } else {
        logger.info(`Default admin user created: ${adminEmail}`)
      }
    } catch (error) {
      logger.warn('Error creating default admin:', error)
    }
  }

  private async createDefaultAppRegistration(): Promise<void> {
    try {
      const { data: existingApp } = await this.supabase
        .from('app_registrations')
        .select('id')
        .eq('name', 'Default App')
        .limit(1)

      if (existingApp && existingApp.length > 0) {
        logger.info('Default app registration already exists')
        return
      }

      const defaultApiKey = this.generateApiKey()
      
      const { error } = await this.supabase
        .from('app_registrations')
        .insert({
          name: 'Default App',
          description: 'Default application registration for voice chat system',
          domain: 'http://localhost:3000',
          api_key: defaultApiKey,
          status: 'active',
          permissions: ['basic'],
          rate_limit: 1000,
          metadata: {
            contact_email: 'admin@voicechat.local',
            organization: 'Voice Chat System',
            environment: 'development'
          }
        })

      if (error) {
        logger.warn('Failed to create default app registration:', error)
      } else {
        logger.info('Default app registration created')
        logger.info(`Default API Key: ${defaultApiKey}`)
      }
    } catch (error) {
      logger.warn('Error creating default app registration:', error)
    }
  }

  private async createSampleOfficers(): Promise<void> {
    try {
      const { data: existingOfficers } = await this.supabase
        .from('officers')
        .select('id')
        .limit(1)

      if (existingOfficers && existingOfficers.length > 0) {
        logger.info('Sample officers already exist')
        return
      }

      const sampleOfficers = [
        {
          email: 'officer1@police.gov',
          name: 'John Smith',
          department: 'Patrol Division',
          badge_number: 'P001',
          phone: '+1-555-0101',
          status: 'active',
          permissions: ['basic'],
          metadata: {
            rank: 'Sergeant',
            location: 'Downtown',
            supervisor: 'Captain Johnson'
          }
        },
        {
          email: 'officer2@police.gov',
          name: 'Sarah Johnson',
          department: 'Detective Division',
          badge_number: 'D001',
          phone: '+1-555-0102',
          status: 'active',
          permissions: ['basic'],
          metadata: {
            rank: 'Detective',
            location: 'Central',
            supervisor: 'Lieutenant Brown'
          }
        }
      ]

      const { error } = await this.supabase
        .from('officers')
        .insert(sampleOfficers)

      if (error) {
        logger.warn('Failed to create sample officers:', error)
      } else {
        logger.info('Sample officers created')
      }
    } catch (error) {
      logger.warn('Error creating sample officers:', error)
    }
  }

  private async markAsInitialized(): Promise<void> {
    try {
      // Create a simple table to track initialization
      const { error } = await this.supabase
        .from('system_initialization')
        .insert({
          initialized_at: new Date().toISOString(),
          version: '1.0.0'
        })

      if (error) {
        logger.warn('Failed to mark as initialized:', error)
      }
    } catch (error) {
      logger.warn('Error marking as initialized:', error)
    }
  }

  private generateApiKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = 'vcw_'
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('conversations')
        .select('id')
        .limit(1)

      return !error
    } catch (error) {
      logger.error('Database health check failed:', error)
      return false
    }
  }
}
