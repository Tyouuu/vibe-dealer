-- Phase 19: the receipts bucket (0002) never set a size/MIME limit at the
-- bucket level — the only gate was a client-side accept="image/*" (a display
-- filter, not enforcement) on the upload input, unlike /api/reconcile/extract
-- which already validates both server-side. This is the real backstop; the
-- matching client-side check added in entry-form.tsx is just a fast-fail UX
-- nicety on top of it.
update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'receipts';
