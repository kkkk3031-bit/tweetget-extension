# TweetGet — Twitter/X Video & Image Downloader

> Browser extension to download videos, GIFs, and images from Twitter/X in one click. No ads, no upload limits.

<p align="center">
  <img src="assets/icon-128.png" width="96" alt="TweetGet icon" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-1d9bf0" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Chrome%20%7C%20Edge-supported-1d9bf0" alt="Supported browsers" />
</p>

---

## 🌐 Website

No extension needed — use TweetGet straight from the browser:

**https://tweetget-production.up.railway.app**

Paste any tweet link → download the video as MP4 (or audio as MP3).

Get the extension (and its siblings for YouTube, Instagram, TikTok) from the download hub:

**https://getpack-production.up.railway.app**

## Features

- **MP4 video / MP3 audio** from any public tweet
- Works with multi-video tweets
- **Download buttons injected** on tweet pages
- Right-click any tweet link → "Download with TweetGet"
- Real tweet text as the filename (Arabic & emoji safe)
- **Zero build step** — pure vanilla JS + CSS

## Install (Developer Mode)

1. Download the zip from the [website](https://getpack-production.up.railway.app) and unzip it
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the unzipped folder

## Stack

- Manifest V3, vanilla JS service worker + content script
- Backend: Flask + yt-dlp on Railway
