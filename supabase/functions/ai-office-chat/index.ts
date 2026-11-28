// Retired with the AI company feature. This endpoint performs no external calls.
Deno.serve(req => new Response(JSON.stringify({
  message:'AI 비서 회사 기능이 삭제되었습니다.',
}), {
  status:req.method === 'OPTIONS' ? 200 : 410,
  headers:{
    'Content-Type':'application/json',
    'Cache-Control':'no-store',
    'Access-Control-Allow-Origin':'https://younghuni0117-cloud.github.io',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  },
}));
