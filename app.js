/* ВЭФ 2025 — Инвентарь (PWA) */
(() => {
  'use strict';
  const APP_VERSION = '1.4.0';

  const idb = { _db:null,
    open(){ return new Promise((res,rej)=>{ const r=indexedDB.open('vef2025-db',6);
      r.onupgradeneeded=e=>{const db=e.target.result;
        if(!db.objectStoreNames.contains('rows')) db.createObjectStore('rows',{keyPath:'id'});
        if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'key'});
      };
      r.onsuccess=()=>{idb._db=r.result; res();}; r.onerror=()=>rej(r.error);
    });},
    put(s,v){return new Promise((res,rej)=>{const tx=idb._db.transaction(s,'readwrite');tx.objectStore(s).put(v);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});},
    getAll(s){return new Promise((res,rej)=>{const tx=idb._db.transaction(s,'readonly');const rq=tx.objectStore(s).getAll();rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error);});},
    get(s,k){return new Promise((res,rej)=>{const tx=idb._db.transaction(s,'readonly');const rq=tx.objectStore(s).get(k);rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error);});},
    clear(s){return new Promise((res,rej)=>{const tx=idb._db.transaction(s,'readwrite');tx.objectStore(s).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  };

  let HEADERS=[], OBJECT_COL=null, ROWS=[];
  const $ = s=>document.querySelector(s);
  const objectsEl=$('#objects');
  const searchEl=$('#search');
  const objectDetail=$('#object-detail'); const objectTitle=$('#object-title'); const objectItems=$('#object-items');
  const btnBackToTiles=$('#btn-back-to-tiles'); const btnExport=$('#btn-export'); const fileImport=$('#file-import'); const btnClearCache=$('#btn-clear-cache'); const btnInstall=$('#btn-install');
  let FILTER_OBJ='';

  function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

  // Hard column map by index: R(17), T(19), V(21), X(23), Z(25)
  function colByIndex(i){ return (i < HEADERS.length ? HEADERS[i] : null); }
  function hardColMap(){
    const qty = colByIndex(17);
    const models = [19,21,23,25].map(colByIndex).filter(Boolean);
    return { qty, models };
  }

  async function load(){
    await idb.open();
    const metaHeaders = await idb.get('meta','headers');
    const metaRows = await idb.getAll('rows');
    if(metaHeaders && metaRows.length){
      HEADERS = metaHeaders.value; ROWS = metaRows.map(x=>x.payload);
      OBJECT_COL = HEADERS.includes('Unnamed: 2') ? 'Unnamed: 2' : HEADERS[0];
      return;
    }
    // initial from data.json
    const r = await fetch('data.json'); const data = await r.json();
    HEADERS = data.headers; OBJECT_COL = (HEADERS.includes('Unnamed: 2')?'Unnamed: 2':(data.objectColumn||HEADERS[0]));
    ROWS = data.rows.map(r=>({id:crypto.randomUUID(), ...r}));
    await idb.put('meta',{key:'headers', value:HEADERS});
    for(const row of ROWS){ await idb.put('rows',{id:row.id, payload:row}); }
  }

  function uniqueObjects(){
    const map = new Map();
    for(const r of ROWS){ const key = String(r[OBJECT_COL] ?? '').trim() || '(без объекта)'; map.set(key, (map.get(key)||0)+1); }
    return [...map.entries()].map(([name,count])=>({name,count})).sort((a,b)=> a.name.localeCompare(b.name,'ru'));
  }

  function renderTiles(){
    objectDetail.classList.add('hidden');
    const q=(searchEl.value||'').toLowerCase();
    objectsEl.innerHTML='';
    for(const obj of uniqueObjects()){
      if(q && !obj.name.toLowerCase().includes(q)) continue;
      const div=document.createElement('div'); div.className='card-object';
      div.innerHTML=`<div class="title">${escapeHtml(obj.name)}</div><div class="small">слотов: <span class="badge">${obj.count}</span></div>`;
      div.addEventListener('click',()=>{ FILTER_OBJ=obj.name; renderObjectDetail(); });
      objectsEl.appendChild(div);
    }
  }

  function classifyType(model){
    const s = model.toLowerCase();
    return (s.includes('смо') || s.includes('ceia') || s.includes('металлодетектор') || s.includes('md')) ? 'СМО' : 'РТУ';
  }

  function buildItemsForObject(objectName){
    const {qty, models} = hardColMap();
    const rows = ROWS.filter(r => String(r[OBJECT_COL] ?? '').trim() === objectName);
    const items = [];
    for(const r of rows){
      const qVal = qty ? (parseInt(r[qty] || '0', 10) || 0) : 0;
      for(const mcol of models){
        const model = String(r[mcol] ?? '').trim();
        if(!model) continue;
        const type = classifyType(model);
        items.push({ rowId:r.id, model, type, qtyCol:qty, qty:(type==='РТУ'?qVal:(qVal or 1)), serialCol:'Серийный номер', serial:String(r['Серийный номер']||'') });
      }
    }
    return items;
  }

  async function saveRowChange(rowId, col, value){
    const idx = ROWS.findIndex(r=>r.id===rowId);
    if(idx<0) return;
    ROWS[idx] = {...ROWS[idx], [col]: value};
    await idb.put('rows', {id: rowId, payload: ROWS[idx]});
  }

  function renderObjectDetail(){
    const items = buildItemsForObject(FILTER_OBJ);
    objectTitle.textContent = `Объект: ${FILTER_OBJ}`;
    objectItems.innerHTML = '';
    objectDetail.classList.remove('hidden');
    for(const it of items){
      const card = document.createElement('div'); card.className='item-card';
      card.innerHTML = `
        <div class="item-head">
          <div class="item-title">${escapeHtml(it.type)} — ${escapeHtml(it.model)}</div>
          <div class="qty-controls">
            <button class="btn-secondary" data-act="dec">-</button>
            <span class="badge" data-role="qty">${it.qty}</span>
            <button class="btn-secondary" data-act="inc">+</button>
          </div>
        </div>
        <div class="serial-wrap">
          <label class="small">Серийный номер</label>
          <input type="text" value="${escapeHtml(it.serial)}" data-role="serial">
        </div>`;
      const qtySpan = card.querySelector('[data-role="qty"]');
      const decBtn = card.querySelector('[data-act="dec"]');
      const incBtn = card.querySelector('[data-act="inc"]');
      const serialInput = card.querySelector('[data-role="serial"]');

      decBtn.addEventListener('click', async()=>{
        let q = parseInt(qtySpan.textContent,10)||0;
        if(q>0) q--;
        qtySpan.textContent = q;
        if(it.qtyCol) await saveRowChange(it.rowId, it.qtyCol, String(q));
      });
      incBtn.addEventListener('click', async()=>{
        let q = parseInt(qtySpan.textContent,10)||0;
        q++;
        qtySpan.textContent = q;
        if(it.qtyCol) await saveRowChange(it.rowId, it.qtyCol, String(q));
      });
      serialInput.addEventListener('blur', async()=>{
        await saveRowChange(it.rowId, it.serialCol, serialInput.value);
      });

      objectItems.appendChild(card);
    }
  }

  // Export/Import/Clear/Install
  btnExport.addEventListener('click',()=>{
    const out = { headers: HEADERS, objectColumn: OBJECT_COL, rows: ROWS };
    const blob = new Blob([JSON.stringify(out,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='vef2025_export.json'; a.click(); URL.revokeObjectURL(url);
  });
  fileImport.addEventListener('change', async e=>{
    const f=e.target.files[0]; if(!f) return; const t=await f.text(); const j=JSON.parse(t);
    HEADERS=j.headers; OBJECT_COL=j.objectColumn||HEADERS[0]; ROWS=j.rows.map(r=>r.id?r:{id:crypto.randomUUID(),...r});
    await idb.clear('rows'); for(const r of ROWS){ await idb.put('rows',{id:r.id,payload:r}); }
    await idb.put('meta',{key:'headers',value:HEADERS});
    renderTiles();
  });
  btnClearCache.addEventListener('click', async()=>{
    if(!confirm('Сбросить локальные изменения и кэш?')) return;
    await idb.clear('rows'); await idb.clear('meta');
    if('caches' in window){ const ks=await caches.keys(); for(const k of ks){ await caches.delete(k);} }
    location.reload();
  });
  window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); btnInstall.onclick=async()=>{ e.prompt(); await e.userChoice; }; });

  btnBackToTiles.addEventListener('click', ()=>{ objectDetail.classList.add('hidden'); FILTER_OBJ=''; renderTiles(); });
  searchEl.addEventListener('input', ()=>renderTiles());

  load().then(renderTiles).catch(err=>{ console.error(err); alert('Ошибка загрузки данных: '+err.message); });
})();