# Voice Chat Bot Widget

An embeddable React voice chat bot widget with distributed worker architecture, Supabase integration, and comprehensive admin dashboard.

## Features

- **Embeddable Widget**: React component that can be integrated into any web application
- **Real-time Voice Communication**: WebRTC integration with Speechmatics API for live transcription
- **Multi-language Support**: Support for Hindi, English, and other languages
- **Distributed Processing**: Redis-based worker architecture for scalable background processing
- **Supabase Integration**: Full-stack solution with PostgreSQL, real-time subscriptions, and edge functions
- **Admin Dashboard**: Comprehensive analytics, file management, and system monitoring
- **Cost Tracking**: Real-time cost analysis and billing information
- **Security**: Row Level Security (RLS) policies and comprehensive authentication

## Architecture

### Frontend Components
- **Widget**: Collapsible React component with voice controls
- **Admin Dashboard**: Next.js application with analytics and management features

### Backend Services
- **API Server**: Node.js/Express with Socket.io for real-time communication
- **Worker Pool**: Distributed processing for audio, summarization, PDF generation, and email
- **Supabase**: Database, authentication, storage, and edge functions

### Infrastructure
- **Redis**: Task queue management and caching
- **MinIO**: Primary audio file storage
- **Supabase Storage**: Document and report storage

## Quick Start

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- Supabase CLI
- Redis instance
- MinIO instance

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Bionic-AI-Solutions/voice-chat-widget.git
cd voice-chat-widget
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start development services:
```bash
docker-compose up -d
```

5. Initialize Supabase:
```bash
supabase start
supabase migration up
```

6. Start the development servers:
```bash
npm run dev:widget      # Widget development server
npm run dev:admin       # Admin dashboard
npm run dev:server      # API server
npm run dev:workers     # Worker processes
```

## Project Structure

```
voice-chat-widget/
├── src/                    # Widget source code
├── admin/                  # Admin dashboard
├── server/                 # API server
├── workers/                # Worker processes
├── supabase/               # Supabase configuration
├── docs/                   # Documentation
├── scripts/                # Utility scripts
└── prompts/                # LLM prompts and templates
```

## Documentation

- [Implementation Plan](docs/feature/voice-chat-widget/implementation-plan.md)
- [Technical Architecture](docs/feature/voice-chat-widget/technical-architecture.md)
- [API Documentation](docs/feature/voice-chat-widget/api-documentation.md)
- [Usage Guide](docs/feature/voice-chat-widget/usage-document.md)

## Contributing

Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions, please contact the development team or create an issue in this repository.