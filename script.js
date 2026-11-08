'use strict';

/* ==========================================================
   1. CONFIGURACIÓN: tipos de recurso y reglas propias
   ========================================================== */

// Cada tipo tiene: ícono, nombre, tiempo máximo (min) y si es crítico
const TYPES = {
  laptop:    {icon:'💻', label:'Portátil',  max:45, critical:false},
  tablet:    {icon:'📱', label:'Tableta',   max:30, critical:false},
  proyector: {icon:'📽️', label:'Proyector', max:60, critical:true },
  camara:    {icon:'📷', label:'Cámara',    max:30, critical:true },
  router:    {icon:'📡', label:'Router 4G', max:90, critical:false},
  microfono: {icon:'🎙️', label:'Micrófono', max:20, critical:false}
};

const MAX_PER_USER = 4;        // máximo de recursos en uso por persona
const MIN_REP_CRITICAL = 40;   // reputación mínima para tomar equipos críticos
const KEY = 'resourcehub.v2';  // nombre bajo el que se guarda en localStorage

// Crea la lista inicial de recursos (se usa la primera vez que se abre la app)
const DEFAULT_ITEMS = () => [
  ['Portátil Dell 01','laptop'],['Portátil HP 02','laptop'],
  ['Portátil Lenovo 03','laptop'],['Portátil Mac 04','laptop'],
  ['Tableta Galaxy','tablet'],['iPad Aula','tablet'],
  ['Proyector Epson','proyector'],['Proyector BenQ','proyector'],
  ['Cámara Canon','camara'],['Cámara Sony','camara'],
  ['Router Claro','router'],['Micrófono Shure','microfono']
].map(([name,type],i)=>({
  id:'r'+i+'_'+Date.now(),   // identificador único
  name, type,
  state:'avail',             // 'avail' = disponible, 'use' = en uso
  since:null,                // momento en que fue tomado
  holder:null                // persona que lo tiene
}));


/* ==========================================================
   2. ESTADO Y ALMACENAMIENTO (localStorage)
   ========================================================== */

// S guarda todo el estado de la app: recursos, usuario, reputación, bitácora y modo demo
let S = load();

// Carga el estado guardado; si no hay nada, crea uno nuevo
function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return {items:DEFAULT_ITEMS(), user:'', rep:0, log:[], demo:true};
}

// Guarda el estado actual en el navegador
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){}
}

// Ubicación actual (no se guarda: cambia en cada sesión)
let pos = null;


/* ==========================================================
   3. UTILIDADES
   ========================================================== */

// Atajo para buscar un elemento por su id
const $ = id => document.getElementById(id);

// Limita un valor entre un mínimo (a) y un máximo (b)
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

// Muestra una notificación emergente (kind: '', 'ok', 'warn' o 'err')
function toast(msg,kind=''){
  const d = document.createElement('div');
  d.className = 't '+kind;
  d.textContent = msg;
  $('toast').appendChild(d);
  setTimeout(()=>d.remove(),3800);   // desaparece a los 3.8 segundos
}

// Agrega un movimiento a la bitácora (máximo 40 registros)
function addLog(text,bad=false){
  S.log.unshift({t:Date.now(),text,bad});
  S.log = S.log.slice(0,40);
}

// Minutos transcurridos desde que se tomó el recurso
// En modo demo 1 segundo cuenta como 1 minuto
function elapsedMin(it){
  return (Date.now()-it.since)/(S.demo?1000:60000);
}

// Devuelve true si el recurso está en uso y superó su tiempo máximo
function isLate(it){
  return it.state==='use' && elapsedMin(it) > TYPES[it.type].max;
}

// Escapa caracteres especiales para evitar inyectar HTML en los textos
function esc(s){
  return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}


/* ==========================================================
   4. REGLAS DE NEGOCIO
   ========================================================== */

// Revisa si el usuario puede tomar el recurso.
// Devuelve un texto con el error, o null si todo está bien.
function checkoutError(it){
  const T = TYPES[it.type];

  // Regla 1: debe haber un nombre de usuario
  if(!S.user.trim()) return 'Escribe tu nombre antes de tomar un recurso.';

  // Regla 2: no superar el máximo de recursos por persona
  const mine = S.items.filter(x=>x.state==='use' && x.holder===S.user.trim()).length;
  if(mine >= MAX_PER_USER) return `Límite alcanzado: ya tienes ${MAX_PER_USER} recursos en uso.`;

  // Regla 3: los equipos críticos exigen reputación mínima
  if(T.critical){
    if(S.rep < MIN_REP_CRITICAL) return `Reputación baja (${S.rep}). Los equipos críticos requieren ≥ ${MIN_REP_CRITICAL}.`;
  }
  return null;
}

// Mueve un recurso a un estado nuevo ('use' = tomar, 'avail' = devolver)
function moveItem(id,target){
  const it = S.items.find(x=>x.id===id);
  if(!it || it.state===target) return;   // si no existe o ya está ahí, no hace nada
  const T = TYPES[it.type];

  if(target==='use'){
    // ----- TOMAR el recurso -----
    const err = checkoutError(it);
    if(err){
      // Si no cumple las reglas, se bloquea y se registra
      toast('⛔ '+err,'err');
      addLog(`Bloqueado: ${it.name} — ${err}`,true);
      render();
      return;
    }
    it.state  = 'use';
    it.since  = Date.now();
    it.holder = S.user.trim();
    addLog(`${it.holder} tomó ${it.name}`);
    toast(`✅ ${it.name} ahora está en uso`,'ok');

  }else{
    // ----- DEVOLVER el recurso -----
    const late = isLate(it);
    const mins = Math.round(elapsedMin(it));

    if(late){
      // Devolución tardía: resta 15 de reputación
      S.rep = clamp(S.rep-15,0,100);
      addLog(`${it.holder} devolvió ${it.name} con retraso (${mins} min, máx ${T.max}) −15 rep`,true);
      toast(`⏰ Devolución tardía: −15 de reputación`,'warn');
    }else{
      // Devolución a tiempo: suma 10 de reputación
      S.rep = clamp(S.rep+10,0,100);
      addLog(`${it.holder} devolvió ${it.name} a tiempo (${mins} min) +10 rep`);
      toast(`👍 Devuelto a tiempo: +10 de reputación`,'ok');
    }
    // El recurso vuelve a quedar libre
    it.state='avail'; it.since=null; it.holder=null;
  }

  save();    // guarda los cambios
  render();  // actualiza la pantalla
}


/* ==========================================================
   5. DIBUJO DE LA INTERFAZ (render)
   ========================================================== */

// Genera el HTML de una tarjeta de recurso
function cardHTML(it){
  const T    = TYPES[it.type];
  const use  = it.state==='use';
  const late = isLate(it);

  // Etiqueta de la esquina: "crítico" o el nombre del tipo
  const crit = T.critical
    ? `<span class="tag crit">⚠ crítico</span>`
    : `<span class="tag">${T.label}</span>`;

  // Temporizador y barra de progreso (solo si está en uso)
  let timer = '';
  if(use){
    const e = elapsedMin(it);
    timer = `<div class="timer"><span data-t="${it.id}">${Math.floor(e)} / ${T.max} min</span><span>${esc(it.holder)}</span></div>
             <div class="tbar"><i data-b="${it.id}" style="width:${clamp(e/T.max*100,0,100)}%"></i></div>`;
  }

  return `<article class="res ${use?'use':'avail'} ${late?'late':''}" draggable="true" data-id="${it.id}">
    ${crit}
    <div class="icon">${T.icon}</div>
    <div class="name">${esc(it.name)}</div>
    <div class="meta">${T.label}${use?'':' · máx '+T.max+' min'}</div>
    ${timer}
    <div class="acts">
      <button data-act="move">${use?'Devolver':'Tomar'}</button>
    </div>
  </article>`;
}

// Redibuja toda la interfaz con el estado actual
function render(){
  // Separa los recursos por estado
  const av = S.items.filter(i=>i.state==='avail');
  const us = S.items.filter(i=>i.state==='use');

  // Tarjetas en cada zona (con mensaje si está vacía)
  $('zAvail').innerHTML = av.map(cardHTML).join('') || '<div class="empty">Todo está en uso 🎯</div>';
  $('zUse').innerHTML   = us.map(cardHTML).join('') || '<div class="empty">Arrastra aquí un recurso para usarlo</div>';

  // Contadores de cada panel
  $('cAvail').textContent = av.length;
  $('cUse').textContent   = us.length;

  // Indicadores (KPIs)
  $('kTotal').textContent = S.items.length;
  $('kAvail').textContent = av.length;
  $('kUse').textContent   = us.length;
  $('kLate').textContent  = us.filter(isLate).length;

  // Reputación (número y barra)
  $('repNum').textContent = S.rep;
  $('repBar').style.width = S.rep+'%';

  // Bitácora con la hora de cada movimiento
  $('log').innerHTML = S.log.map(l=>{
    const d = new Date(l.t);
    const h = d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    return `<li class="${l.bad?'bad':''}"><time>${h}</time><span>${esc(l.text)}</span></li>`;
  }).join('') || '<li>Sin movimientos todavía.</li>';

  setChartTargets();   // actualiza el gráfico
}


/* ==========================================================
   6. TEMPORIZADOR: se ejecuta cada segundo
   Actualiza el tiempo en pantalla sin volver a dibujar todo,
   para no interrumpir el arrastre de las tarjetas.
   ========================================================== */
setInterval(()=>{
  let changed = false;

  S.items.filter(i=>i.state==='use').forEach(it=>{
    const T = TYPES[it.type], e = elapsedMin(it);

    // Busca el texto y la barra de esta tarjeta
    const t = document.querySelector(`[data-t="${it.id}"]`);
    const b = document.querySelector(`[data-b="${it.id}"]`);
    if(t) t.textContent = `${Math.floor(e)} / ${T.max} min`;
    if(b) b.style.width = clamp(e/T.max*100,0,100)+'%';

    // Marca la tarjeta como retrasada si superó el tiempo máximo
    const card = document.querySelector(`.res[data-id="${it.id}"]`);
    if(card){
      const late = e>T.max;
      if(late!==card.classList.contains('late')){
        card.classList.toggle('late',late);
        changed = true;
        if(late) toast(`⏰ ${it.name} superó su tiempo máximo`,'warn');
      }
    }
  });

  // Si cambió algún retraso, actualiza el contador de "Con retraso"
  if(changed) $('kLate').textContent = S.items.filter(isLate).length;
},1000);


/* ==========================================================
   7. ARRASTRAR Y SOLTAR
   ========================================================== */

let dragId = null;   // id del recurso que se está arrastrando

// Al empezar a arrastrar una tarjeta
document.addEventListener('dragstart',e=>{
  const c = e.target.closest('.res');
  if(!c) return;
  dragId = c.dataset.id;
  c.classList.add('dragging');
  e.dataTransfer.setData('text/plain',dragId);
  e.dataTransfer.effectAllowed = 'move';
});

// Al terminar de arrastrar: quita los estilos temporales
document.addEventListener('dragend',e=>{
  document.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging'));
  document.querySelectorAll('.zone').forEach(z=>z.classList.remove('over'));
});

// Eventos de cada zona (Disponible y En uso)
document.querySelectorAll('.zone').forEach(z=>{
  // Mientras la tarjeta está encima: permite soltar y resalta la zona
  z.addEventListener('dragover',e=>{ e.preventDefault(); z.classList.add('over'); });

  // Al salir de la zona: quita el resaltado
  z.addEventListener('dragleave',e=>{
    if(!z.contains(e.relatedTarget)) z.classList.remove('over');
  });

  // Al soltar: mueve el recurso al estado de esta zona
  z.addEventListener('drop',e=>{
    e.preventDefault();
    z.classList.remove('over');
    const id = e.dataTransfer.getData('text/plain') || dragId;
    moveItem(id,z.dataset.target);
  });
});

// Botones "Tomar"/"Devolver" de cada tarjeta (también sirven en pantallas táctiles)
document.addEventListener('click',e=>{
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  const id = btn.closest('.res').dataset.id;
  const it = S.items.find(x=>x.id===id);
  if(btn.dataset.act==='move') moveItem(id, it.state==='avail'?'use':'avail');
});


/* ==========================================================
   8. FORMULARIO Y CONTROLES
   ========================================================== */

// Campo de usuario: muestra el nombre guardado y lo guarda al escribir
$('user').value = S.user;
$('user').addEventListener('input',e=>{
  S.user = e.target.value;
  save();
});

// Interruptor del modo demo
$('demo').checked = S.demo;
$('demo').addEventListener('change',e=>{
  // Reajusta los tiempos para que el cambio de escala no genere falsos retrasos
  const factor = e.target.checked ? 1/60 : 60;
  S.items.filter(i=>i.state==='use').forEach(i=>{
    const el = Date.now()-i.since;
    i.since = Date.now()-el*factor;
  });
  S.demo = e.target.checked;
  save();
  render();
});


/* ==========================================================
   9. GEOLOCALIZACIÓN
   ========================================================== */

// Muestra la ubicación (o un mensaje si todavía no hay)
function showGeo(){
  const el = $('geoInfo');
  if(!pos){ el.textContent = 'Sin ubicación todavía.'; return; }
  el.innerHTML = `Lat: <b>${pos.lat.toFixed(5)}</b><br>Lon: <b>${pos.lon.toFixed(5)}</b><br>Precisión: <b>±${Math.round(pos.acc)} m</b><br>
    <a href="https://www.openstreetmap.org/?mlat=${pos.lat}&mlon=${pos.lon}#map=17/${pos.lat}/${pos.lon}" target="_blank" rel="noopener">Ver en mapa ↗</a>`;
}

// Botón "Obtener ubicación"
$('btnGeo').addEventListener('click',()=>{
  // Si el navegador no soporta geolocalización, avisa
  if(!navigator.geolocation){
    toast('Tu navegador no soporta geolocalización.','err');
    return;
  }
  $('geoInfo').textContent = 'Buscando ubicación…';

  navigator.geolocation.getCurrentPosition(
    // Éxito: guarda latitud, longitud y precisión
    p=>{
      pos = {lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy};
      showGeo();
      toast('📍 Ubicación obtenida','ok');
    },
    // Error: permiso denegado o no disponible
    err=>{
      $('geoInfo').textContent = 'No se pudo obtener la ubicación.';
      toast('Permiso de ubicación denegado o no disponible.','err');
    },
    // Opciones: alta precisión y máximo 10 segundos de espera
    {enableHighAccuracy:true, timeout:10000}
  );
});


/* ==========================================================
   10. GRÁFICO CON CANVAS: recursos en uso
   Muestra una dona general y una barra por cada tipo,
   con animación suave al cambiar los valores.
   ========================================================== */

const cv  = $('chart');
const ctx = cv.getContext('2d');

// anim = valores que se están dibujando ahora; target = valores a los que se quiere llegar
const anim = {donut:0, bars:{}};
let target = {donut:0, bars:{}};
let running = false;   // indica si la animación está activa

// Calcula los valores objetivo del gráfico a partir del estado actual
function setChartTargets(){
  const total = S.items.length || 1;
  const use   = S.items.filter(i=>i.state==='use').length;
  target.donut = use/total;   // proporción general en uso

  // Proporción en uso por cada tipo de recurso
  Object.keys(TYPES).forEach(k=>{
    const all = S.items.filter(i=>i.type===k).length;
    const u   = S.items.filter(i=>i.type===k && i.state==='use').length;
    target.bars[k] = {ratio: all?u/all:0, use:u, all};
    if(!anim.bars[k]) anim.bars[k] = {ratio:0, use:u, all};
    anim.bars[k].use = u;
    anim.bars[k].all = all;
  });

  // Inicia la animación si no estaba corriendo
  if(!running){ running = true; requestAnimationFrame(loop); }
}

// Bucle de animación: acerca poco a poco los valores actuales a los objetivo
function loop(){
  let moving = false;

  // Avanza un 15 % de la distancia restante; si ya está cerca, llega al valor final
  const step = (a,b)=>{
    const d = b-a;
    if(Math.abs(d)>0.002){ moving = true; return a+d*0.15; }
    return b;
  };

  anim.donut = step(anim.donut, target.donut);
  Object.keys(target.bars).forEach(k=>{
    anim.bars[k].ratio = step(anim.bars[k].ratio, target.bars[k].ratio);
  });

  drawChart();
  if(moving) requestAnimationFrame(loop); else running = false;
}

// Dibuja un rectángulo con esquinas redondeadas
function rr(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

// Dibuja el gráfico completo (dona + barras)
function drawChart(){
  // Ajusta la resolución del canvas a la pantalla (nitidez en pantallas retina)
  const dpr = window.devicePixelRatio||1, W = cv.clientWidth, H = cv.clientHeight;
  if(cv.width!==W*dpr || cv.height!==H*dpr){ cv.width = W*dpr; cv.height = H*dpr; }
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);

  // ----- Dona general -----
  const cx = Math.min(110,W*0.2)+10, cy = H/2, R = Math.min(80,H/2-20), lw = 18;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';

  // Anillo de fondo (gris)
  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();

  // Arco azul según el porcentaje en uso
  if(anim.donut>0.003){
    const g = ctx.createLinearGradient(cx-R,cy-R,cx+R,cy+R);
    g.addColorStop(0,'#60a5fa'); g.addColorStop(1,'#1d4ed8');
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.arc(cx,cy,R,-Math.PI/2,-Math.PI/2+Math.PI*2*anim.donut);
    ctx.stroke();
  }

  // Texto central: "en uso / total"
  const use = S.items.filter(i=>i.state==='use').length;
  ctx.fillStyle = '#1e293b'; ctx.textAlign = 'center';
  ctx.font = '700 26px Segoe UI, sans-serif';
  ctx.fillText(use+' / '+S.items.length,cx,cy+4);
  ctx.fillStyle = '#64748b';
  ctx.font = '12px Segoe UI, sans-serif';
  ctx.fillText('en uso',cx,cy+24);

  // ----- Barras por tipo -----
  const x0 = cx+R+50, bw = W-x0-30, keys = Object.keys(TYPES), rowH = (H-30)/keys.length;

  keys.forEach((k,i)=>{
    const y = 18+i*rowH;
    const b = anim.bars[k] || {ratio:0,use:0,all:0};

    // Nombre del tipo (a la izquierda)
    ctx.textAlign = 'left'; ctx.fillStyle = '#475569';
    ctx.font = '600 12.5px Segoe UI, sans-serif';
    ctx.fillText(TYPES[k].icon+' '+TYPES[k].label,x0,y+4);

    // Barra de fondo (gris)
    const by = y+11, bh = 12;
    ctx.fillStyle = '#e2e8f0';
    rr(x0,by,bw,bh,6); ctx.fill();

    // Barra de progreso (azul)
    if(b.ratio>0.003){
      const g = ctx.createLinearGradient(x0,0,x0+bw,0);
      g.addColorStop(0,'#3b82f6'); g.addColorStop(1,'#1d4ed8');
      ctx.fillStyle = g;
      rr(x0,by,Math.max(bw*b.ratio,12),bh,6); ctx.fill();
    }

    // Conteo "en uso / total" (a la derecha)
    ctx.textAlign = 'right'; ctx.fillStyle = '#1e293b';
    ctx.fillText(b.use+' / '+b.all+' en uso',x0+bw,y+4);
  });
}

// Redibuja el gráfico si cambia el tamaño de la ventana
window.addEventListener('resize',drawChart);


/* ==========================================================
   11. INICIO: primer dibujado de la aplicación
   ========================================================== */
showGeo();
render();
drawChart();
