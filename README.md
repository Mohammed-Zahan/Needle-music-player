<<<<<<< HEAD
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
=======
# needle. 🎵

A vinyl-inspired music player for the web. Import your own audio files, or search and stream from YouTube, all in one library with a spinning-record UI.

**Live demo:** _add your Vercel link here_

## Features

- **Vinyl player UI** with playback controls, seek bar, and volume
- **Local files**: import your own audio, stored in your browser with IndexedDB
- **YouTube search**: find songs through the YouTube Data API and stream them with the YouTube IFrame Player
- **Paste a link**: add a YouTube video by URL or video ID
- **Duplicate protection**: a song already in your library can't be added twice from search
- **Custom cover art** for tracks
- **Library search** and track removal
- **Light and dark themes**
- **Collapsible sidebar**
- **Installable as a PWA**

## Tech stack

- [React](https://react.dev) + [Vite](https://vite.dev)
- IndexedDB for local storage
- YouTube Data API v3 (search) and YouTube IFrame API (playback)
- [lucide-react](https://lucide.dev) icons
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app) for PWA support
- Deployed on [Vercel](https://vercel.com)

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/Mohammed-Zahan/needle-player.git
cd needle-player
npm install
```

### 2. Add a YouTube API key

Search needs a YouTube Data API v3 key.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create (or pick) a project.
2. Enable **YouTube Data API v3** under APIs & Services → Library.
3. Create an API key under APIs & Services → Credentials.
4. Create a `.env` file in the project root:

```env
VITE_YOUTUBE_API_KEY=your_api_key_here
```

> The variable name must start with `VITE_` for Vite to expose it. Restart the dev server after changing `.env`.

### 3. Run it

```bash
npm run dev
```

Then open the local URL shown in the terminal (usually `http://localhost:5173`).

## Scripts

| Command           | What it does                     |
| ----------------- | -------------------------------- |
| `npm run dev`     | Start the dev server             |
| `npm run build`   | Build for production into `dist` |
| `npm run preview` | Preview the production build     |
| `npm run lint`    | Run ESLint                       |

## Deploying to Vercel

1. Push the repo to GitHub (make sure `.env` is in `.gitignore`).
2. Import the repo in [Vercel](https://vercel.com). It detects Vite automatically.
3. Add the environment variable `VITE_YOUTUBE_API_KEY` before deploying.
4. If you add or change the variable later, **redeploy**, because Vite bakes it in at build time.

## API key notes

- Vite embeds the key in the browser bundle, so it is visible to anyone using the app. In Google Cloud Console, restrict the key to **HTTP referrers** (your Vercel domain and `http://localhost:5173/*`) and to **YouTube Data API v3** only.
- The YouTube Data API has a daily quota (10,000 units by default), and each search costs 100 units, so roughly 100 searches a day. needle. caches repeated queries to save quota.
- Never commit your `.env` file.

## Project structure

```
needle-player/
├── public/                 # icons, favicon
├── src/
│   ├── components/
│   │   └── NeedlePlayer.jsx   # the player (UI, library, search, playback)
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── vite.config.js          # Vite + PWA config
└── package.json
```

## Author

Built by **Zahan** · [GitHub](https://github.com/Mohammed-Zahan)
>>>>>>> a4439dac2cd894965ab3e480209c5aa2c098ba0e
