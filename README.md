# Abc One Rooms

A small Firebase-powered booking management page for two hotel rooms.

## Files

- `index.html` - app screens and forms
- `styles.css` - mobile-first booking UI
- `app.js` - Firebase, booking dates, room status, and accountant logic

## Run locally

Use a local web server from this folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Firebase data

The app uses:

- Firestore collection `bookings`
- Firestore collection `expenses`
- Firebase Storage folder `aadhaar/`

The Accountant page shows the previous calendar month, not the last 30 days.
