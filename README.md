# YouTube Downloader

A Vite + Vercel web app for downloading YouTube media that the user owns or has permission to save.

## Features

- Paste normal YouTube or Shorts URLs
- Video metadata and thumbnail preview
- Available combined video + audio source formats
- Available audio-only source formats
- Streaming downloads through a Vercel function
- Rights confirmation before analysis and download
- No database and no persistent media storage

## Local development

Install the Vercel CLI, then:

```bash
npm install
vercel dev
```

## Production

```bash
npm run build
```

The frontend is deployed as a Vite static build, while `/api/info` and `/api/download` run as Vercel Functions.

## Usage notice

Use only for content you own, public-domain or openly licensed media, or other content you are authorized to download. This project is not affiliated with YouTube or Google.
