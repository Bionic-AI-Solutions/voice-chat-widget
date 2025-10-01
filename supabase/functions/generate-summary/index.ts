import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SummaryRequest {
  conversationId: string;
  transcript: string;
  language?: string;
  summaryType?: 'brief' | 'detailed' | 'action_items';
}

interface SummaryResponse {
  success: boolean;
  summary?: string;
  actionItems?: string[];
  keyPoints?: string[];
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body
    const { conversationId, transcript, language = 'en', summaryType = 'detailed' }: SummaryRequest = await req.json()

    if (!conversationId || !transcript) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: conversationId, transcript' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get conversation details
    const { data: conversation, error: conversationError } = await supabaseClient
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (conversationError || !conversation) {
      return new Response(
        JSON.stringify({ success: false, error: 'Conversation not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Generate summary using OpenAI API
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'OpenAI API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create prompt based on summary type
    let prompt = ''
    switch (summaryType) {
      case 'brief':
        prompt = `Provide a brief summary (2-3 sentences) of this conversation in ${language}:\n\n${transcript}`
        break
      case 'action_items':
        prompt = `Extract action items and key decisions from this conversation in ${language}. Format as a bulleted list:\n\n${transcript}`
        break
      case 'detailed':
      default:
        prompt = `Provide a detailed summary of this conversation in ${language}. Include key points, decisions made, and any action items:\n\n${transcript}`
        break
    }

    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a professional assistant that creates accurate and helpful summaries of conversations. Focus on key information, decisions, and actionable items.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      })
    })

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json()
      console.error('OpenAI API error:', errorData)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to generate summary' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const openaiData = await openaiResponse.json()
    const summary = openaiData.choices[0]?.message?.content || ''

    // Calculate cost
    const inputTokens = openaiData.usage?.prompt_tokens || 0
    const outputTokens = openaiData.usage?.completion_tokens || 0
    const totalTokens = inputTokens + outputTokens
    
    // OpenAI pricing (approximate)
    const costPerInputToken = 0.00003 // $0.03 per 1K tokens for GPT-4
    const costPerOutputToken = 0.00006 // $0.06 per 1K tokens for GPT-4
    const cost = (inputTokens * costPerInputToken) + (outputTokens * costPerOutputToken)

    // Update conversation with summary
    const { error: updateError } = await supabaseClient
      .from('conversations')
      .update({ 
        summary: summary,
        cost_breakdown: {
          ...conversation.cost_breakdown,
          openai: {
            summary_generation: {
              tokens: totalTokens,
              cost: cost,
              model: 'gpt-4'
            }
          }
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)

    if (updateError) {
      console.error('Update error:', updateError)
    }

    // Record cost tracking
    await supabaseClient
      .from('cost_tracking')
      .insert({
        conversation_id: conversationId,
        service: 'openai',
        cost_amount: cost,
        currency: 'USD',
        usage_data: {
          tokens: totalTokens,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          model: 'gpt-4',
          operation: 'summary_generation'
        },
        billing_period: new Date().toISOString().split('T')[0]
      })

    // Log analytics event
    await supabaseClient
      .from('analytics')
      .insert({
        conversation_id: conversationId,
        event_type: 'summary_generated',
        event_data: {
          summary_type: summaryType,
          language: language,
          tokens_used: totalTokens,
          cost: cost
        }
      })

    // Parse action items if summary type is action_items
    let actionItems: string[] = []
    let keyPoints: string[] = []
    
    if (summaryType === 'action_items') {
      actionItems = summary.split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
        .map(line => line.replace(/^[-•]\s*/, '').trim())
        .filter(item => item.length > 0)
    } else {
      // Extract key points from detailed summary
      keyPoints = summary.split('\n')
        .filter(line => line.trim().length > 0)
        .slice(0, 5) // Take first 5 points
    }

    const response: SummaryResponse = {
      success: true,
      summary: summary,
      actionItems: actionItems.length > 0 ? actionItems : undefined,
      keyPoints: keyPoints.length > 0 ? keyPoints : undefined
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Summary generation error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
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