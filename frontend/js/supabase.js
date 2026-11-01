import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://bwohtlstxxbbinfqbjjm.supabase.co';
const supabaseKey = 'sb_publishable_WVo1c3aVVZPVGUChbeaSAw_TVNGAuBF';

export const supabase = createClient(supabaseUrl, supabaseKey);
