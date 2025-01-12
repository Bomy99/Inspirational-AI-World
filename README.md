# Inspirational AI World

An AI-powered inspiration generator that creates unique images and quotes.

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env` file with required environment variables:
   ```
   OPENAI_API_KEY=your_key
   MONGODB_URI=your_mongodb_uri
   BUYMEACOFFEE_WEBHOOK_SECRET=your_secret
   ```
4. Run development server: `npm run dev`
5. Run production server: `npm start`

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key
- `MONGODB_URI`: MongoDB connection string
- `BUYMEACOFFEE_WEBHOOK_SECRET`: Secret for Buy Me a Coffee webhooks
- `NODE_ENV`: Set to 'production' in production environment

## Features

- Generate AI images and quotes
- Coin-based generation system
- Buy Me a Coffee integration
- Image download functionality 