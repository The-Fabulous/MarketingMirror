import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, translate, transcribe } from '../server.mjs';
const config = { GEMINI_API_KEY: 'test-key' };
test('translation uses Gemma, preserves user input and excludes thinking', async () => {
  const result = await translate({text:'Привет'}, config, async (url, options) => {
    assert.match(url, /gemma-4-26b-a4b-it:generateContent$/);
    assert.equal(JSON.parse(options.body).contents[0].parts[0].text, 'Привет');
    assert.equal(options.headers['x-goog-api-key'], 'test-key');
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private'},{text:'Hello'}]}}]});
  });
  assert.equal(result.text, 'Hello');
});
test('rejects missing key, empty and oversized text before calling AI', async () => {
  await assert.rejects(translate({text:'Hello'}, {}), /GEMINI_API_KEY/);
  await assert.rejects(translate({text:' '}), /Введите/);
  await assert.rejects(translate({text:'a'.repeat(12001)}), /12 000/);
});
test('rejects truncated response and handles quota errors', async () => {
  await assert.rejects(translate({text:'Hi'}, config, async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'partial'}]}}]})), /полный перевод/);
  await assert.rejects(translate({text:'Hi'}, config, async()=>new Response('',{status:429})), /Лимит/);
});
test('video transcription uses original language prompt and rejects silence', async () => {
  const input = {mimeType:'video/mp4',data:'AAAA'};
  const result = await transcribe(input, config, async(url,options) => {
    assert.match(url,/interactions$/); const body=JSON.parse(options.body);
    assert.equal(body.store,false); assert.equal(body.input[1].mime_type,'video/mp4');
    return Response.json({steps:[{content:[{type:'text',text:'Привет мир'}]}]});
  });
  assert.equal(result.text,'Привет мир');
  await assert.rejects(transcribe(input,config,async()=>Response.json({output_text:'[NO_SPEECH]'})),/распознать/);
  await assert.rejects(transcribe({mimeType:'text/html',data:'AAAA'}),/MP4/);
});
test('HTTP serves UI, protects secrets and returns structured errors', async () => {
  const server=createServer({}); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(url);
    assert.equal(page.status,200);
    const html = await page.text();
    // Resolve the actual page references, so moving the entry point cannot break its assets silently.
    for (const match of html.matchAll(/(?:src|href)="([^"\s]+\.(?:css|js))"/g)) {
      const asset = await fetch(new URL(match[1], `${url}/`));
      assert.equal(asset.status,200,`Missing asset: ${match[1]}`);
      assert.ok((await asset.text()).length > 0);
    }
    assert.equal((await fetch(`${url}/.env`)).status,404);
    assert.deepEqual(await (await fetch(`${url}/api/status`)).json(),{configured:false});
    const invalid=await fetch(`${url}/api/translate`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
    assert.equal(invalid.status,400);
    const cross=await fetch(`${url}/api/translate`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.test'},body:'{}'});
    assert.equal(cross.status,403);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
