// AUTH: actual Chromium -> HTTP Connection -> Typert Gateway -> native AgentPresets.
// Test index HTML is the only synthetic surface; no private values go to logs.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { apply as applyConnection, inject as connectionInject } from '@deepseek-ai/dsh-client-connection'
import { ContextManagerPresetAuthoring, ContextManagerRemoteService } from '../../lib/index.js'
import { TYPERT } from '../../lib/typert.host.js'

const native = await import('@deepseek-ai/dsh-agent-presets')
const AgentPresets = native.default ?? native.AgentPresets
const Loader = (await import('@deepseek-ai/cordis-plugin-loader')).default
const gm = await import('@deepseek-ai/dsh-api-gateway')
const Gateway = gm.default ?? gm.TypertGatewayService
const tm = await import('@deepseek-ai/dsh-typert-registry')
const Registry = tm.default ?? tm.TypertRegistry
const wm = await import('@deepseek-ai/dsh-host-webserver')
const WebServer = wm.default ?? wm.WebServer
const require = createRequire(pathToFileURL(join(process.cwd(),'tests/m7d/runner/package.json')))
const { chromium } = require('playwright')
const secret=randomUUID().replaceAll('-','')
const composition='[]\n# '+secret+'\n'
const rpcPath='/api/contextManager/readPreset'
const envelope=JSON.stringify({type:'client-request',rpcId:'m8c-auth-1',
  method:'contextManager/readPreset',payload:{args:{id:'source'}}})
const html=[
  '<!doctype html><html><title>M8C AUTH</title>',
  '<button id="view">View composition</button><div id="done"></div><script>',
  "document.getElementById('view').addEventListener('click',async()=>{",
  "const r=await fetch('/api/contextManager/readPreset',{method:'POST',credentials:'same-origin',",
  "headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'m8c-auth-1',",
  "method:'contextManager/readPreset',payload:{args:{id:'source'}}})});",
  "window.__authResult={status:r.status,body:await r.json()};",
  "document.getElementById('done').textContent='complete';});",
  '</script></html>',
].join('')
function receivedNative(body) {
  const x=body?.result
  return x?.ok===true && x?.value?.ok===true
    && x?.value?.value?.id==='source'
    && x?.value?.value?.content===composition
}
async function rawRpc(port,options={}) {
  return new Promise((resolve,reject)=>{
    const req=httpRequest({
      hostname:'127.0.0.1',port,method:'POST',
      path:rpcPath+(options.query??''),
      headers:{
        host:options.host??'127.0.0.1:'+String(port),
        'content-type':'application/json','content-length':Buffer.byteLength(envelope),
        ...(options.cookie===undefined?{}:{cookie:options.cookie}),
        ...(options.origin===undefined?{}:{origin:options.origin}),
      }
    },res=>{
      const chunks=[]
      res.on('data',c=>chunks.push(c))
      res.on('end',()=>resolve({
        status:res.statusCode??0,body:Buffer.concat(chunks).toString('utf8')
      }))
    })
    req.once('error',reject)
    req.end(envelope)
  })
}
async function main(){
  const root=await mkdtemp(join(tmpdir(),'m8c-auth-'))
  const systemRoot=join(root,'system'),userRoot=join(root,'user')
  const ctx=new Context()
  ctx.baseUrl=pathToFileURL(process.cwd()+'/').href
  const fibers=[]
  let disposeContribution,removeIndex,browser
  const mount=async(plugin,config)=>{
    const fiber=ctx.plugin(plugin,config)
    await fiber
    fibers.push(fiber)
  }
  try{
    assert.equal(typeof AgentPresets,'function')
    assert.equal(typeof Loader,'function')
    assert.equal(typeof Registry,'function')
    assert.equal(typeof Gateway,'function')
    assert.equal(typeof WebServer,'function')
    await mkdir(join(systemRoot,'source'),{recursive:true})
    await mkdir(userRoot,{recursive:true})
    await writeFile(join(systemRoot,'source',native.COMPOSITION_FILE),composition)
    // Isolated credential storage; real DSH Connection signs and validates Cookies.
    const records=new Map()
    ctx.provide('credentials',{
      async modifyRecord(key,mutate){
        const next=await mutate(records.get(key))
        if(next!==undefined)records.set(key,next)
        return next??records.get(key)
      }
    })
    await mount(Loader)
    const modern='agentPresetProjectionDefinition' in native
    if(modern){
      const pm=await import('@deepseek-ai/dsh-session-projection')
      await mount(pm.SessionProjectionRegistry)
    }
    await mount(AgentPresets,{
      default:'source',
      roots:[{path:systemRoot,trust:'system'},{path:userRoot,trust:'user'}],
      includeUserRoot:false,...(modern?{includeShippedRoot:false}:{})
    })
    await mount(ContextManagerPresetAuthoring)
    await mount(ContextManagerRemoteService)
    await mount(Registry)
    await mount(WebServer,{host:'127.0.0.1',port:0})
    await mount({inject:[...connectionInject],apply:applyConnection})
    await mount(Gateway)
    disposeContribution=ctx.typert.register(TYPERT)
    // Equivalent to frontend-static's root request delegation, not a mocked admission.
    removeIndex=ctx.webServer.register({kind:'exact',path:'/',handler:(req,res)=>{
      if(!ctx.connection.authorizeIndex(req,res))return
      res.writeHead(200,{'content-type':'text/html; charset=utf-8'})
      res.end(html)
    }})
    const port=ctx.webServer.port
    assert.ok(Number.isInteger(port)&&port>0)
    const origin='http://127.0.0.1:'+String(port)
    const url=ctx.connection.authenticatedUrl(origin)
    const token=new URL(url).searchParams.get('token')
    assert.ok(typeof token==='string'&&token.length>30)

    for(const [id,options,expected] of [
      ['missing-cookie',{},401],
      ['api-query-token',{query:'?token='+encodeURIComponent(token)},401],
      ['bad-cookie',{cookie:'dsh_auth=wrong'},401],
      ['host-rebinding',{host:'attacker.example'},403],
      ['cross-origin',{origin:'https://attacker.example'},403],
    ]){
      const actual=await rawRpc(port,options)
      assert.equal(actual.status,expected,id)
      assert.equal(actual.body.includes(secret),false,'denial must not expose body')
      console.log('M8C_AUTH_ASSERT '+JSON.stringify({id,passed:true,status:expected}))
    }

    browser=await chromium.launch({headless:true})
    const context=await browser.newContext()
    const page=await context.newPage()
    const navigated=await page.goto(url,{waitUntil:'domcontentloaded'})
    assert.equal(navigated?.status(),200)
    assert.equal(page.url(),origin+'/','token must leave URL after exchange')
    const cookies=await context.cookies(origin)
    assert.ok(cookies.length>0)
    await page.locator('#view').click()
    await page.locator('#done').getByText('complete').waitFor()
    const result=await page.evaluate(()=>window.__authResult)
    assert.equal(result?.status,200)
    assert.equal(receivedNative(result?.body),true,
      'Browser must receive exact composition from actual native AgentPresets')
    console.log('M8C_AUTH_ASSERT '+JSON.stringify({id:'owner-browser-positive',passed:true,status:200}))

    const cookie=cookies.map(x=>x.name+'='+x.value).join('; ')
    const replay=await rawRpc(port,{host:'localhost:'+String(port),cookie})
    assert.equal(replay.status,401,'Cookie must bind original browser authority')
    assert.equal(replay.body.includes(secret),false)
    console.log('M8C_AUTH_ASSERT '+JSON.stringify({id:'wrong-authority-replay',passed:true,status:401}))
    await context.close()
    console.log('M8C_AUTH_INTEGRATED_PASS '+JSON.stringify({
      carrier:'real Chromium > HTTP > Connection > Typert > Context Manager > AgentPresets',
      allowed:1,denied:6,privateTextLogged:false
    }))
  }finally{
    await browser?.close()
    await removeIndex?.()
    await disposeContribution?.()
    for(const fiber of fibers.reverse())await fiber.dispose()
    await rm(root,{recursive:true,force:true})
  }
}
await main().catch(error=>{
  const raw=error instanceof Error?error.message:String(error)
  const safe=raw.replace(/([?&]token=)[^\s"'<>]+/gu,'$1[redacted]')
    .replaceAll(secret,'[redacted]').slice(0,700)
  console.error('M8C_AUTH_FAIL '+JSON.stringify({name:error?.name??'Error',reason:safe}))
  process.exitCode=1
})
