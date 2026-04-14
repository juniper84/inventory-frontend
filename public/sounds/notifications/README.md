# Notification Sounds

The notification system expects 4 audio files here:

- `success.mp3` — soft rising chime (~100-150ms)
- `error.mp3` — low muted buzz (~150-200ms)
- `warning.mp3` — short double-tap (~120ms)
- `info.mp3` — gentle ping (~100ms)

**These files are currently missing.** The AudioPool silently skips playback when files are missing, so the app works normally without sounds. When you add real audio files with these exact names, sounds will start playing for users who have enabled "Notification sounds" in settings.

## Requirements
- Format: MP3 (or convert to MP3 from source)
- Duration: 100-250ms each
- Volume: Normalized, subtle (not startling)
- File size: Under 20KB each
- Royalty-free / licensed for commercial use

## Suggested sources
- freesound.org (CC0 / CC-BY sounds)
- Pixabay Sound Effects
- Zapsplat (free with attribution)
- Commissioned custom sounds (recommended long-term)

## After adding files
No code changes needed. Drop the 4 files into this folder, commit them, and they'll be served at `/sounds/notifications/*.mp3` automatically.
