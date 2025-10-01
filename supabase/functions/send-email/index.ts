import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailRequest {
  conversationId: string;
  recipientEmail: string;
  emailType?: 'summary' | 'full_report' | 'notification';
  customMessage?: string;
}

interface EmailResponse {
  success: boolean;
  messageId?: string;
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
    const { conversationId, recipientEmail, emailType = 'summary', customMessage }: EmailRequest = await req.json()

    if (!conversationId || !recipientEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: conversationId, recipientEmail' }),
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

    // Generate email content
    const emailContent = generateEmailContent(conversation, emailType, customMessage)

    // Send email using a simple SMTP approach
    // In production, you might want to use a service like SendGrid, Mailgun, or AWS SES
    const emailResult = await sendEmail({
      to: recipientEmail,
      from: Deno.env.get('EMAIL_FROM') || 'noreply@voicechatwidget.com',
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    })

    if (!emailResult.success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send email' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update conversation to mark email as sent
    const { error: updateError } = await supabaseClient
      .from('conversations')
      .update({ 
        email_sent: true,
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
        event_type: 'email_sent',
        event_data: {
          recipient_email: recipientEmail,
          email_type: emailType,
          message_id: emailResult.messageId
        }
      })

    // Record cost tracking
    await supabaseClient
      .from('cost_tracking')
      .insert({
        conversation_id: conversationId,
        service: 'email',
        cost_amount: 0.001, // Approximate cost per email
        currency: 'USD',
        usage_data: {
          recipient_email: recipientEmail,
          email_type: emailType,
          message_id: emailResult.messageId
        },
        billing_period: new Date().toISOString().split('T')[0]
      })

    const response: EmailResponse = {
      success: true,
      messageId: emailResult.messageId
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Email sending error:', error)
    
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

function generateEmailContent(conversation: any, emailType: string, customMessage?: string) {
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

  let subject = ''
  let html = ''
  let text = ''

  switch (emailType) {
    case 'full_report':
      subject = `Full Conversation Report - ${conversation.sessions.app_name}`
      html = generateFullReportHTML(conversation, customMessage)
      text = generateFullReportText(conversation, customMessage)
      break
    case 'notification':
      subject = `Conversation Completed - ${conversation.sessions.app_name}`
      html = generateNotificationHTML(conversation, customMessage)
      text = generateNotificationText(conversation, customMessage)
      break
    case 'summary':
    default:
      subject = `Conversation Summary - ${conversation.sessions.app_name}`
      html = generateSummaryHTML(conversation, customMessage)
      text = generateSummaryText(conversation, customMessage)
      break
  }

  return { subject, html, text }
}

function generateSummaryHTML(conversation: any, customMessage?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #007bff; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .info-box { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .summary { background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .footer { background: #6c757d; color: white; padding: 15px; text-align: center; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Conversation Summary</h1>
            <p>${conversation.sessions.app_name}</p>
        </div>
        <div class="content">
            ${customMessage ? `<p><strong>Message:</strong> ${customMessage}</p>` : ''}
            <div class="info-box">
                <h3>Session Details</h3>
                <p><strong>Officer:</strong> ${conversation.sessions.officer_email}</p>
                <p><strong>Duration:</strong> ${formatDuration(conversation.duration)}</p>
                <p><strong>Date:</strong> ${formatDate(conversation.start_time)}</p>
                <p><strong>Status:</strong> ${conversation.status}</p>
            </div>
            ${conversation.summary ? `
                <div class="summary">
                    <h3>Summary</h3>
                    <p>${conversation.summary}</p>
                </div>
            ` : ''}
            ${conversation.pdf_url ? `
                <p><a href="${conversation.pdf_url}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Download Full Report</a></p>
            ` : ''}
        </div>
        <div class="footer">
            <p>This email was automatically generated by the Voice Chat Widget system.</p>
        </div>
    </body>
    </html>
  `
}

function generateSummaryText(conversation: any, customMessage?: string): string {
  return `
CONVERSATION SUMMARY
${conversation.sessions.app_name}

${customMessage ? `Message: ${customMessage}\n` : ''}

Session Details:
- Officer: ${conversation.sessions.officer_email}
- Duration: ${formatDuration(conversation.duration)}
- Date: ${formatDate(conversation.start_time)}
- Status: ${conversation.status}

${conversation.summary ? `Summary:\n${conversation.summary}\n` : ''}

${conversation.pdf_url ? `Full Report: ${conversation.pdf_url}` : ''}

---
This email was automatically generated by the Voice Chat Widget system.
  `
}

function generateFullReportHTML(conversation: any, customMessage?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #007bff; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .info-box { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .transcript { background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; white-space: pre-wrap; font-family: monospace; }
            .footer { background: #6c757d; color: white; padding: 15px; text-align: center; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Full Conversation Report</h1>
            <p>${conversation.sessions.app_name}</p>
        </div>
        <div class="content">
            ${customMessage ? `<p><strong>Message:</strong> ${customMessage}</p>` : ''}
            <div class="info-box">
                <h3>Session Details</h3>
                <p><strong>Officer:</strong> ${conversation.sessions.officer_email}</p>
                <p><strong>Duration:</strong> ${formatDuration(conversation.duration)}</p>
                <p><strong>Date:</strong> ${formatDate(conversation.start_time)}</p>
                <p><strong>Status:</strong> ${conversation.status}</p>
            </div>
            ${conversation.summary ? `
                <div class="info-box">
                    <h3>Summary</h3>
                    <p>${conversation.summary}</p>
                </div>
            ` : ''}
            ${conversation.transcript ? `
                <div class="transcript">
                    <h3>Full Transcript</h3>
                    <p>${conversation.transcript}</p>
                </div>
            ` : ''}
        </div>
        <div class="footer">
            <p>This email was automatically generated by the Voice Chat Widget system.</p>
        </div>
    </body>
    </html>
  `
}

function generateFullReportText(conversation: any, customMessage?: string): string {
  return `
FULL CONVERSATION REPORT
${conversation.sessions.app_name}

${customMessage ? `Message: ${customMessage}\n` : ''}

Session Details:
- Officer: ${conversation.sessions.officer_email}
- Duration: ${formatDuration(conversation.duration)}
- Date: ${formatDate(conversation.start_time)}
- Status: ${conversation.status}

${conversation.summary ? `Summary:\n${conversation.summary}\n` : ''}

${conversation.transcript ? `Full Transcript:\n${conversation.transcript}` : ''}

---
This email was automatically generated by the Voice Chat Widget system.
  `
}

function generateNotificationHTML(conversation: any, customMessage?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #28a745; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .info-box { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .footer { background: #6c757d; color: white; padding: 15px; text-align: center; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Conversation Completed</h1>
            <p>${conversation.sessions.app_name}</p>
        </div>
        <div class="content">
            ${customMessage ? `<p><strong>Message:</strong> ${customMessage}</p>` : ''}
            <div class="info-box">
                <h3>Session Details</h3>
                <p><strong>Officer:</strong> ${conversation.sessions.officer_email}</p>
                <p><strong>Duration:</strong> ${formatDuration(conversation.duration)}</p>
                <p><strong>Date:</strong> ${formatDate(conversation.start_time)}</p>
                <p><strong>Status:</strong> ${conversation.status}</p>
            </div>
            <p>The conversation has been processed and is ready for review.</p>
            ${conversation.pdf_url ? `
                <p><a href="${conversation.pdf_url}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Report</a></p>
            ` : ''}
        </div>
        <div class="footer">
            <p>This email was automatically generated by the Voice Chat Widget system.</p>
        </div>
    </body>
    </html>
  `
}

function generateNotificationText(conversation: any, customMessage?: string): string {
  return `
CONVERSATION COMPLETED
${conversation.sessions.app_name}

${customMessage ? `Message: ${customMessage}\n` : ''}

Session Details:
- Officer: ${conversation.sessions.officer_email}
- Duration: ${formatDuration(conversation.duration)}
- Date: ${formatDate(conversation.start_time)}
- Status: ${conversation.status}

The conversation has been processed and is ready for review.

${conversation.pdf_url ? `View Report: ${conversation.pdf_url}` : ''}

---
This email was automatically generated by the Voice Chat Widget system.
  `
}

async function sendEmail(emailData: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ success: boolean; messageId?: string }> {
  // This is a simplified email sending implementation
  // In production, you would use a proper email service
  
  try {
    // For now, we'll just log the email and return success
    // In production, integrate with SendGrid, Mailgun, AWS SES, etc.
    console.log('Email would be sent:', {
      to: emailData.to,
      from: emailData.from,
      subject: emailData.subject,
      htmlLength: emailData.html.length,
      textLength: emailData.text.length
    })

    // Simulate email sending
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    return {
      success: true,
      messageId: messageId
    }
  } catch (error) {
    console.error('Email sending error:', error)
    return {
      success: false
    }
  }
}