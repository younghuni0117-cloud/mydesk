// A strict allowlist is used both when displaying and saving rich text.
const tags=new Set('a p br hr div span section article nav strong b em i u s h2 h3 h4 h5 h6 ul ol li dl dt dd blockquote pre code table caption thead tbody tfoot tr th td details summary figure figcaption svg g path rect line polyline polygon circle ellipse text tspan defs marker'.split(' '));
const attrs=new Set('class id title role aria-label aria-labelledby aria-hidden scope colspan rowspan open data-label viewbox width height x y x1 x2 y1 y2 cx cy r rx ry d points fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray opacity fill-opacity stroke-opacity transform text-anchor font-size font-weight marker-end refx refy markerwidth markerheight orient'.split(' '));
const drop=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','TEMPLATE','FORM','INPUT','BUTTON','TEXTAREA','SELECT','LINK','META','BASE','FOREIGNOBJECT','USE','IMAGE','ANIMATE','SET']);
export function safeURL(value){try{const u=new URL(value,location.href);return ['http:','https:','mailto:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export function sanitizeHTML(html){
 const doc=new DOMParser().parseFromString(String(html),'text/html');
 for(const el of [...doc.body.querySelectorAll('*')]){
  if(drop.has(el.tagName.toUpperCase())){el.remove();continue;}
  if(!tags.has(el.localName.toLowerCase())){el.replaceWith(...el.childNodes);continue;}
  for(const a of [...el.attributes]){
   const name=a.name.toLowerCase();
   if(name==='id'&&(!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(a.value)||/^(blog|post|manage|editor|main|sidebar|menu)-/.test(a.value))){el.removeAttribute(a.name);}
   else if(name==='href'&&el.localName==='a'){
    if(a.value.startsWith('#')&&/^#[a-zA-Z0-9_-]+$/.test(a.value))continue;
    const url=safeURL(a.value);if(url)el.setAttribute('href',url);else el.removeAttribute(a.name);
   }else if(!attrs.has(name)||/url\s*\(/i.test(a.value))el.removeAttribute(a.name);
  }
  if(el.localName==='a'&&el.hasAttribute('href')&&!el.getAttribute('href').startsWith('#')&&new URL(el.getAttribute('href'),location.href).origin!==location.origin){el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}
 }
 return doc.body.innerHTML;
}
export function textHTML(value){const el=document.createElement('span');el.textContent=value;return el.innerHTML;}
export function displayDate(value){return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(value));}
