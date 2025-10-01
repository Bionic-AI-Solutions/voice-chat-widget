import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PDFRequest {
  conversationId: string;
  template?: 'standard' | 'detailed' | 'executive';
  includeAudio?: boolean;
  includeTranscript?: boolean;
}

interface PDFResponse {
  success: boolean;
  pdfUrl?: string;
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
    const { conversationId, template = 'standard', includeAudio = false, includeTranscript = true }: PDFRequest = await req.json()

    if (!conversationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: conversationId' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get conversation details
    const { data: conversation, error: conversationError } = await supabaseClient
      .from('conversations')
      .select(`
        *,
        sessions!inner (
          officer_email,
          app_name,
          language
        )
      `)
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

    // Generate HTML content for PDF
    const htmlContent = generateHTMLContent(conversation, template, includeTranscript)

    // Convert HTML to PDF using a simple approach
    // In production, you might want to use a more robust PDF generation service
    const pdfBuffer = await generatePDFFromHTML(htmlContent)

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `conversation_${conversationId}_${timestamp}.pdf`
    
    // Upload PDF to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('reports')
      .upload(filename, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to upload PDF file' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get public URL for the uploaded file
    const { data: urlData } = supabaseClient.storage
      .from('reports')
      .getPublicUrl(filename)

    // Update conversation with PDF URL
    const { error: updateError } = await supabaseClient
      .from('conversations')
      .update({ 
        pdf_url: urlData.publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)

    if (updateError) {
      console.error('Update error:', updateError)
    }

    // Log analytics event
    await supabaseClient
      .from('analytics')
      .insert({
        conversation_id: conversationId,
        event_type: 'pdf_generated',
        event_data: {
          template: template,
          include_audio: includeAudio,
          include_transcript: includeTranscript,
          file_size: pdfBuffer.length
        }
      })

    const response: PDFResponse = {
      success: true,
      pdfUrl: urlData.publicUrl
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('PDF generation error:', error)
    
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

function generateHTMLContent(conversation: any, template: string, includeTranscript: boolean): string {
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours}h ${minutes}m ${secs}s`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Conversation Report - ${conversation.sessions.app_name}</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                margin: 0;
                padding: 20px;
                color: #333;
            }
            .header {
                border-bottom: 2px solid #007bff;
                padding-bottom: 20px;
                margin-bottom: 30px;
            }
            .header h1 {
                color: #007bff;
                margin: 0;
                font-size: 28px;
            }
            .header .subtitle {
                color: #666;
                margin: 5px 0 0 0;
                font-size: 16px;
            }
            .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 30px;
            }
            .info-section {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
            }
            .info-section h3 {
                margin: 0 0 10px 0;
                color: #007bff;
                font-size: 16px;
            }
            .info-item {
                margin: 5px 0;
                font-size: 14px;
            }
            .info-label {
                font-weight: bold;
                color: #555;
            }
            .summary-section {
                margin-bottom: 30px;
            }
            .summary-section h2 {
                color: #007bff;
                border-bottom: 1px solid #ddd;
                padding-bottom: 10px;
            }
            .transcript-section {
                margin-bottom: 30px;
            }
            .transcript-section h2 {
                color: #007bff;
                border-bottom: 1px solid #ddd;
                padding-bottom: 10px;
            }
            .transcript-content {
                background: #f8f9fa;
                padding: 20px;
                border-radius: 5px;
                white-space: pre-wrap;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                line-height: 1.4;
            }
            .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #ddd;
                text-align: center;
                color: #666;
                font-size: 12px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Conversation Report</h1>
            <div class="subtitle">${conversation.sessions.app_name}</div>
        </div>

        <div class="info-grid">
            <div class="info-section">
                <h3>Session Information</h3>
                <div class="info-item">
                    <span class="info-label">Officer Email:</span> ${conversation.sessions.officer_email}
                </div>
                <div class="info-item">
                    <span class="info-label">Application:</span> ${conversation.sessions.app_name}
                </div>
                <div class="info-item">
                    <span class="info-label">Language:</span> ${conversation.sessions.language.toUpperCase()}
                </div>
                <div class="info-item">
                    <span class="info-label">Status:</span> ${conversation.status}
                </div>
            </div>
            <div class="info-section">
                <h3>Conversation Details</h3>
                <div class="info-item">
                    <span class="info-label">Start Time:</span> ${formatDate(conversation.start_time)}
                </div>
                <div class="info-item">
                    <span class="info-label">End Time:</span> ${formatDate(conversation.end_time)}
                </div>
                <div class="info-item">
                    <span class="info-label">Duration:</span> ${formatDuration(conversation.duration)}
                </div>
                <div class="info-item">
                    <span class="info-label">Report Generated:</span> ${formatDate(new Date().toISOString())}
                </div>
            </div>
        </div>
  `

  // Add summary section if available
  if (conversation.summary) {
    html += `
        <div class="summary-section">
            <h2>Summary</h2>
            <div class="transcript-content">${conversation.summary}</div>
        </div>
    `
  }

  // Add transcript section if requested and available
  if (includeTranscript && conversation.transcript) {
    html += `
        <div class="transcript-section">
            <h2>Full Transcript</h2>
            <div class="transcript-content">${conversation.transcript}</div>
        </div>
    `
  }

  html += `
        <div class="footer">
            <p>This report was automatically generated by the Voice Chat Widget system.</p>
            <p>Conversation ID: ${conversation.id}</p>
        </div>
    </body>
    </html>
  `

  return html
}

async function generatePDFFromHTML(html: string): Promise<Uint8Array> {
  // This is a simplified PDF generation
  // In production, you would use a proper PDF generation library like Puppeteer
  // For now, we'll create a simple text-based PDF structure
  
  const pdfContent = `
%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj

4 0 obj
<<
/Length ${html.length}
>>
stream
BT
/F1 12 Tf
72 720 Td
(${html.replace(/[()\\]/g, '\\$&')}) Tj
ET
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000${(html.length + 300).toString().padStart(3, '0')} 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
${html.length + 400}
%%EOF
  `

  return new TextEncoder().encode(pdfContent)
}