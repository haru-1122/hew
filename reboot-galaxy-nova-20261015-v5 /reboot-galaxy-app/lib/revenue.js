import express from 'express';
import { installCommunity } from './community.js';
import crypto from 'node:crypto';

export const TERMS = Object.freeze({ version: 'RG-1.0', creator: 80, source: 10, platform: 10,
  scope: '非独占。設定を翻案し、このサイト内で完成作品を公開・販売できます。完成作品1件につき元資料1件。サイト内販売が続く間、購入ごとに分配します。サイト外の公開・販売は今回の許可範囲に含みません。',
  credit: '元資料名・元の設定作者を表示してください。資料自体の再販売は禁止。孫作品への多段階分配はありません。',
  cost: '資料利用の初期費用・最低料金は0円。売れなければ配分は0円。制作時間や道具代は作り手の負担です。',
  demo: '決済費用・税などを反映する前の展示用の計算。実際の請求・送金は行いません。運営分は利益ではありません。' });
export function split(amount, terms = TERMS) {
  const creator = Math.floor(amount * terms.creator / 100);
  const source = Math.floor(amount * terms.source / 100);
  return { creator, source, platform: amount - creator - source };
}
export function installRevenue(app, db, requireLogin, { seedDemo = true, googleEnabled = false, demoAccounts = false } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rg_sources (
      id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL,
      kind TEXT NOT NULL, preview TEXT NOT NULL, terms TEXT NOT NULL, author_consent_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS rg_agreements (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES rg_sources(id), user_id INTEGER NOT NULL REFERENCES users(id),
      owner_id INTEGER NOT NULL REFERENCES users(id), source_title TEXT NOT NULL, terms TEXT NOT NULL,
      agreed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, is_demo INTEGER NOT NULL DEFAULT 1,
      UNIQUE(source_id,user_id));
    CREATE TABLE IF NOT EXISTS rg_works (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES rg_sources(id), creator_id INTEGER NOT NULL REFERENCES users(id),
      agreement_id TEXT NOT NULL REFERENCES rg_agreements(id), title TEXT NOT NULL, description TEXT NOT NULL,
      price INTEGER NOT NULL CHECK(price BETWEEN 1 AND 1000000), is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS rg_sales (
      id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, buyer_id INTEGER NOT NULL REFERENCES users(id),
      work_id TEXT NOT NULL REFERENCES rg_works(id), source_id TEXT NOT NULL REFERENCES rg_sources(id),
      creator_id INTEGER NOT NULL REFERENCES users(id), owner_id INTEGER NOT NULL REFERENCES users(id),
      amount INTEGER NOT NULL, terms TEXT NOT NULL, creator_amount INTEGER NOT NULL, source_amount INTEGER NOT NULL,
      platform_amount INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('completed','refunded')),
      is_demo INTEGER NOT NULL DEFAULT 1 CHECK(is_demo=1), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      refunded_at TEXT, CHECK(creator_amount+source_amount+platform_amount=amount));
    CREATE UNIQUE INDEX IF NOT EXISTS rg_one_active_purchase ON rg_sales(buyer_id,work_id) WHERE status='completed';
  `);
  const id = () => crypto.randomUUID();
  const one = (sql, ...params) => db.prepare(sql).get(...params);
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  const run = (sql, ...params) => db.prepare(sql).run(...params);
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const value=fn(); db.exec('COMMIT'); return value; } catch(e) { db.exec('ROLLBACK'); throw e; } };
  const error = (message, status=400) => { const e=new Error(message); e.status=status; throw e; };
  const agree = (source, user, demo=1) => {
    const old=one('SELECT * FROM rg_agreements WHERE source_id=? AND user_id=?',source.id,user);
    if(old) return old;
    const agreementId=id();
    run('INSERT INTO rg_agreements(id,source_id,user_id,owner_id,source_title,terms,is_demo) VALUES(?,?,?,?,?,?,?)',agreementId,source.id,user,source.owner_id,source.title,source.terms,demo);
    return one('SELECT * FROM rg_agreements WHERE id=?',agreementId);
  };
  /* 展示用の物語。いずれも「元資料ID → 同意記録 → 完成作品ID」でつながるため、
     表紙やタイトルを変えても分配先との関係は固定IDで維持されます。 */
  const DEMO_STORIES = [
    ['demo-source-01','demo-work-01','haru@example.com','sora@example.com','【デモ】夜だけ星座に変わる校舎','世界観','見本：夜の校舎が星座につながる世界。星を案内する生徒と、記憶を探す転校生の設定です。全文・添付ファイルの受取機能は未実装です。','【デモ】星を渡る放課後','SF・ファンタジー／全3話。作品本文の配信は未実装です。',500],
    ['demo-source-02','demo-work-02','ao@example.com','yu@example.com','【デモ】海に沈んだ図書館の司書','世界観','見本：海底の図書館で、失われた本を守る司書たちの物語設定です。全文・添付ファイルの受取機能は未実装です。','【デモ】図書館の底で','海洋ミステリー／全5話。作品本文の配信は未実装です。',600],
    ['demo-source-03','demo-work-03','yu@example.com','mika@example.com','【デモ】記憶を配達する少年','没キャラ','見本：記憶を小さなガラス瓶に入れて配達する少年の人物設定です。全文・添付ファイルの受取機能は未実装です。','【デモ】配達少年アオ','近未来・青春／全2話。作品本文の配信は未実装です。',400],
    ['demo-source-04','demo-work-04','mika@example.com','ren@example.com','【デモ】双子の分岐ルート原稿','分岐ルート','見本：双子の選択によって結末が変わる幻想世界の分岐設定です。全文・添付ファイルの受取機能は未実装です。','【デモ】ふたりの分かれ道','幻想ドラマ／全4話。作品本文の配信は未実装です。',550],
    ['demo-source-05','demo-work-05','ao@example.com','sora@example.com','【デモ】機械仕掛けの祭り 設定資料集','設定資料集','見本：自動人形と歯車が月夜に動き出す祭りの設定資料です。全文・添付ファイルの受取機能は未実装です。','【デモ】祭りが動く夜に','和風スチームパンク／全6話。作品本文の配信は未実装です。',700],
    ['demo-source-06','demo-work-06','ren@example.com','haru@example.com','【デモ】廃線駅の場面原稿','シーン案','見本：終電後だけ現れる列車を待つ、夜の廃線駅の場面設定です。全文・添付ファイルの受取機能は未実装です。','【デモ】駅は眠らない','静かな怪異譚／全1話。作品本文の配信は未実装です。',300],
  ];
  if(seedDemo) transaction(() => {
    for (const [sourceId,workId,ownerEmail,creatorEmail,sourceTitle,kind,preview,title,description,price] of DEMO_STORIES) {
      const owner=one('SELECT id FROM users WHERE email=?',ownerEmail);
      const creator=one('SELECT id FROM users WHERE email=?',creatorEmail);
      if (!owner || !creator) continue;
      run('INSERT OR IGNORE INTO rg_sources(id,owner_id,title,kind,preview,terms,author_consent_at,is_demo) VALUES(?,?,?,?,?,?,?,1)',
        sourceId,owner.id,sourceTitle,kind,preview,JSON.stringify(TERMS),new Date().toISOString());
      const source=one('SELECT * FROM rg_sources WHERE id=?',sourceId);
      const agreement=agree(source,creator.id);
      run('INSERT OR IGNORE INTO rg_works(id,source_id,creator_id,agreement_id,title,description,price) VALUES(?,?,?,?,?,?,?)',
        workId,sourceId,creator.id,agreement.id,title,description,price);
    }
  });
  const router=express.Router();
  const handle=fn=>(req,res,next)=>{try{fn(req,res);}catch(e){ if(e.status) res.status(e.status).json({error:e.message}); else next(e); }};
  const materialSQL='SELECT s.*,u.name AS owner FROM rg_sources s JOIN users u ON u.id=s.owner_id';
  /* 案ごとの見本画像。資料（作品のもと）は未完成のラフ（images/sources）、完成作品は表紙の原画（images/covers）を使います。 */
  const ART = (dir, file, label, genre, stage) => Object.freeze({ image:'images/'+dir+'/'+file+'.jpg', thumb:'images/'+dir+'/'+file+'-thumb.jpg', position:'center', label, genre, stage });
  const DEMO_ART = [
    ['01','01-constellation-school','星座に変わる校舎の案','SF・ファンタジー'],
    ['02','02-sunken-library','海に沈んだ図書館の案','海洋ミステリー'],
    ['03','03-memory-courier','記憶を配達する少年の案','近未来・青春'],
    ['04','04-twin-routes','双子の分岐ルートの案','幻想ドラマ'],
    ['05','05-clockwork-festival','機械仕掛けの祭りの案','和風スチームパンク'],
    ['06','06-midnight-station','廃線駅の場面の案','静かな怪異譚'],
  ];
  const SOURCE_ART = Object.freeze(Object.fromEntries(DEMO_ART.map(([n,f,l,g])=>['demo-source-'+n, ART('sources',f,l,g,'draft')])));
  const FINISHED_ART = Object.freeze(Object.fromEntries(DEMO_ART.map(([n,f,l,g])=>['demo-source-'+n, ART('covers',f,l,g,'finished')])));
  const material = row => ({...row, terms:JSON.parse(row.terms), ownerId:row.owner_id, price:0, description:row.preview,
    quality:row.is_demo?'新方式のデモ資料':'作者同意済み', gradient:'linear-gradient(140deg,#25408a,#0a1236)', proposals:0, daysLeft:null,
    cover:SOURCE_ART[row.id] || null, includes:[],allow:[],deny:['資料自体の再販売'],term:'対象作品のサイト内販売が続く間',status:'open'});
  const worksSQL=`SELECT w.*,s.title AS source_title,u.name AS author,o.name AS source_author,a.owner_id,a.terms
    FROM rg_works w JOIN rg_sources s ON s.id=w.source_id JOIN rg_agreements a ON a.id=w.agreement_id
    JOIN users u ON u.id=w.creator_id JOIN users o ON o.id=a.owner_id`;
  const STORY_ART = Object.freeze(Object.fromEntries(DEMO_ART.map(([n])=>['demo-work-'+n, FINISHED_ART['demo-source-'+n]])));
  /* 見本画像のない利用者の作品は、元資料の完成表紙を受け継ぎます（系譜が見た目でも分かるように）。 */
  const artOfWork = row => STORY_ART[row.id] || FINISHED_ART[row.source_id] || null;
  const work = (row,user) => ({...row, terms:JSON.parse(row.terms), from:row.source_title, episodes:row.description,
    gradient:'linear-gradient(140deg,#2d4a95,#0a1030)', cover:artOfWork(row),
    owned:!!one("SELECT id FROM rg_sales WHERE buyer_id=? AND work_id=? AND status='completed'",user||0,row.id),readable:false,inSubscription:false });
  router.get('/config',(req,res)=>res.json({paymentMode:'record',stripeTestMode:false,googleEnabled,revenueSharing:true,terms:TERMS,edition:'NOVA',demoAccounts:Boolean(demoAccounts)}));
  router.get('/materials',handle((req,res)=>res.json({materials:all(materialSQL+' ORDER BY s.created_at DESC').filter(m=>!req.query.kind||req.query.kind==='all'||m.kind===req.query.kind).map(material)})));
  router.get('/materials/:id',handle((req,res)=>{
    const m=one(materialSQL+' WHERE s.id=?',req.params.id); if(!m) error('資料が見つかりません。',404);
    const a=req.user?one('SELECT * FROM rg_agreements WHERE source_id=? AND user_id=?',m.id,req.user.id):null;
    res.json({material:{...material(m),proposalList:[],agreement:a?{...a,terms:JSON.parse(a.terms)}:null}});
  }));
  router.post('/materials',requireLogin,handle((req,res)=>{
    const {title,description,kind,authorConsent}=req.body;
    if(authorConsent!==true) error('権利の確認と、非独占・収益分配方式への同意が必要です。');
    if(typeof title!=='string'||!title.trim()||title.length>80||typeof description!=='string'||description.trim().length<20||description.length>4000) error('タイトルは1〜80文字、見本の説明は20〜4000文字で入力してください。');
    if(!['没キャラ','世界観','企画案','分岐ルート','設定資料集','シーン案'].includes(kind)) error('資料の種類を選んでください。');
    const sourceId=id();run('INSERT INTO rg_sources(id,owner_id,title,kind,preview,terms,author_consent_at) VALUES(?,?,?,?,?,?,?)',sourceId,req.user.id,title.trim(),kind,description.trim(),JSON.stringify(TERMS),new Date().toISOString());
    res.json({ok:true,id:sourceId,quality:'作者同意済み'});
  }));
  router.post('/materials/:id/agree',requireLogin,handle((req,res)=>{
    const m=one('SELECT * FROM rg_sources WHERE id=?',req.params.id); if(!m) error('資料が見つかりません。',404);
    if(m.owner_id===req.user.id) error('自分の資料には、この利用開始操作は不要です。');
    if(req.body.accept!==true||req.body.version!==JSON.parse(m.terms).version) error('表示した利用条件の版を確認し、同意してください。',409);
    const a=transaction(()=>agree(m,req.user.id));res.json({ok:true,agreement:{...a,terms:JSON.parse(a.terms)},charge:0,delivery:'デモ・全文や添付ファイルの受取機能は未実装'});
  }));
  router.patch('/materials/:id',requireLogin,handle((req,res)=>{
    const m=one('SELECT * FROM rg_sources WHERE id=?',req.params.id);if(!m||m.owner_id!==req.user.id) error('自分の資料のみ変更できます。',403);
    const title=req.body.title;if(typeof title!=='string'||!title.trim()||title.length>80) error('タイトルは1〜80文字で入力してください。');
    run('UPDATE rg_sources SET title=? WHERE id=?',title.trim(),m.id);res.json({ok:true});
  }));
  router.get('/manga',handle((req,res)=>res.json({manga:all(worksSQL+' ORDER BY w.created_at DESC').map(w=>work(w,req.user?.id))})));
  router.post('/works',requireLogin,handle((req,res)=>{
    const {sourceId,title,description,price}=req.body;
    if(typeof title!=='string'||!title.trim()||title.length>80||typeof description!=='string'||description.trim().length<20||description.length>4000) error('作品名は1〜80文字、作品紹介は20〜4000文字で入力してください。');
    if(!Number.isSafeInteger(price)||price<1||price>1000000) error('販売額は1〜1,000,000円の整数です。');
    const a=one('SELECT * FROM rg_agreements WHERE source_id=? AND user_id=?',sourceId,req.user.id);if(!a) error('この資料の利用条件に先に同意してください。',403);
    const workId=id();run('INSERT INTO rg_works(id,source_id,creator_id,agreement_id,title,description,price) VALUES(?,?,?,?,?,?,?)',workId,sourceId,req.user.id,a.id,title.trim(),description.trim(),price);
    res.json({ok:true,id:workId,isDemo:true});
  }));
  router.post('/checkout',requireLogin,handle((req,res)=>{
    if(req.body.type!=='manga') error('資料の購入はありません。利用条件に同意して0円で利用開始してください。');
    const key=req.body.requestKey;if(typeof key!=='string'||!/^[\w-]{16,100}$/.test(key)) error('購入処理の識別子が必要です。');
    const result=transaction(()=>{
      const duplicate=one('SELECT * FROM rg_sales WHERE request_key=?',key);
      if(duplicate){if(duplicate.buyer_id!==req.user.id||duplicate.work_id!==req.body.id) error('購入識別子が別の取引に使われています。',409);return {sale:duplicate,already:true};}
      const w=one(worksSQL+' WHERE w.id=?',req.body.id);if(!w) error('作品が見つかりません。',404);
      if(w.creator_id===req.user.id) error('自分の完成作品は購入できません。');
      const active=one("SELECT * FROM rg_sales WHERE buyer_id=? AND work_id=? AND status='completed'",req.user.id,w.id);if(active)return {sale:active,already:true};
      const portions=split(w.price,JSON.parse(w.terms));const saleId=id();
      run(`INSERT INTO rg_sales(id,request_key,buyer_id,work_id,source_id,creator_id,owner_id,amount,terms,creator_amount,source_amount,platform_amount,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'completed')`,saleId,key,req.user.id,w.id,w.source_id,w.creator_id,w.owner_id,w.price,w.terms,portions.creator,portions.source,portions.platform);
      return {sale:one('SELECT * FROM rg_sales WHERE id=?',saleId),already:false};
    });res.json({ok:true,mode:'record',...result});
  }));
  router.post('/sales/:id/refund',requireLogin,handle((req,res)=>{
    const result=transaction(()=>{
      const sale=one('SELECT * FROM rg_sales WHERE id=?',req.params.id);if(!sale||sale.buyer_id!==req.user.id)error('自分のデモ購入のみ取り消せます。',403);
      run("UPDATE rg_sales SET status='refunded',refunded_at=CURRENT_TIMESTAMP WHERE id=? AND status='completed'",sale.id);
      return one('SELECT * FROM rg_sales WHERE id=?',sale.id);
    });res.json({ok:true,sale:result});
  }));
  router.get('/mypage',requireLogin,handle((req,res)=>{
    const sales=all(`SELECT t.*,w.title,s.title AS source_title FROM rg_sales t JOIN rg_works w ON w.id=t.work_id JOIN rg_sources s ON s.id=t.source_id WHERE t.creator_id=? OR t.owner_id=?`,req.user.id,req.user.id);
    const summarize=role=>{
      const grouped=new Map();for(const s of sales.filter(s=>s[role==='creator'?'creator_id':'owner_id']===req.user.id)){
        const key=s.work_id+':'+s.status;const row=grouped.get(key)||{workId:s.work_id,title:s.title,sourceTitle:s.source_title,status:s.status,count:0,gross:0,allocation:0};
        row.count++; if(s.status==='completed'){row.gross+=s.amount;row.allocation+=s[role==='creator'?'creator_amount':'source_amount'];}grouped.set(key,row);
      }return [...grouped.values()];
    };
    const creatorIncome=summarize('creator'),sourceIncome=summarize('source');
    res.json({user:req.user,creatorIncome,sourceIncome,income:[...creatorIncome,...sourceIncome].reduce((a,r)=>a+r.allocation,0),
      purchases:all(`SELECT t.*,w.title FROM rg_sales t JOIN rg_works w ON w.id=t.work_id WHERE buyer_id=? ORDER BY t.created_at DESC`,req.user.id).map(s=>({...s,type:'manga',mode:'record',date:s.created_at})),
      agreements:all('SELECT a.*,s.title FROM rg_agreements a JOIN rg_sources s ON s.id=a.source_id WHERE a.user_id=?',req.user.id).map(a=>({...a,terms:JSON.parse(a.terms)})),
      subscriptions:[],myMaterials:all(materialSQL+' WHERE s.owner_id=?',req.user.id).map(material),
      legacyCount:one('SELECT COUNT(*) AS n FROM purchases WHERE user_id=? OR seller_id=?',req.user.id,req.user.id).n});
  }));
  router.get('/galaxy',handle((req,res)=>{
    const sources=all(materialSQL),works=all(worksSQL),me=req.user?.id;
    const nodes=[...sources.map(s=>({key:'m'+s.id,type:'material',id:s.id,title:s.title,sub:s.is_demo?'新方式デモ資料':'初期費用0円',person:s.owner,price:0,weight:1,mine:s.owner_id===me,kind:s.kind,thumb:SOURCE_ART[s.id]?.thumb||null})),
      ...works.map(w=>({key:'k'+w.id,type:'manga',id:w.id,title:w.title,sub:'デモ完成作品',person:w.author,price:w.price,weight:1,parent:'m'+w.source_id,mine:w.creator_id===me,kind:artOfWork(w)?.genre||'完成作品',thumb:artOfWork(w)?.thumb||null}))];
    res.json({nodes,links:works.map(w=>({from:'m'+w.source_id,to:'k'+w.id})),totals:{materials:sources.length,manga:works.length,creators:new Set([...sources.map(s=>s.owner_id),...works.map(w=>w.creator_id)]).size}});
  }));
  /* 公開の集計。ログイン画面の「いまの銀河」表示に使います。買い手は特定できない数だけを返します。 */
  router.get('/stats',handle((req,res)=>{
    const n=sql=>one(sql).n;
    const money=one("SELECT COALESCE(SUM(creator_amount),0) AS creator,COALESCE(SUM(source_amount),0) AS source,COUNT(*) AS sales FROM rg_sales WHERE status='completed'");
    res.json({sources:n('SELECT COUNT(*) AS n FROM rg_sources'),works:n('SELECT COUNT(*) AS n FROM rg_works'),
      creators:n('SELECT COUNT(*) AS n FROM (SELECT owner_id AS u FROM rg_sources UNION SELECT creator_id FROM rg_works)'),
      agreements:n('SELECT COUNT(*) AS n FROM rg_agreements'),sales:money.sales,toCreators:money.creator,toSources:money.source,isDemo:true});
  }));
  /* 銀河の最近の動き。購入は作品名だけを出し、だれが買ったかは返しません。 */
  router.get('/activity',handle((req,res)=>{
    const limit=Math.min(Math.max(Number.parseInt(req.query.limit,10)||12,1),40);
    const events=[
      ...all('SELECT s.id,s.title,s.kind,u.name AS person,s.created_at AS at FROM rg_sources s JOIN users u ON u.id=s.owner_id ORDER BY s.created_at DESC LIMIT ?',limit).map(r=>({type:'source',id:r.id,title:r.title,sub:r.kind,person:r.person,at:r.at})),
      ...all('SELECT w.id,w.title,w.price,u.name AS person,w.created_at AS at FROM rg_works w JOIN users u ON u.id=w.creator_id ORDER BY w.created_at DESC LIMIT ?',limit).map(r=>({type:'work',id:r.id,title:r.title,sub:r.price+'円',person:r.person,at:r.at})),
      ...all("SELECT t.work_id AS id,w.title,t.amount,t.created_at AS at FROM rg_sales t JOIN rg_works w ON w.id=t.work_id WHERE t.status='completed' ORDER BY t.created_at DESC LIMIT ?",limit).map(r=>({type:'sale',id:r.id,title:r.title,sub:r.amount+'円',person:null,at:r.at})),
    ].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,limit);
    res.json({events,isDemo:true});
  }));
  // Old purchase/subscription routes must never be reachable, even with live Stripe keys.
  router.all(['/checkout/confirm','/subscriptions','/subscriptions/:plan/cancel','/materials/:id/proposals'],(req,res)=>res.status(410).json({error:'この展示版では提供していません。実請求・月額加入・応募による利用制限はありません。'}));
  app.use('/api',router);
  installCommunity(app,db,requireLogin);
}
