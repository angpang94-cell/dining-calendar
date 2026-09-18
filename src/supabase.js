import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const validUrl = typeof url === 'string' && /^https?:\/\//.test(url);
const validKey = typeof key === 'string' && key.length > 20 && !key.includes('Publishable_key');

export const supabaseConfigError = !validUrl || !validKey
  ? 'Vercel 환경 변수 VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY를 설정해주세요.'
  : '';
export const supabase = supabaseConfigError ? null : createClient(url, key);
