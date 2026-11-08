const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function familyId(value){return UUID.test(value||'')?value.toLowerCase():null;}
export function familyFromHash(hash){return familyId(new URLSearchParams((hash||'').replace(/^#/, '')).get('family'));}
export function parseFamilyLink(value,base){const text=String(value||'').trim(),code=familyId(text);if(code)return code;try{const expected=new URL(base),url=new URL(text,expected);if(url.origin!==expected.origin||url.pathname!==expected.pathname)throw Error();const id=familyFromHash(url.hash);if(id)return id;}catch{}throw Error('휴대폰 달력의 ‘공유 링크’를 복사해 붙여넣어 주세요.');}
export function resolveFamily(hash,saved,createId){return familyFromHash(hash)||familyId(saved)||familyId(createId());}
