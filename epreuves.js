// ── VIEWER ────────────────────────────────────────────────────────────────
function viewerConnect(){
  const pseudo = document.getElementById('viewer-pseudo').value.trim();
  if(!pseudo){ toast('Entre ton pseudo !'); return; }
  currentViewerPseudo = pseudo;
  fbSetViewer(pseudo);
  document.getElementById('login-card').style.display = 'none';
  document.getElementById('viewer-info').classList.add('visible');
  renderViewerInfo(pseudo);
  renderDiamantViewer(pseudo);
  renderFermeViewer(pseudo);
}

function viewerDisconnect(){
  currentViewerPseudo = null;
  document.getElementById('login-card').style.display = 'block';
  document.getElementById('viewer-info').classList.remove('visible');
  document.getElementById('viewer-pseudo').value = '';
}

function renderViewerInfo(pseudo){
  document.getElementById('greeting-name').textContent = '✦ Bienvenue, ' + pseudo;
  const myItems = assignments.filter(a => a.viewer === pseudo);
  document.getElementById('greeting-status').textContent =
    myItems.length === 0 ? 'Tu attends ton rôle autour du feu…' :
    myItems.length === 1 ? 'Le meneur t\'a confié quelque chose.' :
    'Le meneur t\'a confié ' + myItems.length + ' choses.';

  renderCraftSection(pseudo);

  const list = document.getElementById('info-items-list');
  if(myItems.length === 0){ list.innerHTML = '<div class="info-empty">🌑 Rien encore… Le meneur va bientôt agir.</div>'; return; }
  const icons = {objet:'🪵',role:'🎭',info:'📜',secret:'🔮'};
  const labels= {objet:'Objet',role:'Rôle',info:'Information',secret:'Secret'};
  list.innerHTML = myItems.map(a => {
    const qtyBadge = (a.type==='objet' && (a.qty??1)>1)
      ? `<span class="t-glow-mini">×${a.qty}</span>` : '';
    return `<div class="info-item">
      <span class="item-icon">${icons[a.type]||'📦'}</span>
      <div class="info-type">${labels[a.type]||a.type}</div>
      <div class="info-content">${escHtml(a.content)}${qtyBadge}</div>
    </div>`;
  }).join('');
}

// ── VIEWER GAME CARD ──────────────────────────────────────────────────────
function updateViewerGameCard(){
  const card = document.getElementById('viewer-game-card');
  if(!activeGame){ card.style.display='none'; return; }
  card.style.display = 'block';
  document.getElementById('viewer-game-title').textContent = activeGame.title;
  document.getElementById('viewer-game-rules').textContent = activeGame.rules;
}

// ── CRAFT VIEWER ──────────────────────────────────────────────────────────
function renderCraftSection(pseudo){
  const sec = document.getElementById('viewer-craft-section');
  if(!sec) return;
  if(!activeGame || !activeGame.craftRoles || activeGame.craftRoles.length===0){ sec.style.display='none'; return; }

  const myRoleAssignments = assignments.filter(a => a.viewer===pseudo && a.type==='role');
  const matchedRole = activeGame.craftRoles.find(cr =>
    myRoleAssignments.some(a => a.content.toLowerCase().includes(cr.name.toLowerCase()))
  );
  if(!matchedRole){ sec.style.display='none'; return; }

  sec.style.display = 'block';
  document.getElementById('viewer-craft-role-name').textContent = matchedRole.name;

  const myObjets = assignments.filter(a => a.viewer===pseudo && a.type==='objet');
  const recipesEl = document.getElementById('viewer-recipes-list');

  if(matchedRole.recipes.length===0){
    recipesEl.innerHTML='<div class="t-muted-it9">Aucune recette pour ce rôle.</div>';
    return;
  }

  recipesEl.innerHTML = matchedRole.recipes.map((rc,ri) => {
    const costChecks = rc.cost.map(c => {
      const found = myObjets.find(o => o.content.toLowerCase().includes(c.name.toLowerCase()));
      const have  = found ? (found.qty??1) : 0;
      return {...c, have, ok: have>=c.qty};
    });
    const canCraft = costChecks.every(c=>c.ok);
    const costHtml = costChecks.map(c =>
      `<span class="${c.ok?'ok':'missing'}">${escHtml(c.name)} ×${c.qty} (tu en as : ${c.have})</span>`
    ).join('<br>');
    return `<div class="recipe-card ${canCraft?'craftable':''}">
      <div class="recipe-output">⚗️ ${escHtml(rc.output)}</div>
      <div class="recipe-cost">${costHtml}</div>
      <button class="btn-craft" ${canCraft?'':'disabled'} onclick="craftItem('${escAttr(pseudo)}','${escAttr(String(matchedRole.id))}','${escAttr(String(rc.id))}')">
        ${canCraft?'✦ Fabriquer':'✕ Ressources manquantes'}
      </button>
    </div>`;
  }).join('');
}

function craftItem(pseudo, roleId, recipeId){
  if(!activeGame || !activeGame.craftRoles){ return; }
  const role = activeGame.craftRoles.find(r => String(r.id)===String(roleId));
  const rc   = role && role.recipes.find(r => String(r.id)===String(recipeId));
  if(!rc){ toast('Recette introuvable'); return; }

  // Re-check the viewer really has the resources (safety against stale UI)
  const myObjets = assignments.filter(a => a.viewer===pseudo && a.type==='objet');
  const enough = rc.cost.every(c => {
    const found = myObjets.find(o => o.content.toLowerCase().includes(c.name.toLowerCase()));
    return found && (found.qty??1) >= c.qty;
  });
  if(!enough){ toast('Ressources insuffisantes'); renderCraftSection(pseudo); return; }

  // Consume resources
  rc.cost.forEach(c => {
    const found = assignments.find(a => a.viewer===pseudo && a.type==='objet'
      && a.content.toLowerCase().includes(c.name.toLowerCase()));
    if(found){
      const left = (found.qty??1) - c.qty;
      if(left<=0) fbRemoveAssignment(found.id);
      else { found.qty = left; fbUpdateAssignment(found); }
    }
  });
  // Add crafted object — stack onto an existing identical objet if the viewer has one
  const existing = assignments.find(a => a.viewer===pseudo && a.type==='objet'
    && a.content.toLowerCase() === rc.output.toLowerCase());
  if(existing){
    existing.qty = (existing.qty??1) + 1;
    fbUpdateAssignment(existing);
  } else {
    fbPushAssignment({ id:String(Date.now())+Math.floor(Math.random()*1000), viewer:pseudo, type:'objet', content:rc.output, qty:1 });
  }
  toast('⚗️ ' + rc.output + ' fabriqué !');
}

// ── ADMIN LOGIN ───────────────────────────────────────────────────────────
function adminLogin(){
  if(document.getElementById('admin-pass-input').value === ADMIN_PASSWORD){
    document.getElementById('admin-pass-input').value='';
    showPage('admin');
    renderViewerList();
    updateStats();
  } else { toast('⛔ Mot de passe incorrect'); }
}

// ── VIEWER LIST ───────────────────────────────────────────────────────────
function renderViewerList(){
  const q   = (document.getElementById('search-viewers')?.value||'').toLowerCase();
  const el  = document.getElementById('viewer-list-el');
  // Use the stored pseudo (real display name) rather than the sanitized key
  const names = Object.values(viewers)
    .map(v => (v && v.pseudo) ? v.pseudo : v)
    .filter(n => typeof n === 'string' && n.toLowerCase().includes(q));
  if(!names.length){ el.innerHTML='<div class="empty-state">Aucun villageois</div>'; return; }
  el.innerHTML = names.map(name => {
    const count = assignments.filter(a=>a.viewer===name).length;
    return `<div class="viewer-row${selectedViewer===name?' selected':''}" onclick="selectViewer('${escAttr(name)}')">
      <div class="viewer-avatar">${name.slice(0,2).toUpperCase()}</div>
      <div class="viewer-name-row">${escHtml(name)}</div>
      ${count>0?`<span class="viewer-badge-count">${count}</span>`:''}
    </div>`;
  }).join('');
}

function selectViewer(name){
  selectedViewer = name;
  renderViewerList();
  renderPanel();
  updateTemplates();
}

function clearSelection(){
  selectedViewer = null;
  renderViewerList();
  document.getElementById('panel-empty').style.display='block';
  document.getElementById('panel-content').style.display='none';
}

// ── PANEL ─────────────────────────────────────────────────────────────────
function renderPanel(){
  if(!selectedViewer) return;
  document.getElementById('panel-empty').style.display='none';
  document.getElementById('panel-content').style.display='block';
  document.getElementById('panel-avatar').textContent = selectedViewer.slice(0,2).toUpperCase();
  document.getElementById('panel-name').textContent   = selectedViewer;
  const myItems = assignments.filter(a=>a.viewer===selectedViewer);
  document.getElementById('panel-count').textContent  =
    myItems.length===0 ? 'Aucun objet attribué' :
    myItems.length===1 ? '1 objet attribué' : myItems.length+' objets attribués';

  const typeLabel={objet:'Objet',role:'Rôle',info:'Information',secret:'Secret'};
  const typeClass={objet:'type-objet',role:'type-role',info:'type-info',secret:'type-secret'};
  const typeIcon ={objet:'🪵',role:'🎭',info:'📜',secret:'🔮'};
  const listEl=document.getElementById('panel-items-list');
  if(!myItems.length){ listEl.innerHTML='<div class="empty-state u-pad-v">Rien attribué pour l\'instant</div>'; return; }

  listEl.innerHTML = myItems.map(a => {
    const isObjet = a.type==='objet';
    const qty = a.qty??1;
    const stepper = isObjet ? `
      <div class="stepper">
        <button onclick="changeQty('${escAttr(a.id)}',-1)" class="stepper-btn left" onmouseover="this.style.background='rgba(122,61,0,.3)'" onmouseout="this.style.background='rgba(26,13,0,.6)'">−</button>
        <div class="stepper-val">×${qty}</div>
        <button onclick="changeQty('${escAttr(a.id)}',+1)" class="stepper-btn right" onmouseover="this.style.background='rgba(122,61,0,.3)'" onmouseout="this.style.background='rgba(26,13,0,.6)'">+</button>
      </div>` : '';
    return `<div class="f-list-row-top">
      <span class="u-icon-top">${typeIcon[a.type]||'📦'}</span>
      <div class="u-flex1">
        <div class="u-mb3"><span class="type-badge ${typeClass[a.type]||''}">${typeLabel[a.type]||a.type}</span></div>
        <div class="f-list-body">${escHtml(a.content)}</div>
        ${stepper}
      </div>
      <button class="btn-delete" onclick="deleteAssignment('${escAttr(a.id)}')" title="Retirer">✕</button>
    </div>`;
  }).join('');
}

// ── ASSIGN ────────────────────────────────────────────────────────────────
function updateTemplates(){
  const type = document.getElementById('assign-type')?.value;
  const tpls = TEMPLATES[type]||[];
  document.getElementById('templates-list').innerHTML = tpls.map(t=>`<button class="tpl-btn" onclick="useTpl(this)">${t}</button>`).join('');
}
function useTpl(btn){ document.getElementById('assign-content').value=btn.textContent; }

function assignToViewer(){
  if(!selectedViewer){ toast('Sélectionne un villageois !'); return; }
  const type    = document.getElementById('assign-type').value;
  const content = document.getElementById('assign-content').value.trim();
  if(!content){ toast('Entre un contenu !'); return; }
  const qty = type==='objet' ? 1 : null;
  fbPushAssignment({ id:String(Date.now())+Math.floor(Math.random()*1000), viewer:selectedViewer, type, content, qty });
  document.getElementById('assign-content').value='';
  toast('✓ Attribué à '+selectedViewer+' !');
}

function deleteAssignment(id){
  fbRemoveAssignment(id);
}

function changeQty(id, delta){
  const a = assignments.find(a=>String(a.id)===String(id));
  if(!a) return;
  const newQty = (a.qty??1)+delta;
  if(newQty<=0){ if(!confirm('Retirer cet objet complètement ?')) return; deleteAssignment(id); return; }
  a.qty = newQty;
  fbUpdateAssignment(a);
}

// ── ÉPREUVE EDITOR (create / edit in library) ──────────────────────────────
function harvestCraftRoles(){
  return craftRolesDraft
    .map(r=>({ id:String(r.id), name:r.name.trim(),
      recipes: r.recipes.filter(rc=>rc.output.trim()).map(rc=>({
        id:String(rc.id), output:rc.output.trim(),
        cost: rc.cost.filter(c=>c.name.trim()).map(c=>({name:c.name.trim(),qty:Math.max(1,parseInt(c.qty)||1)}))
      }))
    }))
    .filter(r=>r.name && r.recipes.length);
}

function openEpreuveEditor(ep){
  document.getElementById('epreuve-editor').style.display = 'block';
  document.getElementById('editor-title').textContent = ep ? '✎ Modifier l\'épreuve' : '✎ Nouvelle épreuve';
  document.getElementById('editor-id').value    = ep ? ep.id : '';
  document.getElementById('game-title').value   = ep ? ep.title : '';
  document.getElementById('game-rules').value   = ep ? ep.rules : '';
  document.getElementById('game-reward').value  = ep ? (ep.reward??20) : 20;
  // load craft roles into draft
  craftRolesDraft = ep && ep.craftRoles ? JSON.parse(JSON.stringify(ep.craftRoles)) : [];
  craftSectionOpen = craftRolesDraft.length>0;
  document.getElementById('craft-section').style.display = craftSectionOpen?'block':'none';
  document.getElementById('craft-toggle-btn').textContent = craftSectionOpen?'− Masquer':'+ Ajouter des rôles';
  renderCraftRoles();
  document.getElementById('epreuve-editor').scrollIntoView({behavior:'smooth', block:'center'});
}

function closeEpreuveEditor(){
  document.getElementById('epreuve-editor').style.display = 'none';
  craftRolesDraft = [];
}

function buildEpreuveFromForm(){
  const title = document.getElementById('game-title').value.trim();
  const rules = document.getElementById('game-rules').value.trim();
  if(!title){ toast('Donne un titre à l\'épreuve !'); return null; }
  if(!rules){ toast('Ajoute les règles et objectifs !'); return null; }
  const id = document.getElementById('editor-id').value || (String(Date.now())+Math.floor(Math.random()*1000));
  const reward = Math.max(0, parseInt(document.getElementById('game-reward').value)||0);
  return { id, title, rules, reward, craftRoles: harvestCraftRoles() };
}

function saveEpreuve(){
  const ep = buildEpreuveFromForm();
  if(!ep) return;
  fbSaveEpreuve(ep);
  closeEpreuveEditor();
  toast('💾 Épreuve enregistrée !');
}

function saveAndLaunch(){
  const ep = buildEpreuveFromForm();
  if(!ep) return;
  fbSaveEpreuve(ep);
  fbSetGame(ep);
  closeEpreuveEditor();
  toast('🏕️ Épreuve lancée !');
}

// ── LIBRARY ─────────────────────────────────────────────────────────────────
function renderLibrary(){
  const el = document.getElementById('library-list');
  if(!el) return;
  const q = (document.getElementById('search-epreuves')?.value||'').toLowerCase();
  const list = Object.values(library).filter(ep => ep && ep.title && ep.title.toLowerCase().includes(q));
  if(!list.length){
    el.innerHTML = '<div class="empty-state">'+(q?'Aucune épreuve trouvée':'Aucune épreuve enregistrée')+'</div>';
    return;
  }
  el.innerHTML = list.map(ep => {
    const roleCount = (ep.craftRoles||[]).length;
    const isActive = activeGame && String(activeGame.id)===String(ep.id);
    return `<div class="f-list-row">
      <div class="u-flex1-minw0">
        <div class="f-list-title">${escHtml(ep.title)}${isActive?' <span style=\'color:var(--success);font-size:.875rem\'>● en cours</span>':''}</div>
        <div class="t-warm">🔥 +${ep.reward??0} pts${roleCount?' · ⚗️ '+roleCount+' rôle'+(roleCount>1?'s':''):''}</div>
      </div>
      <button class="btn-small" onclick="launchFromLibrary('${escAttr(String(ep.id))}')" class="badge-success">▶ Lancer</button>
      <button class="btn-small" onclick="editFromLibrary('${escAttr(String(ep.id))}')" class="badge-metier">✎</button>
      <button class="btn-delete" onclick="deleteFromLibrary('${escAttr(String(ep.id))}')" title="Supprimer">✕</button>
    </div>`;
  }).join('');
}

function launchFromLibrary(id){
  const ep = library[id] || Object.values(library).find(e=>String(e.id)===String(id));
  if(!ep){ toast('Épreuve introuvable'); return; }
  fbSetGame(JSON.parse(JSON.stringify(ep)));
  toast('🏕️ « '+ep.title+' » lancée !');
}

function editFromLibrary(id){
  const ep = library[id] || Object.values(library).find(e=>String(e.id)===String(id));
  if(ep) openEpreuveEditor(ep);
}

function deleteFromLibrary(id){
  if(!confirm('Supprimer cette épreuve de la bibliothèque ?')) return;
  fbDeleteEpreuve(id);
  toast('Épreuve supprimée.');
}

// ── ÉPREUVE EN COURS ────────────────────────────────────────────────────────
function editActiveEpreuve(){
  if(activeGame) openEpreuveEditor(activeGame);
}

function finishEpreuveSuccess(){
  const reward = activeGame ? (activeGame.reward||0) : 0;
  const newFire = Object.assign({}, fire, { points: (fire.points||0) + reward });
  fbSetFire(newFire);
  fbSetGame(null);
  toast('✅ Épreuve réussie ! +'+reward+' pts au feu');
}

function finishEpreuve(){
  fbSetGame(null);
  toast('Épreuve terminée (objets et feu conservés).');
}

function updateGameUI(){
  const card = document.getElementById('active-epreuve-card');
  if(!card) return;
  if(activeGame){
    card.style.display = 'block';
    document.getElementById('active-epreuve-title').textContent = activeGame.title;
    document.getElementById('active-epreuve-reward').textContent = '🔥 Récompense : +'+(activeGame.reward||0)+' points si réussie';
    document.getElementById('reward-hint').textContent = '(+'+(activeGame.reward||0)+' pts)';
  } else {
    card.style.display = 'none';
  }
  renderLibrary();
}

// ── CRAFT BUILDER ─────────────────────────────────────────────────────────
function toggleCraftSection(){
  craftSectionOpen = !craftSectionOpen;
  document.getElementById('craft-section').style.display = craftSectionOpen?'block':'none';
  document.getElementById('craft-toggle-btn').textContent = craftSectionOpen?'− Masquer':'+ Ajouter des rôles';
  if(craftSectionOpen && craftRolesDraft.length===0) addCraftRole();
}

function addCraftRole(){
  const id = Date.now();
  craftRolesDraft.push({ id, name:'', recipes:[] });
  addCraftRecipe(id);
  renderCraftRoles();
}

function removeCraftRole(roleId){
  craftRolesDraft = craftRolesDraft.filter(r=>r.id!==roleId);
  renderCraftRoles();
}

function addCraftRecipe(roleId){
  const role = craftRolesDraft.find(r=>r.id===roleId);
  if(!role) return;
  role.recipes.push({ id:Date.now()+Math.random(), output:'', cost:[{name:'',qty:1}] });
  renderCraftRoles();
}

function removeCraftRecipe(roleId,recipeId){
  const role = craftRolesDraft.find(r=>r.id===roleId);
  if(role) role.recipes = role.recipes.filter(r=>r.id!==recipeId);
  renderCraftRoles();
}

function addCraftCost(roleId,recipeId){
  const role   = craftRolesDraft.find(r=>r.id===roleId);
  const recipe = role && role.recipes.find(r=>r.id===recipeId);
  if(recipe){ recipe.cost.push({name:'',qty:1}); renderCraftRoles(); }
}

function removeCraftCost(roleId,recipeId,ci){
  const role   = craftRolesDraft.find(r=>r.id===roleId);
  const recipe = role && role.recipes.find(r=>r.id===recipeId);
  if(recipe){ recipe.cost.splice(ci,1); renderCraftRoles(); }
}

function syncCraftField(roleId,field,value){ const r=craftRolesDraft.find(r=>r.id===roleId); if(r) r[field]=value; }
function syncRecipeField(roleId,recipeId,field,value){ const role=craftRolesDraft.find(r=>r.id===roleId); const rc=role&&role.recipes.find(r=>r.id===recipeId); if(rc) rc[field]=value; }
function syncCostField(roleId,recipeId,ci,field,value){
  const role=craftRolesDraft.find(r=>r.id===roleId);
  const rc=role&&role.recipes.find(r=>r.id===recipeId);
  if(rc&&rc.cost[ci]) rc.cost[ci][field]=field==='qty'?Math.max(1,parseInt(value)||1):value;
}

function renderCraftRoles(){
  const el=document.getElementById('craft-roles-list');
  if(!el) return;
  el.innerHTML = craftRolesDraft.map(role=>`
    <div class="craft-role-builder">
      <div class="craft-role-header">
        <span class="u-icon">🎭</span>
        <input class="craft-role-name-input" placeholder="Nom du rôle (ex: Forgeron)" value="${escHtml(role.name)}" oninput="syncCraftField(${role.id},'name',this.value)">
        <button class="btn-icon" onclick="removeCraftRole(${role.id})">✕</button>
      </div>
      <div class="f-caption-metier">Recettes — Ressources consommées → Objet fabriqué</div>
      ${role.recipes.map(rc=>`
        <div class="craft-recipe-block">
          <div class="f-empty">Coûts :</div>
          ${rc.cost.map((c,ci)=>`
            <div class="craft-recipe-row">
              <input class="craft-input" placeholder="Ressource (ex: Bois)" value="${escHtml(c.name)}" oninput="syncCostField(${role.id},${rc.id},${ci},'name',this.value)">
              <input class="craft-qty-input" type="number" min="1" value="${c.qty}" oninput="syncCostField(${role.id},${rc.id},${ci},'qty',this.value)">
              <button class="btn-icon" onclick="removeCraftCost(${role.id},${rc.id},${ci})" ${rc.cost.length<=1?'disabled':''}>−</button>
            </div>`).join('')}
          <button class="btn-add-recipe" onclick="addCraftCost(${role.id},${rc.id})">+ ajouter une ressource</button>
          <div class="craft-output-row u-mt-sm">
            <span class="craft-arrow">→ Fabrique :</span>
            <input class="craft-input u-flex1" placeholder="Nom de l'objet fabriqué" value="${escHtml(rc.output)}" oninput="syncRecipeField(${role.id},${rc.id},'output',this.value)">
            <button class="btn-icon" onclick="removeCraftRecipe(${role.id},${rc.id})">✕</button>
          </div>
        </div>`).join('')}
      <button class="btn-add-recipe" onclick="addCraftRecipe(${role.id})">+ Ajouter une recette</button>
    </div>`).join('');
}


// ── FIRE (global, permanent, points-based) ──────────────────────────────────
function fireTier(points){
  if(points >= (fire.legendaire||120)) return 'legendaire';
  if(points >= (fire.grand||50)) return 'grand';
  return 'petit';
}

function renderFireMeter(){
  const el = document.getElementById('viewer-fire-meter');
  if(!el) return;
  const points = fire.points||0;
  const tier = fireTier(points);
  const visuals = { petit:'🔥', grand:'🔥🔥', legendaire:'🔥🔥🔥' };
  const labels  = { petit:'Petit feu', grand:'Grand feu', legendaire:'Feu Légendaire ✨' };
  document.getElementById('fire-visual').textContent = visuals[tier];
  const lab = document.getElementById('fire-tier-label');
  lab.textContent = labels[tier];
  lab.className = 'fire-tier-label fire-tier-' + tier;
  document.getElementById('fire-count').textContent = points + (points>1?' points':' point');
  const pct = Math.min(100, Math.round(points / (fire.legendaire||120) * 100));
  document.getElementById('fire-progress-bar').style.width = pct + '%';
  document.getElementById('fire-thresholds').innerHTML =
    '<span>0</span><span>🔥 '+(fire.grand||50)+'</span><span>✨ '+(fire.legendaire||120)+'</span>';
}

function renderAdminFire(){
  const pts = fire.points||0;
  const tier = fireTier(pts);
  const visuals = { petit:'🔥', grand:'🔥🔥', legendaire:'🔥🔥🔥' };
  const labels  = { petit:'Petit feu', grand:'Grand feu', legendaire:'Légendaire ✨' };
  const v=document.getElementById('admin-fire-visual'); if(v) v.textContent=visuals[tier];
  const t=document.getElementById('admin-fire-tier'); if(t){ t.textContent=labels[tier]; t.className=''; t.style.color = tier==='legendaire'?'var(--amber-bright)':tier==='grand'?'var(--amber-bright)':'var(--success)'; }
  const p=document.getElementById('admin-fire-points'); if(p) p.textContent=pts;
  const bar=document.getElementById('admin-fire-bar'); if(bar) bar.style.width = Math.min(100, Math.round(pts/(fire.legendaire||120)*100))+'%';
  // sync threshold inputs if not focused
  const g=document.getElementById('fire-threshold-grand');
  const l=document.getElementById('fire-threshold-legendaire');
  if(g && document.activeElement!==g) g.value = fire.grand||50;
  if(l && document.activeElement!==l) l.value = fire.legendaire||120;
}

function adjustFirePoints(delta){
  const newFire = Object.assign({}, fire, { points: Math.max(0, (fire.points||0)+delta) });
  fbSetFire(newFire);
}

function saveFireConfig(){
  const grand = Math.max(1, parseInt(document.getElementById('fire-threshold-grand').value)||50);
  const legendaire = Math.max(grand+1, parseInt(document.getElementById('fire-threshold-legendaire').value)||120);
  fbSetFire(Object.assign({}, fire, { grand, legendaire }));
}
