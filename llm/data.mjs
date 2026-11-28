export const samples = [
  ['일상 문장', '아침에 창문을 열었다. 바람이 방 안으로 들어왔다. 나는 물을 마시고 책을 읽었다. 오후에는 공원에서 친구를 만났다. 저녁에는 가족과 밥을 먹었다. 비가 와서 우산을 들었다.'],
  ['간단한 대화', '안녕, 오늘 어디에 가니? 나는 학교에 가. 학교가 끝나면 뭐 할 거야? 도서관에서 책을 읽을 거야. 같이 가도 될까? 물론이야, 정문에서 만나자.'],
  ['짧은 이야기', '작은 고양이가 길을 걸었다. 사과나무 밑에서 새를 보았다. 새는 고양이에게 말을 걸었다. 둘은 나무 옆에서 비를 피했다. 날이 개자 함께 집으로 갔다. 그날부터 둘은 친구가 되었다.'],
  ['기초 과학', '물은 추우면 얼음이 된다. 얼음은 따뜻해지면 녹는다. 식물은 빛을 받아 자란다. 달은 지구 둘레를 돈다. 소리는 공기를 통해 전해진다. 자석은 철을 끌어당긴다.'],
  ['기본 질문과 답변', '질문: 하늘은 무슨 색인가요? 답: 맑은 날에는 파란색이에요. 질문: 사과는 어디에서 자라나요? 답: 사과나무에서 자라요. 질문: 비가 오면 무엇을 쓰나요? 답: 우산을 써요.'],
  ['문장 구조', '나는 학교에 간다. 너는 공원에 간다. 우리는 집에 간다. 아이가 물을 마신다. 친구가 책을 읽는다. 가족이 밥을 먹는다. 작은 새가 하늘을 난다. 어제는 집에서 쉬었다.']
].map(([name,text],index)=>({id:'sample-'+index,name,text}));

export const fixedEvaluation = [
  '친구는 우산을 들고 학교에 간다.',
  '작은 새는 비가 그치자 나무 위로 날아갔다.',
  '따뜻한 방에서 얼음이 천천히 녹았다.'
];

export function cleanText(text) {
  return text.normalize('NFC').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').replace(/[^\S\n]+/g,' ').trim();
}

export function makeDataset(documents, vocabulary, previous=[]) {
  if (documents.length>30 || documents.reduce((sum,doc)=>sum+[...doc.text].length,0)>150_000) {
    throw Error('데이터셋은 문서 30개, 전체 15만 자까지 사용할 수 있습니다.');
  }
  if (!documents.length) throw Error('학습 문서를 하나 이상 선택해 주세요.');
  const unique=new Set(), partitions=new Map(previous);
  for (const {text} of documents) {
    const entries=cleanText(text).split(/(?<=[.!?。！？])\s+|\n+/u).filter(line=>[...line].length>=2);
    for(const entry of entries) if(!fixedEvaluation.includes(entry)) unique.add(entry);
  }
  if(!unique.size) throw Error('고정 평가 문장과 구분되는 학습 텍스트를 추가해 주세요.');
  const train=[], validation=[], added=[];
  for(const entry of unique) {
    const old=partitions.get(entry);
    if(old?.split) {
      train.push(old.split[0]);
      validation.push(old.split[1]);
    } else if(old?.validation) validation.push(entry);
    else if(old) train.push(entry);
    else added.push(entry);
  }
  if(unique.size===1 && added.length===1) {
    const entry=added[0], chars=[...entry];
    if(chars.length<12) throw Error('학습과 검증을 나누려면 12자 이상의 텍스트가 필요합니다.');
    const cut=Math.floor(chars.length*.8);
    const split=[chars.slice(0,cut).join(''), chars.slice(cut).join('')];
    partitions.set(entry,{split});
    train.push(split[0]);
    validation.push(split[1]);
  } else {
    const separate=(text,heldOut)=>{
      partitions.set(text,{validation:heldOut});
      (heldOut ? validation : train).push(text);
    };
    for(let i=0;i<added.length;i++) {
      const last=i===added.length-1;
      const heldOut=train.length>0 && ((last&&!validation.length)||(!last&&i%5===4));
      separate(added[i],heldOut);
    }
  }
  if(previous.length && added.length) {
    return makeDataset(documents,vocabulary,[...partitions]);
  }
  if(!train.length||!validation.length) {
    throw Error('기존 문장의 학습·검증 구분을 유지할 수 있도록 문서를 더 추가하거나 새 모델을 만드세요.');
  }
  const chars=new Set(train.flatMap(text=>[...text]));
  const symbols = vocabulary ?? ['<BOS>','<UNK>',...[...chars].sort()];
  const tokenizer = new CharacterTokenizer(symbols);
  if (vocabulary) {
    const unknown = [...chars].filter(char=>!tokenizer.ids.has(char));
    if (unknown.length) throw Error('기존 어휘에 없는 학습 문자 '+unknown.slice(0,12).join(' ')+'. 새 모델을 만들어 어휘를 구성하세요.');
  }
  if (symbols.length > 768) throw Error('모바일 모델의 어휘 한도(768개)를 넘었습니다. 문서 범위를 줄여 주세요.');
  const encode = lines=>lines.map(text=>[0,...tokenizer.encode(text)]);
  const training = encode(train), validating = encode(validation);
  const tokenCount = set=>set.reduce((sum,ids)=>sum+ids.length-1,0);
  const fixed = encode(fixedEvaluation);
  return {tokenizer, training, validating, fixed, partitions:[...partitions],
    stats:{documents:documents.length, characters:documents.reduce((sum,doc)=>sum+[...cleanText(doc.text)].length,0),
      train:tokenCount(training), validation:tokenCount(validating), fixed:tokenCount(fixed), vocabulary:symbols.length,
      validationUnknowns:validating.reduce((sum,ids)=>sum+ids.filter(id=>id===1).length,0),
      fixedUnknowns:fixed.reduce((sum,ids)=>sum+ids.filter(id=>id===1).length,0)}};
}

// The engine depends only on encode, decode and the stored vocabulary contract.
export class CharacterTokenizer {
  constructor(vocabulary) {
    this.vocabulary = vocabulary;
    this.ids = new Map(vocabulary.map((char,id)=>[char,id]));
  }
  encode(text) { return Array.from(text.normalize('NFC'),char=>this.ids.get(char) ?? 1); }
  decode(ids) { return Array.from(ids,id=>id===0?'':id===1?'�':this.vocabulary[id]).join(''); }
}
