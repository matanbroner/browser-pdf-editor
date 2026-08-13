import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const fileInput = $('#fileInput');
const emptyFileInput = $('#emptyFileInput');
const imageInput = $('#imageInput');
const exportBtn = $('#exportBtn');
const pagesEl = $('#pages');
const thumbnailsEl = $('#thumbnails');
const thumbEmpty = $('#thumbEmpty');
const emptyState = $('#emptyState');
const viewer = $('#viewer');
const docMeta = $('#docMeta');
const pageCountStat = $('#pageCountStat');
const editCountStat = $('#editCountStat');
const inspectorTitle = $('#inspectorTitle');
const documentPanel = $('#documentPanel');
const selectionPanel = $('#selectionPanel');
const closeSelectionBtn = $('#closeSelectionBtn');
const selectedTextInput = $('#selectedText');
const fontSizeInput = $('#fontSize');
const textColorInput = $('#textColor');
const colorValue = $('#colorValue');
const opacityRange = $('#opacityRange');
const opacityValue = $('#opacityValue');
const posX = $('#posX');
const posY = $('#posY');
const itemWidth = $('#itemWidth');
const itemHeight = $('#itemHeight');
const textControls = $('#textControls');
const fontControls = $('#fontControls');
const opacityControl = $('#opacityControl');
const widthField = $('#widthField');
const heightField = $('#heightField');
const deleteBtn = $('#deleteBtn');
const replaceDialog = $('#replaceDialog');
const replaceForm = $('#replaceForm');
const originalTextInput = $('#originalText');
const replacementTextInput = $('#replacementText');
const cancelReplace = $('#cancelReplace');
const undoBtn = $('#undoBtn');
const redoBtn = $('#redoBtn');
const zoomOutBtn = $('#zoomOutBtn');
const zoomInBtn = $('#zoomInBtn');
const zoomLabel = $('#zoomLabel');
const toast = $('#toast');

let sourceBytes = null;
let sourceName = 'document.pdf';
let pdfjsDoc = null;
let currentTool = 'select';
let selectedEditId = null;
let pendingReplacement = null;
let nextId = 1;
let zoom = 1;
let history = [];
let historyIndex = -1;
let suppressHistory = false;
let imageDraft = null;
const edits = [];

const cloneEdits = () => JSON.parse(JSON.stringify(edits));

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 1800);
}

function hexToRgb01(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function pushHistory() {
  if (suppressHistory) return;
  history = history.slice(0, historyIndex + 1);
  history.push(cloneEdits());
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function resetHistory() {
  history = [cloneEdits()];
  historyIndex = 0;
  updateHistoryButtons();
}

function restoreSnapshot(snapshot) {
  suppressHistory = true;
  edits.splice(0, edits.length, ...JSON.parse(JSON.stringify(snapshot)));
  nextId = Math.max(1, ...edits.map(e => e.id + 1));
  selectedEditId = null;
  renderAllEdits();
  updateInspector();
  updateStats();
  suppressHistory = false;
}

function updateHistoryButtons() {
  undoBtn.disabled = historyIndex <= 0;
  redoBtn.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  restoreSnapshot(history[historyIndex]);
  updateHistoryButtons();
}
function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  restoreSnapshot(history[historyIndex]);
  updateHistoryButtons();
}
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

function setTool(tool) {
  currentTool = tool;
  document.body.className = document.body.className.replace(/tool-\S+/g, '').trim();
  document.body.classList.add(`tool-${tool}`);
  $$('.tool[data-tool]').forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));
  if (tool !== 'select') selectEdit(null);
}
$$('.tool[data-tool]').forEach(btn => btn.addEventListener('click', () => setTool(btn.dataset.tool)));

function updateStats() {
  pageCountStat.textContent = pdfjsDoc?.numPages ?? '—';
  editCountStat.textContent = edits.length;
}

function setZoom(value) {
  zoom = Math.max(.6, Math.min(1.8, Math.round(value * 10) / 10));
  pagesEl.style.zoom = String(zoom);
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}
zoomOutBtn.addEventListener('click', () => setZoom(zoom - .1));
zoomInBtn.addEventListener('click', () => setZoom(zoom + .1));
zoomLabel.addEventListener('click', () => setZoom(1));

async function loadPdf(file) {
  if (!file) return;
  try {
    sourceName = file.name || 'document.pdf';
    sourceBytes = new Uint8Array(await file.arrayBuffer());
    pdfjsDoc = await pdfjsLib.getDocument({ data: sourceBytes.slice() }).promise;
    edits.length = 0; nextId = 1; selectedEditId = null;
    pagesEl.replaceChildren(); thumbnailsEl.replaceChildren();
    emptyState.classList.add('hidden'); thumbEmpty.classList.add('hidden');
    docMeta.textContent = `${sourceName} · ${pdfjsDoc.numPages} page${pdfjsDoc.numPages === 1 ? '' : 's'}`;
    exportBtn.disabled = true;
    for (let n = 1; n <= pdfjsDoc.numPages; n++) await renderPage(n);
    resetHistory(); updateStats(); updateInspector(); exportBtn.disabled = false;
    showToast('PDF ready to edit');
  } catch (err) {
    console.error(err);
    showToast('Could not open this PDF');
  }
}
fileInput.addEventListener('change', () => loadPdf(fileInput.files?.[0]));
emptyFileInput.addEventListener('change', () => loadPdf(emptyFileInput.files?.[0]));

async function renderPage(pageNum) {
  const page = await pdfjsDoc.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  const displayScale = Math.min(1.32, Math.max(.9, 760 / base.width));
  const viewport = page.getViewport({ scale: displayScale });
  const shell = document.createElement('div');
  shell.className = 'page-shell';
  Object.assign(shell.dataset, { page: String(pageNum - 1), scale: String(displayScale), pdfWidth: String(base.width), pdfHeight: String(base.height) });
  shell.style.width = `${viewport.width}px`; shell.style.height = `${viewport.height}px`;

  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
  const hitLayer = document.createElement('div'); hitLayer.className = 'text-hit-layer';
  const overlay = document.createElement('div'); overlay.className = 'overlay';
  shell.append(canvas, hitLayer, overlay); pagesEl.append(shell);

  await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport, transform: dpr === 1 ? null : [dpr,0,0,dpr,0,0] }).promise;
  await buildTextHitLayer(page, shell, viewport, base, displayScale);
  await renderThumbnail(page, pageNum);
  shell.addEventListener('pointerdown', e => handlePagePointerDown(e, shell));
}

async function renderThumbnail(page, pageNum) {
  const base = page.getViewport({ scale: 1 });
  const scale = 120 / base.width;
  const vp = page.getViewport({ scale });
  const wrap = document.createElement('div'); wrap.className = 'thumb'; wrap.dataset.page = String(pageNum - 1);
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width * 1.5); c.height = Math.ceil(vp.height * 1.5);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: [1.5,0,0,1.5,0,0] }).promise;
  const label = document.createElement('div'); label.className = 'thumb-label'; label.textContent = pageNum;
  wrap.append(c, label); thumbnailsEl.append(wrap);
  wrap.addEventListener('click', () => pagesEl.querySelector(`[data-page="${pageNum - 1}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function buildTextHitLayer(page, shell, viewport, base, scale) {
  const content = await page.getTextContent();
  const layer = shell.querySelector('.text-hit-layer');
  for (const item of content.items) {
    if (!item.str?.trim()) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    const width = Math.max(2, item.width * scale);
    const left = tx[4], top = tx[5] - fontHeight;
    const el = document.createElement('span');
    el.className = 'text-hit'; el.textContent = item.str; el.title = item.str;
    Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${Math.max(fontHeight,4)}px`, fontSize: `${fontHeight}px` });
    const angle = Math.atan2(tx[1], tx[0]); if (Math.abs(angle) > .001) el.style.transform = `rotate(${angle}rad)`;
    el.addEventListener('click', e => {
      if (currentTool !== 'replace') return;
      e.stopPropagation();
      const h = Math.max(fontHeight / scale, 4);
      pendingReplacement = { pageIndex: Number(shell.dataset.page), original: item.str, x: left / scale, y: base.height - top / scale - h, width: width / scale, height: h, fontSize: Math.max(6, h * .86) };
      originalTextInput.value = item.str; replacementTextInput.value = item.str;
      replaceDialog.classList.remove('hidden'); setTimeout(() => replacementTextInput.select(), 0);
    });
    layer.append(el);
  }
}

function pointInPdf(event, shell) {
  const rect = shell.getBoundingClientRect();
  const scale = Number(shell.dataset.scale) * zoom;
  const pdfH = Number(shell.dataset.pdfHeight);
  return { x: (event.clientX - rect.left) / scale, y: pdfH - (event.clientY - rect.top) / scale, scale };
}

function handlePagePointerDown(event, shell) {
  if (event.target.closest('.edit-item') || currentTool === 'select' || currentTool === 'replace') return;
  const pageIndex = Number(shell.dataset.page);
  const start = pointInPdf(event, shell);
  if (currentTool === 'add') {
    const edit = { id: nextId++, type: 'text', pageIndex, x: start.x, y: start.y - 18, width: 160, height: 24, text: 'New text', fontSize: Number(fontSizeInput.value) || 18, color: textColorInput.value, opacity: 1 };
    edits.push(edit); pushHistory(); renderAllEdits(); selectEdit(edit.id); setTool('select'); return;
  }
  if (imageDraft) return;
  const type = currentTool;
  const edit = { id: nextId++, type, pageIndex, x: start.x, y: start.y, width: 1, height: 1, color: type === 'highlight' ? '#ffd84d' : type === 'redact' ? '#111111' : '#5b5bd6', opacity: type === 'highlight' ? .42 : 1 };
  edits.push(edit); renderEdit(edit);
  const move = e => {
    const p = pointInPdf(e, shell);
    edit.x = Math.min(start.x, p.x); edit.y = Math.min(start.y, p.y);
    edit.width = Math.max(1, Math.abs(p.x - start.x)); edit.height = Math.max(1, Math.abs(p.y - start.y));
    syncEditElement(edit);
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); pushHistory(); selectEdit(edit.id); setTool('select'); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}

$('#imageToolBtn').addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', async () => {
  const file = imageInput.files?.[0]; if (!file || !pdfjsDoc) return;
  const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
  imageDraft = { dataUrl, mime: file.type };
  setTool('image');
  $$('.page-shell').forEach(shell => {
    const once = e => {
      if (!imageDraft) return;
      const p = pointInPdf(e, shell); const pageIndex = Number(shell.dataset.page);
      const edit = { id: nextId++, type: 'image', pageIndex, x: p.x, y: p.y - 90, width: 130, height: 90, opacity: 1, dataUrl: imageDraft.dataUrl, mime: imageDraft.mime };
      edits.push(edit); imageDraft = null; pushHistory(); renderAllEdits(); selectEdit(edit.id); setTool('select');
    };
    shell.addEventListener('click', once, { once: true });
  });
  showToast('Click a page to place the image');
});

function renderAllEdits() {
  $$('.overlay').forEach(o => o.replaceChildren());
  edits.forEach(renderEdit);
}

function renderEdit(edit) {
  const shell = pagesEl.querySelector(`.page-shell[data-page="${edit.pageIndex}"]`); if (!shell) return;
  const scale = Number(shell.dataset.scale), pdfH = Number(shell.dataset.pdfHeight), overlay = shell.querySelector('.overlay');
  const el = document.createElement('div'); el.className = 'edit-item'; el.dataset.editId = String(edit.id); el.dataset.type = edit.type;
  if (['text','replace'].includes(edit.type)) {
    el.classList.add('text-item'); el.textContent = edit.text;
    el.style.fontSize = `${edit.fontSize * scale}px`; el.style.color = edit.color; el.style.width = `${Math.max(edit.width || 10, 10) * scale}px`;
    if (edit.type === 'replace') el.style.background = 'white';
  } else if (edit.type === 'image') {
    el.classList.add('image-item'); const img = document.createElement('img'); img.src = edit.dataUrl; el.append(img);
  } else {
    el.classList.add('shape-item');
    if (edit.type === 'rectangle') { el.style.border = `${Math.max(1, scale)}px solid ${edit.color}`; el.style.background = 'transparent'; }
    else el.style.background = edit.color;
  }
  el.style.pointerEvents = 'auto';
  overlay.append(el); syncEditElement(edit); attachDrag(el, edit, scale);
  el.addEventListener('click', e => { if (currentTool === 'select') { e.stopPropagation(); selectEdit(edit.id); } });
}

function syncEditElement(edit) {
  const shell = pagesEl.querySelector(`.page-shell[data-page="${edit.pageIndex}"]`), el = shell?.querySelector(`[data-edit-id="${edit.id}"]`); if (!shell || !el) return;
  const scale = Number(shell.dataset.scale), pdfH = Number(shell.dataset.pdfHeight);
  const h = edit.height || edit.fontSize || 18;
  el.style.left = `${edit.x * scale}px`; el.style.top = `${(pdfH - edit.y - h) * scale}px`;
  el.style.width = `${Math.max(edit.width || 10, 1) * scale}px`; el.style.height = `${Math.max(h, 1) * scale}px`; el.style.opacity = String(edit.opacity ?? 1);
  if (['text','replace'].includes(edit.type)) { el.textContent = edit.text; el.style.fontSize = `${edit.fontSize * scale}px`; el.style.color = edit.color; el.style.height = 'auto'; }
  else if (edit.type === 'rectangle') el.style.borderColor = edit.color;
  else if (edit.type !== 'image') el.style.background = edit.color;
  el.classList.toggle('selected', edit.id === selectedEditId);
}

function attachDrag(el, edit, scale) {
  let drag = null;
  el.addEventListener('pointerdown', e => {
    if (currentTool !== 'select') return; e.stopPropagation(); selectEdit(edit.id); el.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, ex: edit.x, ey: edit.y };
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return; edit.x = Math.max(0, drag.ex + (e.clientX - drag.x) / (scale * zoom)); edit.y = Math.max(0, drag.ey - (e.clientY - drag.y) / (scale * zoom)); syncEditElement(edit); updateInspectorFields(edit);
  });
  el.addEventListener('pointerup', () => { if (drag) pushHistory(); drag = null; });
}

function selectEdit(id) {
  selectedEditId = id;
  $$('.edit-item').forEach(el => el.classList.toggle('selected', Number(el.dataset.editId) === id));
  updateInspector();
}

function updateInspector() {
  const edit = edits.find(e => e.id === selectedEditId);
  const has = !!edit;
  documentPanel.classList.toggle('hidden', has); selectionPanel.classList.toggle('hidden', !has); closeSelectionBtn.classList.toggle('hidden', !has);
  inspectorTitle.textContent = has ? ({ text:'Text', replace:'Replacement text', image:'Image', highlight:'Highlight', redact:'Redaction', rectangle:'Rectangle' }[edit.type] || 'Selection') : 'Document';
  if (!has) return;
  const isText = ['text','replace'].includes(edit.type), hasSize = ['image','highlight','redact','rectangle'].includes(edit.type);
  textControls.classList.toggle('hidden', !isText); fontControls.classList.toggle('hidden', !isText); widthField.classList.toggle('hidden', !hasSize && !isText); heightField.classList.toggle('hidden', !hasSize);
  selectedTextInput.value = edit.text || ''; fontSizeInput.value = Math.round(edit.fontSize || 18); textColorInput.value = edit.color || '#111827'; colorValue.textContent = (edit.color || '#111827').toUpperCase();
  opacityRange.value = Math.round((edit.opacity ?? 1) * 100); opacityValue.textContent = `${opacityRange.value}%`; updateInspectorFields(edit);
}

function updateInspectorFields(edit) {
  posX.value = Math.round(edit.x); posY.value = Math.round(edit.y); itemWidth.value = Math.round(edit.width || 0); itemHeight.value = Math.round(edit.height || 0);
}
closeSelectionBtn.addEventListener('click', () => selectEdit(null));

function mutateSelected(mutator, push = true) {
  const edit = edits.find(e => e.id === selectedEditId); if (!edit) return;
  mutator(edit); syncEditElement(edit); updateInspector(); if (push) pushHistory();
}
selectedTextInput.addEventListener('change', () => mutateSelected(e => e.text = selectedTextInput.value));
selectedTextInput.addEventListener('input', () => mutateSelected(e => e.text = selectedTextInput.value, false));
fontSizeInput.addEventListener('change', () => mutateSelected(e => e.fontSize = Math.max(6, Number(fontSizeInput.value) || e.fontSize)));
textColorInput.addEventListener('input', () => { colorValue.textContent = textColorInput.value.toUpperCase(); mutateSelected(e => e.color = textColorInput.value, false); });
textColorInput.addEventListener('change', () => pushHistory());
opacityRange.addEventListener('input', () => { opacityValue.textContent = `${opacityRange.value}%`; mutateSelected(e => e.opacity = Number(opacityRange.value) / 100, false); });
opacityRange.addEventListener('change', () => pushHistory());
posX.addEventListener('change', () => mutateSelected(e => e.x = Number(posX.value) || 0));
posY.addEventListener('change', () => mutateSelected(e => e.y = Number(posY.value) || 0));
itemWidth.addEventListener('change', () => mutateSelected(e => e.width = Math.max(1, Number(itemWidth.value) || 1)));
itemHeight.addEventListener('change', () => mutateSelected(e => e.height = Math.max(1, Number(itemHeight.value) || 1)));

deleteBtn.addEventListener('click', deleteSelected);
function deleteSelected() {
  const idx = edits.findIndex(e => e.id === selectedEditId); if (idx < 0) return;
  edits.splice(idx, 1); selectedEditId = null; renderAllEdits(); updateInspector(); updateStats(); pushHistory();
}

replaceForm.addEventListener('submit', e => {
  e.preventDefault(); if (!pendingReplacement) return;
  const r = pendingReplacement;
  const edit = { id: nextId++, type: 'replace', pageIndex: r.pageIndex, x: r.x, y: r.y, width: Math.max(r.width, 20), height: r.height, text: replacementTextInput.value, original: r.original, fontSize: r.fontSize, color: '#111827', opacity: 1 };
  edits.push(edit); pendingReplacement = null; replaceDialog.classList.add('hidden'); pushHistory(); renderAllEdits(); selectEdit(edit.id); updateStats(); setTool('select');
});
cancelReplace.addEventListener('click', () => { pendingReplacement = null; replaceDialog.classList.add('hidden'); setTool('select'); });
replaceDialog.addEventListener('click', e => { if (e.target === replaceDialog) cancelReplace.click(); });

viewer.addEventListener('scroll', () => {
  const shells = $$('.page-shell'); if (!shells.length) return;
  const y = viewer.getBoundingClientRect().top + 100;
  let current = shells[0];
  for (const shell of shells) if (shell.getBoundingClientRect().top <= y) current = shell;
  const page = current.dataset.page; $$('.thumb').forEach(t => t.classList.toggle('active', t.dataset.page === page));
});

function makeDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function dataUrlBytes(dataUrl) { return Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0)); }

exportBtn.addEventListener('click', async () => {
  if (!sourceBytes) return; exportBtn.disabled = true; exportBtn.textContent = 'Exporting…';
  try {
    const out = await PDFDocument.load(sourceBytes.slice()); const font = await out.embedFont(StandardFonts.Helvetica); const pages = out.getPages();
    for (const edit of edits) {
      const page = pages[edit.pageIndex]; if (!page) continue; const c = hexToRgb01(edit.color || '#111111'); const opacity = edit.opacity ?? 1;
      if (edit.type === 'replace') page.drawRectangle({ x: edit.x - 1, y: edit.y - 1, width: edit.width + 2, height: Math.max(edit.height + 2, edit.fontSize * 1.15), color: rgb(1,1,1), borderWidth: 0 });
      if (['text','replace'].includes(edit.type)) page.drawText(edit.text || '', { x: edit.x, y: edit.y, size: edit.fontSize, font, color: rgb(c.r,c.g,c.b), opacity, lineHeight: edit.fontSize * 1.18, maxWidth: Math.max(1, edit.width || page.getWidth() - edit.x - 8) });
      else if (edit.type === 'highlight' || edit.type === 'redact') page.drawRectangle({ x: edit.x, y: edit.y, width: edit.width, height: edit.height, color: rgb(c.r,c.g,c.b), opacity, borderWidth: 0 });
      else if (edit.type === 'rectangle') page.drawRectangle({ x: edit.x, y: edit.y, width: edit.width, height: edit.height, borderColor: rgb(c.r,c.g,c.b), borderWidth: 1.5, opacity });
      else if (edit.type === 'image') {
        const bytes = await dataUrlBytes(edit.dataUrl); const image = edit.mime === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        page.drawImage(image, { x: edit.x, y: edit.y, width: edit.width, height: edit.height, opacity });
      }
    }
    const bytes = await out.save(); const base = sourceName.replace(/\.pdf$/i, ''); makeDownload(bytes, `${base}-edited.pdf`); showToast('Export complete');
  } catch (err) { console.error(err); showToast(`Export failed: ${err.message || err}`); }
  finally { exportBtn.disabled = false; exportBtn.textContent = 'Export PDF'; }
});

window.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEditId && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); deleteSelected(); }
  if (e.key === 'Escape') { selectEdit(null); if (!replaceDialog.classList.contains('hidden')) cancelReplace.click(); }
});

setTool('select'); setZoom(1); updateInspector(); updateStats(); updateHistoryButtons();
