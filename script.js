let idCounter = 1;
const newId = () => 'id' + (idCounter++);

const state = {
  template: 'serif',
  accent: 'burgundy',

  contact: {
    name: '',
    title: '',
    email: '',
    phone: '',
    location: '',
    website: ''
  },

  summary: '',
  objective: '',

  experience: [],
  projects: [],
  education: [],
  skillGroups: [],

  loading: new Set(),
  error: ''
};

function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function setField(field, value){
  const parts = field.split('.');
  if(parts[0]==='contact'){ state.contact[parts[1]] = value; }
  else if(parts[0]==='summary'){ state.summary = value; }
  else if(parts[0]==='objective'){ state.objective = value; }
  else if(parts[0]==='exp'){
    const exp = state.experience.find(x=>x.id===parts[1]);
    if(!exp) return;
    if(parts[2]==='bullet'){ exp.bullets[parseInt(parts[3],10)] = value; }
    else{ exp[parts[2]] = value; }
  } else if(parts[0]==='edu'){
    const edu = state.education.find(x=>x.id===parts[1]);
    if(!edu) return;
    edu[parts[2]] = value;
  } else if(parts[0]==='proj'){
    const proj = state.projects.find(x=>x.id===parts[1]);
    if(!proj) return;
    proj[parts[2]] = value;
  } else if(parts[0]==='skillgrp'){
    const grp = state.skillGroups.find(x=>x.id===parts[1]);
    if(!grp) return;
    grp[parts[2]] = value;
  }
}

/* ---------------- AI ---------------- */
async function askClaude(prompt) {
  const res = await fetch("/.netlify/functions/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt
    })
  });

  let data;

  try {
    data = await res.json();
  } catch (error) {
    throw new Error("AI service returned an invalid response.");
  }

  if (!res.ok) {
    throw new Error(
      data?.error ||
      `AI request failed (${res.status})`
    );
  }

  const text = String(data?.text || "").trim();

  if (!text) {
    throw new Error("Empty response from the AI service.");
  }

  return text.replace(/^["']|["']$/g, "");
}

async function withLoading(key, fn){
  state.loading.add(key);
  state.error = '';
  renderAll();
  try{
    await fn();
  }catch(err){
    state.error = err.message || 'Something went wrong. Please try again.';
  }finally{
    state.loading.delete(key);
    renderAll();
  }
}

async function enhanceBullet(expId, idx){
  const key = 'bullet-'+expId+'-'+idx;
  const exp = state.experience.find(x=>x.id===expId);
  const original = exp.bullets[idx];
  if(!original || !original.trim()){ state.error = 'Write a bullet first, then enhance it.'; renderAll(); return; }
  await withLoading(key, async () => {
    const prompt = `You are an expert resume writer. Rewrite the following resume bullet point so it is concise (under 25 words), starts with a strong action verb, and reads like a real accomplishment. Return ONLY the rewritten bullet, no quotes, no preamble.\n\nRole: ${exp.role||'(unspecified role)'} at ${exp.company||'(unspecified company)'}\nOriginal bullet: "${original}"`;
    const result = await askClaude(prompt);
    exp.bullets[idx] = result;
  });
}

async function suggestBullets(expId){
  const key = 'suggest-'+expId;
  const exp = state.experience.find(x=>x.id===expId);
  if(!exp.role || !exp.role.trim()){ state.error = 'Add a job title first so the suggestions fit the role.'; renderAll(); return; }
  await withLoading(key, async () => {
    const prompt = `You are an expert resume writer. Based on the job title and company below, write 3 strong, realistic resume bullet points for this role. Each under 25 words, starting with an action verb. Return ONLY the 3 bullets, one per line, no numbering or bullet symbols.\n\nJob title: ${exp.role}\nCompany: ${exp.company||'(unspecified company)'}`;
    const result = await askClaude(prompt);
    const lines = result.split('\n').map(l=>l.replace(/^[-•*\d.\s]+/,'').trim()).filter(Boolean);
    exp.bullets.push(...lines.slice(0,4));
  });
}

async function generateSummary(){
  await withLoading('summary-gen', async () => {
    const expList = state.experience.map(e => `${e.role||'role'} at ${e.company||'company'}`).join('; ') || 'no experience entered yet';
    const skillsList = state.skillGroups.map(g=>g.items).filter(Boolean).join(', ');
    const prompt = `You are an expert resume writer. Write a professional resume summary of 2-3 sentences (under 50 words total) for this candidate. No first person, no clichés like "hardworking team player". Return ONLY the summary text.\n\nTarget title: ${state.contact.title||'(unspecified)'}\nWork background: ${expList}\nSkills: ${skillsList||'(unspecified)'}`;
    state.summary = await askClaude(prompt);
  });
}

async function enhanceSummary(){
  if(!state.summary.trim()){ state.error = 'Write a draft summary first, then enhance it.'; renderAll(); return; }
  await withLoading('summary-enhance', async () => {
    const prompt = `Rewrite the following resume summary to be sharper and more specific, under 50 words, no first person. Return ONLY the rewritten summary, no quotes.\n\nOriginal: "${state.summary}"`;
    state.summary = await askClaude(prompt);
  });
}

async function enhanceObjective(){
  if(!state.objective.trim()){ state.error = 'Write a draft objective first, then enhance it.'; renderAll(); return; }
  await withLoading('objective-enhance', async () => {
    const prompt = `Rewrite the following resume career objective to be concise (under 40 words) and specific, in first person ("To..."), no clichés. Return ONLY the rewritten text, no quotes.\n\nOriginal: "${state.objective}"`;
    state.objective = await askClaude(prompt);
  });
}

async function enhanceProjectDescription(projId){
  const key = 'proj-desc-'+projId;
  const proj = state.projects.find(x=>x.id===projId);
  if(!proj.name || !proj.name.trim()){ state.error = 'Add a project name first.'; renderAll(); return; }
  await withLoading(key, async () => {
    const prompt = proj.description && proj.description.trim()
      ? `You are an expert resume writer. Rewrite the following resume project description so it is concise (under 30 words), leads with what was built and its impact, and uses a strong action verb. Return ONLY the rewritten description, no quotes, no preamble.\n\nProject: ${proj.name}\nOriginal description: "${proj.description}"`
      : `You are an expert resume writer. Write a concise resume project description (under 30 words) for a project with this name, describing plausibly what it does and its impact. Use a strong action verb. Return ONLY the description, no quotes, no preamble.\n\nProject: ${proj.name}`;
    proj.description = await askClaude(prompt);
  });
}

/* ---------------- rendering: editor ---------------- */
function renderEditor(){
  const c = state.contact;
  const experienceHtml = state.experience.length ? state.experience.map(exp => `
    <div class="entry" data-exp-id="${exp.id}">
      <div class="entry-top"><button class="icon-btn" data-action="remove-exp" data-exp-id="${exp.id}" title="Remove">✕</button></div>
      <div class="row2">
        <label class="field">Job title
          <input type="text" data-field="exp.${exp.id}.role" value="${esc(exp.role)}" placeholder="Product Designer">
        </label>
        <label class="field">Company
          <input type="text" data-field="exp.${exp.id}.company" value="${esc(exp.company)}" placeholder="Acme Co.">
        </label>
      </div>
      <div class="row3">
        <label class="field">Location
          <input type="text" data-field="exp.${exp.id}.location" value="${esc(exp.location)}" placeholder="Remote">
        </label>
        <label class="field">Start
          <input type="text" data-field="exp.${exp.id}.start" value="${esc(exp.start)}" placeholder="Jan 2022">
        </label>
        <label class="field">End
          <input type="text" data-field="exp.${exp.id}.end" value="${esc(exp.end)}" placeholder="Present" ${exp.current?'disabled':''}>
        </label>
      </div>
      <label class="current-check">
        <input type="checkbox" data-action="toggle-current" data-exp-id="${exp.id}" ${exp.current?'checked':''}>
        I currently work here
      </label>
      <div class="bullets">
        ${exp.bullets.map((b,idx)=>`
          <div class="bullet-row">
            <input type="text" data-field="exp.${exp.id}.bullet.${idx}" value="${esc(b)}" placeholder="Led a redesign that cut onboarding time by 30%">
            <button class="wand-btn" data-action="enhance-bullet" data-exp-id="${exp.id}" data-idx="${idx}" ${state.loading.has('bullet-'+exp.id+'-'+idx)?'disabled':''}>
              ${state.loading.has('bullet-'+exp.id+'-'+idx) ? '<span class="spin"></span>' : '✦'} Enhance
            </button>
            <button class="icon-btn" data-action="remove-bullet" data-exp-id="${exp.id}" data-idx="${idx}" title="Remove">✕</button>
          </div>
        `).join('')}
      </div>
      <div class="ai-row">
        <button class="dashed-add" style="width:auto; flex:1;" data-action="add-bullet" data-exp-id="${exp.id}">+ Add bullet</button>
        <button class="wand-btn" data-action="suggest-bullets" data-exp-id="${exp.id}" ${state.loading.has('suggest-'+exp.id)?'disabled':''}>
          ${state.loading.has('suggest-'+exp.id) ? '<span class="spin"></span>' : '✦'} Suggest bullets with AI
        </button>
      </div>
    </div>
  `).join('') : `<div class="empty-note">No roles added yet. Add your most recent job to get started — the AI tools can help draft the bullets once the title's in.</div>`;

  const educationHtml = state.education.length ? state.education.map(edu => `
    <div class="entry" data-edu-id="${edu.id}">
      <div class="entry-top"><button class="icon-btn" data-action="remove-edu" data-edu-id="${edu.id}" title="Remove">✕</button></div>
      <label class="field">School
        <input type="text" data-field="edu.${edu.id}.school" value="${esc(edu.school)}" placeholder="State University">
      </label>
      <label class="field">Degree &amp; field
        <input type="text" data-field="edu.${edu.id}.degree" value="${esc(edu.degree)}" placeholder="B.S. Computer Science">
      </label>
      <div class="row2">
        <label class="field">Start
          <input type="text" data-field="edu.${edu.id}.start" value="${esc(edu.start)}" placeholder="2018">
        </label>
        <label class="field">End
          <input type="text" data-field="edu.${edu.id}.end" value="${esc(edu.end)}" placeholder="2022">
        </label>
      </div>
      <label class="field">Details (optional)
        <input type="text" data-field="edu.${edu.id}.details" value="${esc(edu.details)}" placeholder="Dean's List, GPA 3.8">
      </label>
    </div>
  `).join('') : `<div class="empty-note">No schools added yet.</div>`;

  const projectsHtml = state.projects.length ? state.projects.map(proj => `
    <div class="entry" data-proj-id="${proj.id}">
      <div class="entry-top"><button class="icon-btn" data-action="remove-proj" data-proj-id="${proj.id}" title="Remove">✕</button></div>
      <div class="row2">
        <label class="field">Project name
          <input type="text" data-field="proj.${proj.id}.name" value="${esc(proj.name)}" placeholder="Inventory Tracker">
        </label>
        <label class="field">Link
          <input type="text" data-field="proj.${proj.id}.link" value="${esc(proj.link)}" placeholder="github.com/you/project">
        </label>
      </div>
      <label class="field">Description
        <textarea data-field="proj.${proj.id}.description" rows="2" placeholder="What it does, what you built it with, and the result.">${esc(proj.description)}</textarea>
      </label>
      <div class="ai-row">
        <button class="wand-btn" data-action="enhance-proj-desc" data-proj-id="${proj.id}" ${state.loading.has('proj-desc-'+proj.id)?'disabled':''}>
          ${state.loading.has('proj-desc-'+proj.id) ? '<span class="spin"></span>' : '✦'} ${proj.description.trim() ? 'Enhance with AI' : 'Draft with AI'}
        </button>
      </div>
    </div>
  `).join('') : `<div class="empty-note">No projects added yet. Add a project name and the AI tool can help draft the description.</div>`;

  const skillGroupsHtml = state.skillGroups.length ? state.skillGroups.map(grp => `
    <div class="entry" data-skillgrp-id="${grp.id}">
      <div class="entry-top"><button class="icon-btn" data-action="remove-skillgrp" data-skillgrp-id="${grp.id}" title="Remove">✕</button></div>
      <div class="row2">
        <label class="field">Category (optional)
          <input type="text" data-field="skillgrp.${grp.id}.category" value="${esc(grp.category)}" placeholder="e.g. Frontend">
        </label>
        <label class="field">Skills (comma separated)
          <input type="text" data-field="skillgrp.${grp.id}.items" value="${esc(grp.items)}" placeholder="HTML5, CSS3, JavaScript">
        </label>
      </div>
    </div>
  `).join('') : `<div class="empty-note">No skill lines yet. Add one line per category — e.g. "Frontend" with "HTML5, CSS3, JavaScript" — or leave the category blank for a plain line.</div>`;

  document.getElementById('editor').innerHTML = `
    <div>
      <div class="section-head"><span class="section-mark"></span><h2>Contact</h2></div>
      <div class="contact-card">
        <div class="row2">
          <label class="field">Full name
            <input type="text" data-field="contact.name" value="${esc(c.name)}" placeholder="Jordan Rivera">
          </label>
          <label class="field">Target title
            <input type="text" data-field="contact.title" value="${esc(c.title)}" placeholder="Senior Product Designer">
          </label>
        </div>
        <div class="row2">
          <label class="field">Email
            <input type="email" data-field="contact.email" value="${esc(c.email)}" placeholder="jordan@email.com">
          </label>
          <label class="field">Phone
            <input type="text" data-field="contact.phone" value="${esc(c.phone)}" placeholder="(555) 123-4567">
          </label>
        </div>
        <div class="row2">
          <label class="field">Location
            <input type="text" data-field="contact.location" value="${esc(c.location)}" placeholder="Austin, TX">
          </label>
          <label class="field">Website / LinkedIn
            <input type="text" data-field="contact.website" value="${esc(c.website)}" placeholder="linkedin.com/in/jordanrivera">
          </label>
        </div>
      </div>
    </div>

    <div>
      <div class="section-head"><span class="section-mark"></span><h2>Summary</h2></div>
      <div class="contact-card">
        <label class="field">A few sentences on who you are and what you're looking for
          <textarea data-field="summary" rows="4" placeholder="Draft a sentence or two, or generate one with AI once your experience is filled in.">${esc(state.summary)}</textarea>
        </label>
        <div class="ai-row">
          <button class="wand-btn" data-action="generate-summary" ${state.loading.has('summary-gen')?'disabled':''}>
            ${state.loading.has('summary-gen') ? '<span class="spin"></span>' : '✦'} Generate with AI
          </button>
          <button class="wand-btn" data-action="enhance-summary" ${state.loading.has('summary-enhance')?'disabled':''}>
            ${state.loading.has('summary-enhance') ? '<span class="spin"></span>' : '✦'} Enhance draft
          </button>
        </div>
      </div>
    </div>

    <div>
      <div class="section-head"><span class="section-mark"></span><h2>Experience</h2></div>
      ${experienceHtml}
      <button class="dashed-add" data-action="add-exp">+ Add a role</button>
    </div>

    <div>
      <div class="section-head"><span class="section-mark"></span><h2>Projects</h2></div>
      ${projectsHtml}
      <button class="dashed-add" data-action="add-proj">+ Add a project</button>
    </div>

    <div>
      <div class="section-head"><span class="section-mark"></span><h2>Education</h2></div>
      ${educationHtml}
      <button class="dashed-add" data-action="add-edu">+ Add a school</button>
    </div>

    <div>
      <div class="section-head"><span class="section-mark"></span><h2>Skills</h2></div>
      ${skillGroupsHtml}
      <button class="dashed-add" data-action="add-skillgrp">+ Add a skill line</button>
    </div>

    <div>
      <div class="section-head"><span class="section-mark"></span><h2>Career Objective</h2></div>
      <div class="contact-card">
        <label class="field">What you're aiming for next
          <textarea data-field="objective" rows="3" placeholder="To obtain a role where I can...">${esc(state.objective)}</textarea>
        </label>
        <div class="ai-row">
          <button class="wand-btn" data-action="enhance-objective" ${state.loading.has('objective-enhance')?'disabled':''}>
            ${state.loading.has('objective-enhance') ? '<span class="spin"></span>' : '✦'} Enhance draft
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ---------------- rendering: preview ---------------- */
function renderPreview(){
  const c = state.contact;
  const paper = document.getElementById('paper');
  paper.className = 'paper ' + state.template;

  const contactBits = [c.email, c.phone, c.location, c.website].filter(Boolean);
  const contactHtml = contactBits.length
    ? `<div class="p-contact">${contactBits.map(esc).join('  —  ')}</div>` : '';

  const summaryHtml = state.summary.trim() ? `
    <hr class="p-rule">
    <div class="p-section">
      <h3>Profile</h3>
      <p class="p-summary" style="margin-top:0;">${esc(state.summary)}</p>
    </div>` : '';

  const expHtml = state.experience.length ? `
    <hr class="p-rule">
    <div class="p-section">
      <h3>Experience</h3>
      ${state.experience.map(e => `
        <div class="p-entry">
          <div class="p-entry-head">
            <span class="p-entry-role">${esc(e.role)||'<span class=&quot;p-placeholder&quot;>Job title</span>'}${e.company?` — ${esc(e.company)}`:''}</span>
            <span class="p-entry-date">${esc(e.start)}${(e.start||e.end||e.current)?' – ':''}${e.current?'Present':esc(e.end)}</span>
          </div>
          ${e.location?`<div class="p-entry-sub">${esc(e.location)}</div>`:''}
          ${e.bullets.filter(b=>b.trim()).length ? `<ul>${e.bullets.filter(b=>b.trim()).map(b=>`<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        </div>
      `).join('')}
    </div>` : '';

  const eduHtml = state.education.length ? `
    <hr class="p-rule">
    <div class="p-section">
      <h3>Education</h3>
      ${state.education.map(ed => `
        <div class="p-entry">
          <div class="p-entry-role">${esc(ed.degree)||'<span class=&quot;p-placeholder&quot;>Degree</span>'}${ed.school?` — ${esc(ed.school)}`:''}</div>
          ${(ed.start||ed.end)?`<div class="p-entry-sub">${esc(ed.start)}${(ed.start||ed.end)?' – ':''}${esc(ed.end)}</div>`:''}
          ${ed.details?`<div class="p-entry-details">${esc(ed.details)}</div>`:''}
        </div>
      `).join('')}
    </div>` : '';

  const skillsHtml = state.skillGroups.some(g=>g.items.trim()) ? `
    <hr class="p-rule">
    <div class="p-section">
      <h3>Technical Skills</h3>
      <div class="p-skills"><ul>${state.skillGroups.filter(g=>g.items.trim()).map(g=>
        `<li>${g.category.trim() ? `<strong>${esc(g.category)}:</strong> ` : ''}${esc(g.items)}</li>`
      ).join('')}</ul></div>
    </div>` : '';

  const projHtml = state.projects.length ? `
    <hr class="p-rule">
    <div class="p-section">
      <h3>Projects</h3>
      ${state.projects.map(p => `
        <div class="p-entry">
          <div class="p-entry-role">${esc(p.name)||'<span class=&quot;p-placeholder&quot;>Project name</span>'}</div>
          ${p.description ? `<ul><li>${esc(p.description)}</li></ul>` : ''}
          ${p.link ? `<div class="p-entry-link">Link - <a href="${/^https?:\/\//i.test(p.link)?esc(p.link):'https://'+esc(p.link)}" target="_blank" rel="noopener">${esc(p.link)}</a></div>` : ''}
        </div>
      `).join('')}
    </div>` : '';

  const objectiveHtml = state.objective.trim() ? `
    <hr class="p-rule">
    <div class="p-section">
      <h3>Career Objective</h3>
      <p class="p-summary" style="margin-top:0;">${esc(state.objective)}</p>
    </div>` : '';

  paper.innerHTML = `
    <div class="p-name">${c.name.trim() ? esc(c.name) : '<span class="p-placeholder">Your name</span>'}</div>
    ${c.title.trim() ? `<div class="p-title">${esc(c.title)}</div>` : ''}
    ${contactHtml}
    ${summaryHtml}
    ${expHtml}
    ${eduHtml}
    ${skillsHtml}
    ${projHtml}
    ${objectiveHtml}
  `;

  requestAnimationFrame(() => {
    const badge = document.getElementById('pageFitBadge');
    if(!badge) return;
    const h = paper.scrollHeight;
    if(h <= 890){
      badge.className = 'page-fit-badge ok';
      badge.textContent = '✓ Comfortably fits one page';
    } else {
      badge.className = 'page-fit-badge warn';
      badge.textContent = '⚠ Running long — worth trimming a bullet or two so it stays to one page';
    }
  });
}

function renderError(){
  const slot = document.getElementById('errorSlot');
  slot.innerHTML = state.error
    ? `<div class="error-banner"><span>${esc(state.error)}</span><button data-action="dismiss-error">✕</button></div>`
    : '';
}

function renderControls(){
  document.querySelectorAll('#templateSeg button').forEach(b=>{
    b.classList.toggle('active', b.dataset.template === state.template);
  });
  document.querySelectorAll('#accentSwatches .swatch').forEach(b=>{
    b.classList.toggle('active', b.dataset.accent === state.accent);
  });
  document.body.dataset.accent = state.accent;
}

function renderAll(){
  renderError();
  renderEditor();
  renderPreview();
  renderControls();
}

/* ---------------- event delegation ---------------- */
document.addEventListener('input', (e) => {
  const t = e.target;
  if(t.dataset && t.dataset.field){
    setField(t.dataset.field, t.value);
    renderPreview();
  }
});

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if(!t) return;
  const action = t.dataset.action;

  if(action === 'add-exp'){
    state.experience.push({ id:newId(), role:'', company:'', location:'', start:'', end:'', current:false, bullets:[''] });
    renderAll();
  } else if(action === 'remove-exp'){
    state.experience = state.experience.filter(x=>x.id!==t.dataset.expId);
    renderAll();
  } else if(action === 'add-bullet'){
    state.experience.find(x=>x.id===t.dataset.expId).bullets.push('');
    renderAll();
  } else if(action === 'remove-bullet'){
    const exp = state.experience.find(x=>x.id===t.dataset.expId);
    exp.bullets.splice(parseInt(t.dataset.idx,10),1);
    renderAll();
  } else if(action === 'enhance-bullet'){
    enhanceBullet(t.dataset.expId, parseInt(t.dataset.idx,10));
  } else if(action === 'suggest-bullets'){
    suggestBullets(t.dataset.expId);
  } else if(action === 'toggle-current'){
    const exp = state.experience.find(x=>x.id===t.dataset.expId);
    exp.current = t.checked;
    if(exp.current) exp.end = '';
    renderAll();
  } else if(action === 'add-proj'){
    state.projects.push({ id:newId(), name:'', link:'', description:'' });
    renderAll();
  } else if(action === 'remove-proj'){
    state.projects = state.projects.filter(x=>x.id!==t.dataset.projId);
    renderAll();
  } else if(action === 'enhance-proj-desc'){
    enhanceProjectDescription(t.dataset.projId);
  } else if(action === 'add-edu'){
    state.education.push({ id:newId(), school:'', degree:'', start:'', end:'', details:'' });
    renderAll();
  } else if(action === 'remove-edu'){
    state.education = state.education.filter(x=>x.id!==t.dataset.eduId);
    renderAll();
  } else if(action === 'add-skillgrp'){
    state.skillGroups.push({ id:newId(), category:'', items:'' });
    renderAll();
  } else if(action === 'remove-skillgrp'){
    state.skillGroups = state.skillGroups.filter(x=>x.id!==t.dataset.skillgrpId);
    renderAll();
  } else if(action === 'generate-summary'){
    generateSummary();
  } else if(action === 'enhance-summary'){
    enhanceSummary();
  } else if(action === 'enhance-objective'){
    enhanceObjective();
  } else if(action === 'dismiss-error'){
    state.error = '';
    renderAll();
  }
});

document.getElementById('templateSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-template]');
  if(!b) return;
  state.template = b.dataset.template;
  renderAll();
});

document.getElementById('accentSwatches').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-accent]');
  if(!b) return;
  state.accent = b.dataset.accent;
  renderAll();
});

document.getElementById('printBtn').addEventListener('click', () => window.print());

/* ---------------- seed with one empty entry each, then render ---------------- */
renderAll();
