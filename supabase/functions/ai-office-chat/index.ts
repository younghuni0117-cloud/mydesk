// Retired endpoint. MyDesk now uses manually copied ChatGPT consultations.
Deno.serve(req => new Response(JSON.stringify({
  ready:false,
  mode:'manual-chatgpt',
  message:'ChatGPT 직접 상담 방식입니다. MyDesk에서 상담문을 복사해 ChatGPT에서 상담해 주세요.',
}), {
  status:req.method === 'POST' ? 410 : 200,
  headers:{
    'Content-Type':'application/json',
    'Cache-Control':'no-store',
    'Access-Control-Allow-Origin':'https://younghuni0117-cloud.github.io',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  },
}));
