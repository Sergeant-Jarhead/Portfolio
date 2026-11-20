// <pdf-slides src="file.pdf" gap="24"> — renders every page of a PDF as stacked, full-width slides (lazy, as they scroll into view).
(function () {
  if (customElements.get('pdf-slides')) return;
  // pdf.js 2.16 by default: 4.x hangs on some PowerPoint-exported PDFs. engine="3.11.174" for PDFs needing function-based shading.
  const libs = {}; let chain = Promise.resolve();
  const lib = (ver = '2.16.105') => libs[ver] || (libs[ver] = chain = chain.then(() => new Promise((res, rej) => {
    const V = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + ver + '/build/', prev = window.pdfjsLib;
    delete window.pdfjsLib;
    const s = document.createElement('script'); s.src = V + 'pdf.min.js';
    s.onload = () => { const L = window.pdfjsLib; L.GlobalWorkerOptions.workerSrc = V + 'pdf.worker.min.js'; if (prev) window.pdfjsLib = prev; res(L); };
    s.onerror = rej; document.head.appendChild(s);
  })));
  const LBL = 'font:700 12px ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#5f636b';
  class PdfSlides extends HTMLElement {
    static get observedAttributes() { return ['src', 'start', 'overlay', 'engine', 'lead', 'replace']; }
    connectedCallback() { Object.assign(this.style, { display: 'flex', flexDirection: 'column', gap: (this.getAttribute('gap') || 24) + 'px' }); this.load(); }
    attributeChangedCallback() { if (this.isConnected) this.load(); }
    disconnectedCallback() { this._io && this._io.disconnect(); this._tok = null; this._src = null; }
    async load() {
      const src = this.getAttribute('src');
      const st = +this.getAttribute('start') || 1, key = src + '#' + st + '#' + (this.getAttribute('engine') || '') + '#' + (this.getAttribute('lead') || '') + '#' + (this.getAttribute('replace') || '');
      if (!src || src.includes('{{') || src.includes('%7B') || key === this._src) return;
      this._src = key; const tok = this._tok = {};
      this.innerHTML = `<div style="padding:40px 0;${LBL}">Loading case study…</div>`;
      const parts = src.split(',').map(s => s.trim());
      if (parts.every(s => /\.(png|jpe?g|webp)$/i.test(s))) return this.loadImgs(parts, st);
      let doc;
      try {
        const eng = this.getAttribute('engine'), L = await lib(eng && !eng.includes('{{') ? eng : undefined), docs = await Promise.all(src.split(',').map(s => L.getDocument(s.trim()).promise));
        const map = []; docs.forEach(d => { for (let i = 1; i <= d.numPages; i++) map.push([d, i]); });
        doc = { numPages: map.length, getPage: n => map[n - 1][0].getPage(map[n - 1][1]) };
      }
      catch (e) { if (this._tok === tok) { this._src = null; this.innerHTML = `<div style="padding:40px 0;${LBL}">Couldn’t load this case study.</div>`; } return; }
      if (this._tok !== tok) return;
      const vp0 = (await doc.getPage(1)).getViewport({ scale: 1 }), ratio = vp0.height / vp0.width;
      this.innerHTML = '';
      this._io && this._io.disconnect();
      const draw = async box => {
        try {
          const ld = this.getAttribute('lead');
          if (ld && !ld.includes('{{') && +box.dataset.n === Math.min(st, doc.numPages)) {
            const im = document.createElement('img'); im.src = ld; im.alt = 'Cover'; im.decoding = 'async';
            Object.assign(im.style, { width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', margin: '-1px', display: 'block', objectFit: 'cover', flex: 'none' });
            im.onload = () => { box.innerHTML = ''; box.style.background = 'transparent'; box.appendChild(im); };
            return;
          }
          const rp = this.getAttribute('replace'), rm = rp && !rp.includes('{{') && rp.split(',').map(x => x.split('=')).find(x => +x[0] === +box.dataset.n);
          if (rm && /\.(png|jpe?g|webp)$/i.test(rm[1].trim())) {
            const im = document.createElement('img'); im.src = rm[1].trim(); im.alt = 'Slide ' + box.dataset.n; im.decoding = 'async';
            Object.assign(im.style, { width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', margin: '-1px', display: 'block', objectFit: 'cover', flex: 'none' });
            im.onload = () => { box.innerHTML = ''; box.style.background = 'transparent'; box.appendChild(im); };
            return;
          }
          if (rm) return this.htmlSlide(box, rm[1].trim());
          const page = await doc.getPage(+box.dataset.n);
          const w = box.clientWidth || 900, dpr = Math.min(2, devicePixelRatio || 1);
          const vp = page.getViewport({ scale: (w * dpr) / page.getViewport({ scale: 1 }).width });
          const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          Object.assign(c.style, { width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', margin: '-1px', display: 'block', flex: 'none' });
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          box.innerHTML = ''; box.style.background = 'transparent'; box.appendChild(c);
          const ov = this.getAttribute('overlay');
          if (ov && !ov.includes('{{') && +box.dataset.n > 1 && +box.dataset.n <= doc.numPages - 2) {
            const m = 'linear-gradient(90deg,#000 0%,rgba(0,0,0,.3) 6%,transparent 12%,transparent 88%,rgba(0,0,0,.3) 94%,#000 100%),linear-gradient(180deg,#000 0%,rgba(0,0,0,.3) 8%,transparent 15%,transparent 85%,rgba(0,0,0,.3) 92%,#000 100%)';
            const o = document.createElement('div');
            Object.assign(o.style, { position: 'absolute', inset: '0', pointerEvents: 'none', background: `url('${ov}') center/cover`, mixBlendMode: 'multiply', opacity: '.15', webkitMaskImage: m, maskImage: m });
            box.style.position = 'relative'; box.appendChild(o);
          }
        } catch (e) { box.firstChild && (box.firstChild.textContent = 'Couldn’t load this slide'); }
      };
      this._io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { this._io.unobserve(e.target); draw(e.target); } }), { rootMargin: '900px 0px' });
      for (let n = Math.min(st, doc.numPages); n <= doc.numPages; n++) {
        const box = document.createElement('div'); box.dataset.n = n; const fl = this.hasAttribute('flush');
        Object.assign(box.style, { width: '100%', aspectRatio: `1 / ${ratio}`, borderRadius: fl ? '0' : '10px', overflow: 'hidden', background: '#ececec', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: fl ? 'none' : '0 1px 2px rgba(0,0,0,.06), 0 16px 32px -22px rgba(0,0,0,.3)' });
        box.innerHTML = `<span style="${LBL}">Loading slide ${n}…</span>`;
        this.appendChild(box); this._io.observe(box);
      }
    }
  }
  PdfSlides.prototype.loadImgs = function (parts, st) {
    this.innerHTML = ''; const fl = this.hasAttribute('flush');
    parts.slice(Math.max(0, st - 1)).forEach((s, i) => {
      const box = document.createElement('div');
      Object.assign(box.style, { width: '100%', aspectRatio: '16 / 9', borderRadius: fl ? '0' : '10px', overflow: 'hidden', background: '#ececec' });
      const im = document.createElement('img'); im.src = s; im.alt = 'Slide ' + (i + st); im.loading = 'lazy'; im.decoding = 'async';
      Object.assign(im.style, { width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', margin: '-1px', display: 'block', objectFit: 'cover' });
      im.onload = () => { box.style.background = 'transparent'; };
      box.appendChild(im); this.appendChild(box);
    });
  };
  // HTML slide authored on a 1920×1080 canvas, scaled to the box; [data-yt] elements swap to an inline YouTube player on click.
  PdfSlides.prototype.htmlSlide = async function (box, url) {
    const html = await (await fetch(url)).text();
    const st = document.createElement('div');
    Object.assign(st.style, { position: 'absolute', left: '0', top: '0', width: '1920px', height: '1080px', transformOrigin: '0 0' });
    st.innerHTML = html;
    box.innerHTML = ''; box.style.position = 'relative'; box.style.background = '#050A12'; box.appendChild(st);
    const fit = () => { st.style.transform = 'scale(' + box.clientWidth / 1920 + ',' + box.clientHeight / 1080 + ')'; };
    fit(); new ResizeObserver(fit).observe(box);
    st.querySelectorAll('[data-yt]').forEach(el => el.addEventListener('click', () => {
      el.innerHTML = '<iframe src="https://www.youtube.com/embed/' + el.dataset.yt + '?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>';
      el.style.cursor = 'default';
    }, { once: true }));
  };
  customElements.define('pdf-slides', PdfSlides);
})();
