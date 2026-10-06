-- Recordings exist in Teams but never reached the portal.
--
-- The harvester could only store a recording it could locate as a OneDrive item, and when Graph did not
-- give it one it fell back to scanning the service account's OneDrive. That account has no OneDrive, so
-- every attempt failed with "ResourceNotFound: User's mysite not found" and no recording was ever saved.
--
-- Graph does hand back a usable pointer: recordingContentUrl, a Graph URL the application token can read
-- the bytes from. It is stored here. drive_id / drive_item_id stay for tenants that do expose a drive
-- item - the harvester prefers those when present, because a drive item yields a short-lived direct
-- download URL and the content URL has to be streamed through the Edge Function.

alter table public.recordings add column if not exists content_url text;

comment on column public.recordings.content_url is
  'Graph recordingContentUrl. Readable only with the application token, so playback streams through the recording-play function rather than redirecting.';

-- A row is only useful if it can be played: either a drive item or a content URL.
alter table public.recordings drop constraint if exists recordings_playable;
alter table public.recordings add constraint recordings_playable
  check (content_url is not null or (drive_id is not null and drive_item_id is not null));
