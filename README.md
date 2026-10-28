# PixQuest – Image Search Engine

An image search app that finds photos with the [Unsplash API](https://unsplash.com/developers) and displays them in a responsive grid with a lightbox viewer.

**Live demo:** https://rehnuma-patel.github.io/image-search-engine/

## Features
- **Debounced search**: results update 500 ms after you stop typing, so the API isn't called on every key press
- **Response caching**: results are cached for an hour (sessionStorage), so repeating a search or filter costs no API requests. An identical search that is already on screen is skipped.
- **Rate-limit badge**: reads the `X-Ratelimit-Remaining` header and shows how many requests are left this hour
- **Request cancelling**: uses `AbortController`, so a slow old request can't replace newer results
- **Dynamic masonry grid** with responsive `srcset` images, lazy loading, the photo's dominant colour as a placeholder and skeleton loaders
- **Infinite scroll** (IntersectionObserver) for the first 3 pages, then a "Load more" button, to save requests. 30 photos per request (the API maximum).
- **Lightbox modal** (`<dialog>`) with preloaded neighbouring images, previous/next buttons, arrow keys, swipe on mobile, Esc to close, photo details and download
- **Filters**: orientation, colour and sort order (relevant / newest)
- **Result management**: total result count, recent searches (localStorage), popular search chips, shareable `?q=` URLs
- **Error handling**: invalid key (401), rate limit (403/429), offline or network errors, no results, with a "Try again" button
- Light / dark theme, `/` keyboard shortcut to focus the search box, and a responsive, accessible layout
- Follows the Unsplash API guidelines: hotlinked images, photographer attribution with UTM links, and the download endpoint is triggered on download

## Setup
1. Create a free app at https://unsplash.com/oauth/applications
2. Copy the **Access Key** (never the Secret Key)
3. Paste it into `js/config.js`:
   ```js
   ACCESS_KEY: "your-access-key",
   ```
   Or open the site and paste the key into the "Connect to Unsplash" box. It is saved only in your browser.
4. Open `index.html` in a browser.

## Technologies
HTML5 · CSS3 (columns masonry, custom properties) · JavaScript (Fetch API, async/await, AbortController, IntersectionObserver, `<dialog>`) · Unsplash REST API

## Project structure
```
index.html      Page layout, search bar, grid and lightbox
css/style.css   Styles, themes and responsive rules
js/config.js    API key and settings
js/app.js       Search, API calls, rendering, lightbox and errors
```

## Author
Rehnuma Patel – [GitHub](https://github.com/rehnuma-patel)
