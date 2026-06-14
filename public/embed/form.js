/* ============================================================================
   PixelOS — formularios embebibles de captación de leads
   Uso en cualquier página:
     <div data-pixel-form="FORM_ID"></div>
     <script src="https://my.abbypixel.com/embed/form.js" defer></script>
   El formulario se dibuja solo y los envíos caen en el CRM (/leads).
   ========================================================================== */
(function () {
  "use strict";

  // Origin del CRM = de dónde se cargó este script (fallback a producción).
  var API_BASE = "https://my.abbypixel.com";
  try {
    var self =
      document.currentScript ||
      (function () {
        var s = document.querySelectorAll('script[src*="embed/form.js"]');
        return s[s.length - 1];
      })();
    if (self && self.src) API_BASE = new URL(self.src).origin;
  } catch (e) {
    /* fallback */
  }

  var STYLE_ID = "pxf-styles";
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      ".pxf-form{max-width:560px;margin:0 auto;font-family:inherit;color:inherit}" +
      ".pxf-field{margin-bottom:16px}" +
      ".pxf-label{display:block;font-size:14px;font-weight:600;margin-bottom:6px}" +
      ".pxf-req{color:#c0392b}" +
      ".pxf-help{font-size:12px;opacity:.7;margin:0 0 6px}" +
      ".pxf-input,.pxf-textarea,.pxf-select{width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid rgba(0,0,0,.15);border-radius:10px;font-size:15px;font-family:inherit;background:#fff;color:#111}" +
      ".pxf-textarea{min-height:96px;resize:vertical}" +
      ".pxf-input:focus,.pxf-textarea:focus,.pxf-select:focus{outline:none;border-color:#b89968;box-shadow:0 0 0 3px rgba(184,153,104,.18)}" +
      ".pxf-radio,.pxf-check{display:flex;align-items:center;gap:8px;font-size:15px;margin:6px 0}" +
      ".pxf-radio input,.pxf-check input{width:auto}" +
      ".pxf-note{font-size:15px;line-height:1.5;opacity:.85;margin:0 0 4px}" +
      ".pxf-btn{width:100%;padding:14px 20px;border:none;border-radius:999px;background:#14110f;color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:opacity .2s}" +
      ".pxf-btn:hover{opacity:.9}.pxf-btn:disabled{opacity:.6;cursor:progress}" +
      ".pxf-err{color:#c0392b;font-size:12px;margin-top:5px}" +
      ".pxf-msg{padding:14px 16px;border-radius:12px;font-size:15px;line-height:1.5}" +
      ".pxf-msg-ok{background:rgba(31,122,77,.1);color:#1f7a4d}" +
      ".pxf-msg-bad{background:rgba(192,57,43,.08);color:#c0392b}" +
      ".pxf-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}" +
      ".pxf-title{font-size:22px;font-weight:600;margin:0 0 6px}" +
      ".pxf-desc{font-size:15px;opacity:.8;margin:0 0 18px;line-height:1.5}";
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs)
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") node.textContent = attrs[k];
        else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      });
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function renderField(field) {
    if (field.type === "explanation") {
      var note = el("div", { class: "pxf-field" }, [
        el("p", { class: "pxf-note", text: field.label }),
      ]);
      return { wrap: note, get: function () { return undefined; }, field: field };
    }

    var label = el("label", { class: "pxf-label", for: "pxf_" + field.key });
    label.textContent = field.label;
    if (field.required) {
      var star = el("span", { class: "pxf-req", text: " *" });
      label.appendChild(star);
    }

    var control;
    var id = "pxf_" + field.key;
    var ph = field.placeholder || "";

    if (field.type === "textarea") {
      control = el("textarea", { class: "pxf-textarea", id: id, placeholder: ph });
    } else if (field.type === "select") {
      control = el("select", { class: "pxf-select", id: id });
      control.appendChild(el("option", { value: "", text: ph || "Selecciona…" }));
      (field.options || []).forEach(function (o) {
        control.appendChild(el("option", { value: o.value, text: o.label }));
      });
    } else if (field.type === "radio") {
      control = el("div", { id: id });
      (field.options || []).forEach(function (o, i) {
        var rid = id + "_" + i;
        var inp = el("input", { type: "radio", name: id, id: rid, value: o.value });
        var rl = el("label", { class: "pxf-radio", for: rid });
        rl.appendChild(inp);
        rl.appendChild(document.createTextNode(o.label));
        control.appendChild(rl);
      });
    } else if (field.type === "checkbox") {
      var cinp = el("input", { type: "checkbox", id: id });
      control = el("label", { class: "pxf-check" });
      control.appendChild(cinp);
      control.appendChild(document.createTextNode(field.placeholder || "Acepto"));
    } else {
      var typeMap = {
        email: "email",
        tel: "tel",
        number: "number",
        date: "date",
        text: "text",
      };
      control = el("input", {
        class: "pxf-input",
        id: id,
        type: typeMap[field.type] || "text",
        placeholder: ph,
      });
    }

    var wrap = el("div", { class: "pxf-field" });
    wrap.appendChild(label);
    if (field.help) wrap.appendChild(el("p", { class: "pxf-help", text: field.help }));
    wrap.appendChild(control);
    var errEl = el("div", { class: "pxf-err" });
    errEl.style.display = "none";
    wrap.appendChild(errEl);

    function get() {
      if (field.type === "checkbox") return control.querySelector("input").checked;
      if (field.type === "radio") {
        var sel = control.querySelector("input:checked");
        return sel ? sel.value : "";
      }
      return control.value;
    }

    return { wrap: wrap, get: get, errEl: errEl, field: field };
  }

  function applyConditional(parts) {
    function refresh() {
      var values = {};
      parts.forEach(function (p) {
        if (p.field.type !== "explanation") values[p.field.key] = p.get();
      });
      parts.forEach(function (p) {
        var vi = p.field.visibleIf;
        if (!vi) return;
        var show = String(values[vi.key] == null ? "" : values[vi.key]) === vi.equals;
        p.wrap.style.display = show ? "" : "none";
      });
    }
    parts.forEach(function (p) {
      if (p.wrap.querySelector)
        p.wrap.addEventListener("change", refresh);
    });
    refresh();
  }

  function mount(container, def) {
    injectStyles();
    container.innerHTML = "";

    var form = el("form", { class: "pxf-form", novalidate: "novalidate" });

    if (def.name) form.appendChild(el("h3", { class: "pxf-title", text: def.name }));
    if (def.description)
      form.appendChild(el("p", { class: "pxf-desc", text: def.description }));

    var parts = (def.fields || []).map(renderField);
    parts.forEach(function (p) {
      form.appendChild(p.wrap);
    });

    // Honeypot
    var hp = el("div", { class: "pxf-hp", "aria-hidden": "true" });
    var hpInput = el("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off" });
    hp.appendChild(hpInput);
    form.appendChild(hp);

    var status = el("div", { class: "pxf-msg" });
    status.style.display = "none";

    var btn = el("button", { type: "submit", class: "pxf-btn", text: def.submitLabel || "Enviar" });
    form.appendChild(btn);
    form.appendChild(el("div", { style: "height:10px" }));
    form.appendChild(status);

    applyConditional(parts);

    function showStatus(kind, text) {
      status.className = "pxf-msg " + (kind === "ok" ? "pxf-msg-ok" : "pxf-msg-bad");
      status.textContent = text;
      status.style.display = "";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      // limpia errores
      parts.forEach(function (p) {
        if (p.errEl) { p.errEl.style.display = "none"; p.errEl.textContent = ""; }
      });

      var payload = { website: hpInput.value };
      parts.forEach(function (p) {
        if (p.field.type === "explanation") return;
        payload[p.field.key] = p.get();
      });

      btn.disabled = true;
      var prev = btn.textContent;
      btn.textContent = "Enviando…";

      fetch(API_BASE + "/api/public/forms/" + encodeURIComponent(def.id), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (b) {
            return { ok: r.ok, status: r.status, body: b };
          });
        })
        .then(function (res) {
          if (res.ok && res.body && res.body.ok) {
            form.reset();
            container.innerHTML = "";
            var done = el("div", { class: "pxf-form" }, [
              el("div", { class: "pxf-msg pxf-msg-ok", text: def.successMessage || "¡Gracias! Te contactaremos pronto." }),
            ]);
            container.appendChild(done);
            return;
          }
          if (res.body && res.body.fields) {
            Object.keys(res.body.fields).forEach(function (key) {
              var p = parts.filter(function (x) { return x.field.key === key; })[0];
              if (p && p.errEl) { p.errEl.textContent = res.body.fields[key]; p.errEl.style.display = ""; }
            });
            showStatus("bad", "Revisa los campos marcados.");
          } else if (res.status === 429) {
            showStatus("bad", "Has enviado varios formularios. Espera unos minutos.");
          } else {
            showStatus("bad", (res.body && res.body.error) || "No se pudo enviar. Intenta de nuevo.");
          }
        })
        .catch(function () {
          showStatus("bad", "Problema de conexión. Intenta de nuevo.");
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = prev;
        });
    });

    container.appendChild(form);
  }

  function load(container) {
    var id = container.getAttribute("data-pixel-form");
    if (!id || container.getAttribute("data-pxf-done")) return;
    container.setAttribute("data-pxf-done", "1");
    container.textContent = "Cargando…";
    fetch(API_BASE + "/api/public/forms/" + encodeURIComponent(id), {
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(function (def) {
        mount(container, def);
      })
      .catch(function () {
        container.textContent = "";
      });
  }

  function init() {
    var nodes = document.querySelectorAll("[data-pixel-form]");
    Array.prototype.forEach.call(nodes, load);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expone init por si la web inyecta formularios dinámicamente.
  window.PixelForms = { init: init };
})();
