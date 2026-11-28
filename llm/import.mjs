import {cleanText} from './data.mjs';

const maxFile = 12 * 1024 * 1024;
const maxText = 100_000;

async function readDocx(file) {
  const bytes=new Uint8Array(await file.arrayBuffer());
  const view=new DataView(bytes.buffer);
  let footer=bytes.length-22;
  const u16=offset=>view.getUint16(offset,true);
  const u32=offset=>view.getUint32(offset,true);
  while(footer>=Math.max(0,bytes.length-65557)) {
    if(u32(footer)===0x06054b50 && footer+22+u16(footer+20)===bytes.length) break;
    footer--;
  }
  if(footer<Math.max(0,bytes.length-65557)) throw Error('DOCX 압축 목록을 읽을 수 없습니다.');
  let offset=u32(footer+16);
  const count=u16(footer+10);
  const decoder=new TextDecoder();
  for(let index=0;index<count;index++) {
    if(offset+46>footer||u32(offset)!==0x02014b50) break;
    const method=u16(offset+10), flags=u16(offset+8), compressed=u32(offset+20), expanded=u32(offset+24);
    const nameLength=u16(offset+28), local=u32(offset+42);
    const filename=decoder.decode(bytes.subarray(offset+46,offset+46+nameLength));
    if(filename==='word/document.xml') {
      if(flags&1||![0,8].includes(method)||expanded>maxFile||local+30>footer||u32(local)!==0x04034b50) {
        throw Error('이 DOCX의 압축 방식 또는 문서 크기를 지원하지 않습니다.');
      }
      const start=local+30+u16(local+26)+u16(local+28);
      if(start+compressed>footer||(method===0&&compressed!==expanded)) throw Error('DOCX 문서 데이터가 손상되었습니다.');
      let xml;
      const content=bytes.subarray(start,start+compressed);
      if(method===0) xml=decoder.decode(content);
      else {
        const reader=new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        let size=0, text='';
        while(true) {
          const {done,value}=await reader.read();
          if(done) break;
          size+=value.length;
          if(size>expanded) {
            await reader.cancel();
            throw Error('DOCX 문서의 크기 정보가 올바르지 않습니다.');
          }
          text+=decoder.decode(value,{stream:true});
        }
        if(size!==expanded) throw Error('DOCX 문서 데이터가 손상되었습니다.');
        xml=text+decoder.decode();
      }
      const doc=new DOMParser().parseFromString(xml,'application/xml');
      if(doc.querySelector('parsererror')) throw Error('DOCX 문서 XML을 읽을 수 없습니다.');
      const ns=doc.documentElement.namespaceURI;
      return Array.from(doc.getElementsByTagNameNS(ns,'p'), paragraph=>
        Array.from(paragraph.getElementsByTagNameNS(ns,'*'),node=>{
          if(node.localName==='t') return node.textContent;
          if(node.localName==='tab') return '\t';
          if(node.localName==='br'||node.localName==='cr') return '\n';
          return '';
        }).join('')).join('\n');
    }
    offset+=46+nameLength+u16(offset+30)+u16(offset+32);
  }
  throw Error('DOCX에서 본문을 찾을 수 없습니다.');
}

async function readPdf(file) {
  const pdf=await import('../vendor/pdfjs/pdf.min.mjs');
  pdf.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdfjs/pdf.worker.min.mjs',import.meta.url).href;
  const task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),
    cMapUrl:new URL('../vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
    standardFontDataUrl:new URL('../vendor/pdfjs/standard_fonts/',import.meta.url).href,
    useWorkerFetch:true,enableXfa:false,isEvalSupported:false});
  try {
    const document=await task.promise;
    if(document.numPages>100) throw Error('PDF는 한 파일당 100쪽까지 지원합니다.');
    const pages=[];
    let length=0, empty=0;
    for(let i=1;i<=document.numPages;i++) {
      const page=await document.getPage(i);
      const content=await page.getTextContent();
      const text=content.items.map(item=>item.str===undefined?'':item.str+(item.hasEOL?'\n':' ')).join('').trim();
      if(!text) empty++;
      pages.push(text);
      length+=text.length;
      if(length>maxText*2) throw Error('PDF에서 추출한 텍스트가 10만 자 한도를 넘습니다.');
      page.cleanup();
    }
    if(empty===document.numPages) throw Error('PDF에서 텍스트를 찾지 못했습니다. 스캔본은 OCR 후 다시 추가해 주세요.');
    return {text:pages.join('\n'),warning:'PDF 추출 결과의 줄 순서와 문자를 미리 보기에서 확인하세요.'+
      (empty ? ' 텍스트가 없는 '+empty+'쪽을 건너뛰었습니다.' : '')};
  } finally { await task.destroy(); }
}

export async function readDocument(file) {
  if(file.size>maxFile) throw Error('파일은 12 MB 이하만 추가할 수 있습니다.');
  const ext=file.name.split('.').pop().toLowerCase();
  let result;
  if(ext==='txt') {
    const bytes=new Uint8Array(await file.arrayBuffer());
    let text;
    const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
    try { text=new TextDecoder(encoding,{fatal:true}).decode(bytes); }
    catch { text=new TextDecoder('euc-kr',{fatal:true}).decode(bytes); }
    result={text};
  } else if(ext==='docx') result={text:await readDocx(file)};
  else if(ext==='pdf') result=await readPdf(file);
  else throw Error('TXT, DOCX 또는 텍스트가 포함된 PDF를 선택하세요.');
  return {...result,text:validateText(result.text)};
}

export function validateText(raw) {
  const text=cleanText(raw), size=[...text].length;
  if(size<2) throw Error('추출한 본문이 비어 있거나 너무 짧습니다.');
  if(size>maxText) throw Error('문서는 10만 자 이하로 추가할 수 있습니다.');
  return text;
}
