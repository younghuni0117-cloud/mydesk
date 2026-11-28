export const CATEGORIES=[
 ['profile','기본정보',[['title','이름'],['email','이메일'],['phone','연락처'],['region','희망 근무지역'],['details','전문 분야·요약','long']]],
 ['education','학력',[['title','학교명'],['major','전공·학위'],['start','입학일'],['end','졸업일'],['details','주요 연구·비고','long']]],
 ['career','경력',[['title','회사명'],['department','부서'],['position','직무·직급'],['start','입사일'],['end','퇴사일·재직 중'],['details','담당 업무·성과','long'],['tools','사용 도구']]],
 ['projects','프로젝트',[['title','프로젝트명'],['organization','소속·고객사'],['role','담당 역할'],['start','시작일'],['end','종료일'],['details','문제·수행 내용·검증된 성과','long'],['tools','해석·개발 도구']]],
 ['papers','논문',[['title','논문명'],['authors','저자·기여'],['journal','학술지·학회'],['date','발표·게재일'],['link','DOI·원문 URL'],['details','연구 내용·성과','long']]],
 ['patents','특허',[['title','발명 명칭'],['number','출원·등록번호'],['inventors','발명자·기여'],['date','출원·등록일'],['stage','출원·등록 상태'],['details','핵심 기술·기여','long']]],
 ['certificates','자격·교육',[['title','자격·교육명'],['organization','발급·교육 기관'],['date','취득·수료일'],['expires','유효기간'],['details','내용·비고','long']]],
 ['languages','어학',[['title','언어·시험명'],['score','등급·점수'],['date','응시일'],['expires','유효기간'],['details','비고','long']]],
 ['essays','자기소개서',[['title','항목 제목'],['company','지원 기업·직무'],['question','질문','long'],['details','작성 문장','long'],['evidence','근거 경력·프로젝트','long']]],
 ['preferences','지원 기준',[['title','기준명'],['details','희망 직무·산업·조건','long'],['tools','관련 도구·키워드']]],
 ['archive','기존 자료',[['title','자료 제목'],['details','원본 정리 내용','long']]]
].map(([id,label,fields])=>({id,label,fields}));
export const emptyDocument=()=>({version:1,sections:Object.fromEntries(CATEGORIES.map(c=>[c.id,[]]))});
export function validDocument(doc){return !!doc&&doc.version===1&&doc.sections&&CATEGORIES.every(c=>Array.isArray(doc.sections[c.id])&&doc.sections[c.id].length<=200&&doc.sections[c.id].every(item=>typeof item.id==='string'&&/^[-a-zA-Z0-9_]{1,100}$/.test(item.id)&&item.fields&&Object.values(item.fields).every(v=>typeof v==='string'&&v.length<=20000)))&&new TextEncoder().encode(JSON.stringify(doc)).length<=500000;}
export function categoryFor(title){if(/자기소개|자소서|작성.*문장|초안/.test(title))return 'essays';if(/학력/.test(title))return 'education';if(/논문|학술|발표/.test(title))return 'papers';if(/특허/.test(title))return 'patents';if(/프로젝트|연구.*실적/.test(title))return 'projects';if(/경력|직장/.test(title))return 'career';if(/어학|영어|TOEIC/.test(title))return 'languages';if(/자격|교육|훈련/.test(title))return 'certificates';if(/지원|매칭|희망/.test(title))return 'preferences';if(/기본.*정보|인적/.test(title))return 'profile';return 'archive';}
export function importBlocks(blocks){const doc=emptyDocument();blocks.forEach(({title,details},i)=>{if(!details.trim())return;doc.sections[categoryFor(title)].push({id:'import-'+i,fields:{title:title.slice(0,200),details:details.slice(0,20000),status:'원문 확인 필요',source:'기존 비공개 이력서'}});});return doc;}
export function saveItem(doc,category,item){const next=structuredClone(doc),items=next.sections[category];if(!items)throw Error('항목을 확인해 주세요.');const index=items.findIndex(r=>r.id===item.id);if(index<0)items.push(structuredClone(item));else items[index]=structuredClone(item);if(!validDocument(next))throw Error('입력 내용이나 용량을 확인해 주세요.');return next;}
export function removeItem(doc,category,id){const next=structuredClone(doc);next.sections[category]=next.sections[category].filter(r=>r.id!==id);return next;}
export function resumeText(doc){return CATEGORIES.map(c=>c.label+'\n'+doc.sections[c.id].map(item=>Object.entries(item.fields).filter(([,v])=>v).map(([k,v])=>(c.fields.find(f=>f[0]===k)?.[1]??({source:'출처',status:'확인 상태'}[k]??k))+': '+v).join('\n')).join('\n\n')).join('\n\n');}
