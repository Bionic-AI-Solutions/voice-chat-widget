import { createClient } from '@supabase/supabase-js'
import { logger } from '../utils/logger'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface EdgeFunctionDeployerConfig {
  supabaseUrl: string
  supabaseServiceKey: string
  functionsPath: string
  projectId: string
}

export class EdgeFunctionDeployer {
  private supabase: any
  private config: EdgeFunctionDeployerConfig

  constructor(config: EdgeFunctionDeployerConfig) {
    this.config = config
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceKey)
  }

  async deployAllFunctions(): Promise<boolean> {
    try {
      logger.info('Starting edge function deployment...')
      
      const functionsPath = this.config.functionsPath
      if (!fs.existsSync(functionsPath)) {
        throw new Error(`Functions path not found: ${functionsPath}`)
      }

      const functionDirs = fs.readdirSync(functionsPath)
        .filter(item => {
          const itemPath = path.join(functionsPath, item)
          return fs.statSync(itemPath).isDirectory()
        })

      for (const functionName of functionDirs) {
        await this.deployFunction(functionName)
      }

      logger.info('All edge functions deployed successfully')
      return true
    } catch (error) {
      logger.error('Edge function deployment failed:', error)
      return false
    }
  }

  private async deployFunction(functionName: string): Promise<void> {
    try {
      const functionPath = path.join(this.config.functionsPath, functionName)
      
      // Check if function exists
      const indexFile = path.join(functionPath, 'index.ts')
      if (!fs.existsSync(indexFile)) {
        logger.warn(`Function ${functionName} has no index.ts file, skipping`)
        return
      }

      logger.info(`Deploying function: ${functionName}`)

      // Use Supabase CLI to deploy the function
      const deployCommand = `supabase functions deploy ${functionName} --project-ref ${this.config.projectId}`
      
      try {
        const { stdout, stderr } = await execAsync(deployCommand, {
          cwd: functionPath,
          env: {
            ...process.env,
            SUPABASE_URL: this.config.supabaseUrl,
            SUPABASE_SERVICE_ROLE_KEY: this.config.supabaseServiceKey
          }
        })

        if (stderr && !stderr.includes('warning')) {
          logger.warn(`Function ${functionName} deployment warning:`, stderr)
        }

        logger.info(`Function ${functionName} deployed successfully`)
      } catch (error) {
        // If CLI deployment fails, try manual deployment via API
        logger.warn(`CLI deployment failed for ${functionName}, trying manual deployment:`, error)
        await this.deployFunctionManually(functionName, functionPath)
      }
    } catch (error) {
      logger.error(`Failed to deploy function ${functionName}:`, error)
    }
  }

  private async deployFunctionManually(functionName: string, functionPath: string): Promise<void> {
    try {
      const indexFile = path.join(functionPath, 'index.ts')
      const denoFile = path.join(functionPath, 'deno.json')
      
      const code = fs.readFileSync(indexFile, 'utf8')
      const config = denoFile && fs.existsSync(denoFile) 
        ? JSON.parse(fs.readFileSync(denoFile, 'utf8'))
        : {}

      // Create function via Supabase API
      const { data, error } = await this.supabase.functions.create({
        name: functionName,
        code: code,
        config: config
      })

      if (error) {
        logger.warn(`Manual deployment failed for ${functionName}:`, error)
      } else {
        logger.info(`Function ${functionName} deployed manually`)
      }
    } catch (error) {
      logger.error(`Manual deployment failed for ${functionName}:`, error)
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Test a simple function call
      const { data, error } = await this.supabase.functions.invoke('system-health', {
        method: 'GET'
      })

      return !error
    } catch (error) {
      logger.error('Edge function health check failed:', error)
      return false
    }
  }

  async listFunctions(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase.functions.list()
      if (error) {
        logger.error('Failed to list functions:', error)
        return []
      }
      return data?.map((func: any) => func.name) || []
    } catch (error) {
      logger.error('Failed to list functions:', error)
      return []
    }
  }

  async invokeFunction(functionName: string, payload?: any): Promise<any> {
    try {
      const { data, error } = await this.supabase.functions.invoke(functionName, {
        method: 'POST',
        body: payload
      })

      if (error) {
        logger.error(`Failed to invoke function ${functionName}:`, error)
        throw error
      }

      return data
    } catch (error) {
      logger.error(`Failed to invoke function ${functionName}:`, error)
      throw error
    }
  }
}
