import { describe,expect,it } from 'vitest';
import { resolveSupabaseConfig } from '../app/lib/supabaseConfig';
describe('NORM-014 Supabase config', () => {
  const saved = {url:'https://old.supabase.co',key:'old-key'};
  it('prefers a complete deployment pair',()=>expect(resolveSupabaseConfig({url:'https://new.supabase.co',key:'new-key'},saved)).toEqual({url:'https://new.supabase.co',key:'new-key'}));
  it.each([{url:'https://new.supabase.co'},{key:'new-key'}])('rejects partial deployment without mixing old config', env=>expect(resolveSupabaseConfig(env,saved)).toBeNull());
  it('supports an explicit local development pair',()=>expect(resolveSupabaseConfig({}, {url:'http://127.0.0.1:54321',key:'public-key'})).not.toBeNull());
  it.each([null,{},'bad',{url:'not a URL',key:'x'},{url:'https://x.co',key:'sb_secret_no'},{url:'http://untrusted.co',key:'x'}])('fails closed for malformed stored config',saved=>expect(resolveSupabaseConfig({},saved)).toBeNull());
});
