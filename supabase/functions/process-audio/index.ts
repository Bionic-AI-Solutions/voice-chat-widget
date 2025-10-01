import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AudioProcessingRequest {
  sessionId: string;
  audioData: string; // base64 encoded audio
  audioFormat: {
    sampleRate: number;
    channels: number;
    encoding: string;
  };
  metadata?: Record<string, any>;
}

interface AudioProcessingResponse {
  success: boolean;
  audioFileId?: string;
  transcript?: string;
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
    const { sessionId, audioData, audioFormat, metadata }: AudioProcessingRequest = await req.json()

    if (!sessionId || !audioData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: sessionId, audioData' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Decode base64 audio data
    const audioBuffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0))
    
    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `audio_${sessionId}_${timestamp}.wav`
    
    // Upload audio file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('audio-files')
      .upload(filename, audioBuffer, {
        contentType: 'audio/wav',
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to upload audio file' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get public URL for the uploaded file
    const { data: urlData } = supabaseClient.storage
      .from('audio-files')
      .getPublicUrl(filename)

    // Store audio file metadata in database
    const { data: audioFileData, error: dbError } = await supabaseClient
      .from('audio_files')
      .insert({
        session_id: sessionId,
        filename: filename,
        original_filename: filename,
        file_size: audioBuffer.length,
        mime_type: 'audio/wav',
        storage_path: uploadData.path,
        storage_provider: 'supabase',
        duration: audioFormat.sampleRate ? Math.round(audioBuffer.length / (audioFormat.sampleRate * audioFormat.channels * 2)) : null,
        sample_rate: audioFormat.sampleRate,
        channels: audioFormat.channels,
        metadata: metadata || {}
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to store audio file metadata' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update session with audio URL
    const { error: sessionError } = await supabaseClient
      .from('sessions')
      .update({ 
        audio_url: urlData.publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    if (sessionError) {
      console.error('Session update error:', sessionError)
    }

    // Queue transcription job
    const { error: jobError } = await supabaseClient
      .from('jobs')
      .insert({
        type: 'transcription',
        status: 'pending',
        priority: 1,
        payload: {
          sessionId,
          audioFileId: audioFileData.id,
          audioUrl: urlData.publicUrl,
          language: metadata?.language || 'en',
          audioFormat
        }
      })

    if (jobError) {
      console.error('Job creation error:', jobError)
    }

    // Log analytics event
    await supabaseClient
      .from('analytics')
      .insert({
        session_id: sessionId,
        event_type: 'audio_processed',
        event_data: {
          filename,
          file_size: audioBuffer.length,
          audio_format: audioFormat
        }
      })

    const response: AudioProcessingResponse = {
      success: true,
      audioFileId: audioFileData.id
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Audio processing error:', error)
    
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