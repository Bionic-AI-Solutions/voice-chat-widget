import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExportRequest {
  dateRange?: {
    start: string
    end: string
  }
  appName?: string
  language?: string
  officerEmail?: string
  format?: 'csv' | 'json'
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { dateRange, appName, language, officerEmail, format = 'csv' }: ExportRequest = await req.json()

    // Build query with filters
    let query = supabaseClient
      .from('conversations')
      .select(`
        id,
        session_id,
        officer_email,
        app_name,
        language,
        status,
        duration,
        start_time,
        end_time,
        created_at,
        updated_at,
        transcript,
        summary,
        audio_url,
        pdf_url
      `)

    // Apply filters
    if (dateRange) {
      query = query
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end)
    }

    if (appName) {
      query = query.eq('app_name', appName)
    }

    if (language) {
      query = query.eq('language', language)
    }

    if (officerEmail) {
      query = query.eq('officer_email', officerEmail)
    }

    const { data: conversations, error } = await query

    if (error) {
      console.error('Error fetching conversations:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch conversations' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (format === 'json') {
      return new Response(
        JSON.stringify({
          success: true,
          data: conversations,
          count: conversations?.length || 0,
          exportedAt: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Generate CSV
    const headers = [
      'ID',
      'Session ID',
      'Officer Email',
      'App Name',
      'Language',
      'Status',
      'Duration (seconds)',
      'Start Time',
      'End Time',
      'Created At',
      'Updated At',
      'Transcript Length',
      'Summary Length',
      'Audio URL',
      'PDF URL'
    ]

    const rows = conversations?.map(conv => [
      conv.id,
      conv.session_id,
      conv.officer_email,
      conv.app_name,
      conv.language,
      conv.status,
      conv.duration || 0,
      conv.start_time,
      conv.end_time,
      conv.created_at,
      conv.updated_at,
      conv.transcript?.length || 0,
      conv.summary?.length || 0,
      conv.audio_url || '',
      conv.pdf_url || ''
    ]) || []

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    // Log export activity
    await supabaseClient
      .from('audit_logs')
      .insert({
        action: 'conversation_export',
        details: {
          filters: { dateRange, appName, language, officerEmail },
          format,
          recordCount: conversations?.length || 0
        },
        created_at: new Date().toISOString()
      })

    return new Response(csvContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="conversations-export-${new Date().toISOString().split('T')[0]}.csv"`
      }
    })

  } catch (error) {
    console.error('Error in conversation-export function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
