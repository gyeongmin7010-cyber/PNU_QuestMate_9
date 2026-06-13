const https = require('https');
const zlib = require('zlib');

const SOURCES = {
  meals: 'https://m.pusan.ac.kr/ko/meals',
  seats: 'https://m.pusan.ac.kr/ko/seat',
  notices: 'https://m.pusan.ac.kr/ko/notice/cover/list/1?current=notice',
  academic: 'https://m.pusan.ac.kr/ko/notice/cover/list/1?current=haksa'
};

const headers = {
  'content-type':'application/json; charset=utf-8',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type',
  'cache-control':'no-store'
};

const GUIDE = {
  meals: [
    {title:'금정회관 학생식당', meta:'식단 확인 후보'},
    {title:'학생회관 학생식당', meta:'식단 확인 후보'},
    {title:'문창회관·샛벌회관 식당', meta:'식단 확인 후보'}
  ],
  seats: [
    {title:'새벽벌도서관 학습공간 확인', meta:'학습형 3시간 퀘스트 추천 장소'},
    {title:'미리내열람실 좌석현황 확인', meta:'조용한 학습공간 후보'},
    {title:'좌석 많은 공간 우선 추천', meta:'혼잡도 기반 추천'}
  ],
  notices: [
    {title:'장학·비교과 공지 확인', meta:'공지 요약 미션'},
    {title:'이번 주 마감 공지 정리', meta:'마감일 확인 미션'},
    {title:'학생지원 공지 확인', meta:'대상자·신청방법 확인'}
  ],
  academic: [
    {title:'기말고사·성적열람 일정 확인', meta:'학사일정 기반 학습계획'},
    {title:'수강신청·휴복학 일정 확인', meta:'다음 학기 준비'},
    {title:'계절수업·등록금 일정 확인', meta:'학사 행정 체크'}
  ]
};

function httpGet(url, timeoutMs=6500){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{
      timeout:timeoutMs,
      headers:{
        'user-agent':'Mozilla/5.0 (PNU QuestMate V10)',
        'accept':'text/html,*/*',
        'accept-language':'ko-KR,ko;q=0.9',
        'accept-encoding':'gzip,deflate,br'
      }
    },res=>{
      const chunks=[];
      res.on('data',d=>chunks.push(d));
      res.on('end',()=>{
        const buf=Buffer.concat(chunks);
        const enc=String(res.headers['content-encoding']||'').toLowerCase();
        const done=(err,out)=>err?reject(err):resolve({status:res.statusCode,text:out.toString('utf8')});
        if(enc.includes('gzip')) zlib.gunzip(buf,done);
        else if(enc.includes('deflate')) zlib.inflate(buf,done);
        else if(enc.includes('br')) zlib.brotliDecompress(buf,done);
        else done(null,buf);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('timeout')));
    req.on('error',reject);
  });
}
function decode(s){return String(s||'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#039;|&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function strip(html){return decode(String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(li|tr|p|div|a|span|h\d)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/[ \t\r]+/g,' ').replace(/\n{2,}/g,'\n')).trim();}
function clean(s){return String(s||'').replace(/\s+/g,' ').trim();}
function junk(s){
  const x=clean(s);
  if(x.length<4 || x.length>70) return true;
  if(/등록된 식단이 없습니다|부산광역시|취업전략과|개인정보|저작권|COPYRIGHT|로그인|전체메뉴|처음|끝|바로가기|TEL|FAX|HTTP|PUSAN/i.test(x)) return true;
  return false;
}
function add(arr,title,meta){
  const t=clean(title);
  if(junk(t)) return;
  if(!arr.some(x=>x.title===t)) arr.push({title:t,meta});
}
function mealItems(text){
  const arr=[];
  const known=['금정회관 학생식당','금정회관 교직원 식당','학생회관 학생식당','학생회관 교직원 식당','문창회관','샛벌회관'];
  known.forEach(k=>{ if(text.includes(k) || text.includes(k.replace(/\s/g,''))) add(arr,k,'부산대 식단 안내 대상 식당'); });
  String(text).split(/\n/).map(clean).forEach(l=>{
    if(arr.length>=7) return;
    if(/(조식|중식|석식|백반|정식|덮밥|국밥|카레|돈까스|찌개|라면|비빔|메뉴)/.test(l)) add(arr,l,'오늘 식단 후보');
  });
  return arr.length?arr:GUIDE.meals;
}
function seatItems(text){
  const arr=[];
  String(text).split(/\n/).map(clean).forEach(l=>{
    if(arr.length>=7) return;
    if(/(새벽벌|미리내|열람실|도서관|좌석|잔여|나노생명)/.test(l)) add(arr,l,'학습공간 정보');
  });
  return arr.length?arr:GUIDE.seats;
}
function noticeItems(text){
  const arr=[];
  String(text).split(/\n/).map(clean).forEach(l=>{
    if(arr.length>=7) return;
    if(/(공지|신청|모집|장학|비교과|학생|프로그램|마감|안내|교육)/.test(l)) add(arr,l,'공지사항');
  });
  return arr.length?arr:GUIDE.notices;
}
function academicItems(text){
  const arr=[];
  const re=/([^\n]{2,60}?)\s+(20\d{2}\.\d{2}\.\d{2})\s*-\s*(20\d{2}\.\d{2}\.\d{2})/g;
  let m;
  while((m=re.exec(text)) && arr.length<7){
    const title=clean(m[1]).replace(/^\d+\s*/,'');
    if(/(수업|성적|휴학|복학|등록금|기말|고사|계절|수강|정정|희망과목|졸업|개강|종강)/.test(title)) add(arr,title,`${m[2]} ~ ${m[3]}`);
  }
  return arr.length?arr:GUIDE.academic;
}
async function get(kind,url){
  try{
    const r=await httpGet(url);
    const text=strip(r.text);
    let data=GUIDE[kind];
    if(kind==='meals') data=mealItems(text);
    if(kind==='seats') data=seatItems(text);
    if(kind==='notices') data=noticeItems(text);
    if(kind==='academic') data=academicItems(text);
    return {ok:true,data};
  }catch(e){
    return {ok:false,data:GUIDE[kind]};
  }
}
function json(body){return {statusCode:200,headers,body:JSON.stringify(body)};}
exports.handler=async(event)=>{
  if(event && event.httpMethod==='OPTIONS') return {statusCode:204,headers,body:''};
  const entries=await Promise.all(Object.entries(SOURCES).map(async([k,u])=>[k,await get(k,u)]));
  const res=Object.fromEntries(entries);
  const ok=Object.values(res).filter(x=>x.ok).length;
  return json({
    version:'v10-semester100',
    mode:ok>=2?'live':'guided',
    fetchedAt:new Date().toISOString(),
    meals:res.meals.data,
    seats:res.seats.data,
    notices:res.notices.data,
    academic:res.academic.data
  });
};