import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe,it,expect,vi } from 'vitest';
describe('NORM-014 offline cache boundaries',()=>{
  function worker(network?:Response,cached?:Response){
    const handlers:Record<string,(event:unknown)=>void>={};
    let saved=cached;
    const match=vi.fn().mockImplementation(async()=>saved);
    const put=vi.fn().mockResolvedValue(undefined);
    const remove=vi.fn().mockImplementation(async()=>{saved=undefined;return true;});
    const fetchMock=network ? vi.fn().mockResolvedValue(network) : vi.fn().mockRejectedValue(new Error('offline'));
    const cache={match,put,delete:remove};
    runInNewContext(readFileSync('public/sw.js','utf8'),{
      self:{location:{origin:'https://manito.test'},addEventListener:(name:string,cb:(event:unknown)=>void)=>{handlers[name]=cb;}},
      URL,Response,fetch:fetchMock,caches:{open:vi.fn().mockResolvedValue(cache)},
    });
    return {handlers,match,put,remove,fetchMock};
  }
  it.each(['/auth/confirm?token_hash=secret','/api/location?lat=1','/private-data'])('does not cache sensitive or unknown endpoints %s',path=>{
    const {handlers}=worker();const respondWith=vi.fn();handlers.fetch({request:{url:'https://manito.test'+path,method:'GET',mode:'cors'},respondWith});expect(respondWith).not.toHaveBeenCalled();
  });
  it('never serves HTML as a missing JavaScript chunk',async()=>{
    const {handlers,match}=worker();let response:Promise<Response>|undefined;
    handlers.fetch({request:{url:'https://manito.test/_next/static/chunk-abcdef123456.js',method:'GET',mode:'cors'},respondWith:(p:Promise<Response>)=>{response=p;}});
    expect((await response)?.status).toBe(503);expect(match).not.toHaveBeenCalledWith('/');
  });
  it.each(['chunk-abcdef123456.js','style-abcdef123456.css'])('rejects a 200 HTML fallback for %s without caching it',async(filename)=>{
    const html=new Response('<!doctype html><title>Fallback</title>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
    const {handlers,put}=worker(html);let response:Promise<Response>|undefined;
    handlers.fetch({request:{url:'https://manito.test/_next/static/'+filename,method:'GET',mode:'cors'},respondWith:(p:Promise<Response>)=>{response=p;},waitUntil:vi.fn()});
    expect((await response)?.status).toBe(502);
    expect(put).not.toHaveBeenCalled();
  });
  it('does not expose an HTML error body for a missing chunk',async()=>{
    const html=new Response('<html>missing</html>',{status:404,headers:{'content-type':'text/html'}});
    const {handlers,put}=worker(html);let response:Promise<Response>|undefined;
    handlers.fetch({request:{url:'https://manito.test/_next/static/chunk-abcdef123456.js',method:'GET',mode:'cors'},respondWith:(p:Promise<Response>)=>{response=p;},waitUntil:vi.fn()});
    expect((await response)?.status).toBe(404);
    expect(await (await response)?.text()).toBe('');
    expect(put).not.toHaveBeenCalled();
  });
  it('serves a valid cached exact JavaScript chunk while offline',async()=>{
    const cached=new Response('console.log(1)',{headers:{'content-type':'text/javascript'}});
    const {handlers,fetchMock}=worker(undefined,cached);let response:Promise<Response>|undefined;
    handlers.fetch({request:{url:'https://manito.test/_next/static/chunk-abcdef123456.js',method:'GET',mode:'cors'},respondWith:(p:Promise<Response>)=>{response=p;}});
    expect(await response).toBe(cached);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('discards a cached HTML chunk before reporting an offline miss',async()=>{
    const cached=new Response('<html></html>',{headers:{'content-type':'text/html'}});
    const {handlers,remove}=worker(undefined,cached);let response:Promise<Response>|undefined;
    handlers.fetch({request:{url:'https://manito.test/_next/static/chunk-abcdef123456.js',method:'GET',mode:'cors'},respondWith:(p:Promise<Response>)=>{response=p;}});
    expect((await response)?.status).toBe(503);
    expect(remove).toHaveBeenCalledOnce();
  });
  it('uses only the public offline page for a failed navigation',async()=>{
    const {handlers,match}=worker();let response:Promise<Response>|undefined;
    handlers.fetch({request:{url:'https://manito.test/',method:'GET',mode:'navigate',headers:{get:()=>null}},respondWith:(p:Promise<Response>)=>{response=p;}});
    expect((await response)?.status).toBe(503);
    expect(match).toHaveBeenCalledWith('/offline.html');
    expect(match).not.toHaveBeenCalledWith('/');
  });
});
