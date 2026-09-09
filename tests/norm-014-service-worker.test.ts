import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe,it,expect,vi } from 'vitest';
describe('NORM-014 offline cache boundaries',()=>{
  function worker(){
    const handlers:Record<string,(event:unknown)=>void>={};
    const match=vi.fn().mockResolvedValue(undefined);
    runInNewContext(readFileSync('public/sw.js','utf8'),{
      self:{location:{origin:'https://manito.test'},addEventListener:(name:string,cb:(event:unknown)=>void)=>{handlers[name]=cb;}},
      URL,Response,fetch:vi.fn().mockRejectedValue(new Error('offline')),caches:{match},
    });
    return {handlers,match};
  }
  it.each(['/auth/confirm?token_hash=secret','/api/location?lat=1','/private-data'])('does not cache sensitive or unknown endpoints %s',path=>{
    const {handlers}=worker();const respondWith=vi.fn();handlers.fetch({request:{url:'https://manito.test'+path,method:'GET',mode:'cors'},respondWith});expect(respondWith).not.toHaveBeenCalled();
  });
  it('never serves HTML as a missing JavaScript chunk',async()=>{
    const {handlers,match}=worker();let response:Promise<Response>|undefined;
    handlers.fetch({request:{url:'https://manito.test/_next/static/chunk.js',method:'GET',mode:'cors'},respondWith:(p:Promise<Response>)=>{response=p;}});
    expect((await response)?.status).toBe(503);expect(match).not.toHaveBeenCalledWith('/');
  });
});
