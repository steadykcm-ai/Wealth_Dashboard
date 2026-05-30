-- Add user_id column to assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id column to cash table
ALTER TABLE cash ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id column to daily_log table
ALTER TABLE daily_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Populate existing rows with user_id (Jake's account)
UPDATE assets SET user_id = '56701cc8-3dff-405d-a2b7-1ff4301e92cc' WHERE user_id IS NULL;
UPDATE cash SET user_id = '56701cc8-3dff-405d-a2b7-1ff4301e92cc' WHERE user_id IS NULL;
UPDATE daily_log SET user_id = '56701cc8-3dff-405d-a2b7-1ff4301e92cc' WHERE user_id IS NULL;

-- Make user_id NOT NULL (after all rows are populated)
ALTER TABLE assets ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE cash ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE daily_log ALTER COLUMN user_id SET NOT NULL;
