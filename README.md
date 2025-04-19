# BUTLER

BUTLER (Benevolent Untiring Taskmaster for Language, Execution and Results) is your personal AI assistant that helps automate various tasks on your computer.

## Features

- **Chat/Vector Database**: RAG setup for accessing and querying your personal knowledge base
- **File System Cleanup**: Automated file organization based on custom rules
- **Calendar Management**: Smart calendar event generation and management
- **Task Automation**: Various automated tasks including:
  - Calendar event generation
  - Contact management
  - Amazon order automation
  - Email automation
- **Voice Control**: Voice commands and responses using Whisper + Eleven Labs

## Tech Stack

- Frontend: React + TypeScript + Vite
- Styling: Tailwind CSS
- UI Components: Headless UI
- Icons: Heroicons

## Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## Project Structure

- `/src`: Source code
  - `/components`: Reusable UI components
  - `/pages`: Main application pages
  - `/styles`: Global styles and Tailwind configuration
