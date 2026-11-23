/* Nucleus quote form embed.
 * <script src="https://YOUR-APP/embed.js" data-key="FORM_KEY" async></script>
 * Optional: data-target="#element-id" to place the form inside a specific element.
 * Remembers ad/UTM tags from the visitor's landing page for the rest of their visit,
 * so a lead still gets credited to Google/Facebook if they browse before filling it in.
 */
(function () {
  var s = document.currentScript;
  if (!s || !s.dataset.key) return;
  var origin = new URL(s.src).origin;
  var TAGS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
  var store = {};
  try { store = JSON.parse(sessionStorage.getItem("nucleus_attr") || "{}"); } catch (e) {}
  var here = new URLSearchParams(location.search);
  var fresh = TAGS.some(function (t) { return here.get(t); });
  if (fresh || !store.page) {
    store = { page: location.href, ref: document.referrer };
    TAGS.forEach(function (t) { if (here.get(t)) store[t] = here.get(t); });
    try { sessionStorage.setItem("nucleus_attr", JSON.stringify(store)); } catch (e) {}
  }
  var q = new URLSearchParams({ embed: "1" });
  Object.keys(store).forEach(function (k) { if (store[k]) q.set(k, store[k]); });

  var f = document.createElement("iframe");
  f.src = origin + "/f/" + encodeURIComponent(s.dataset.key) + "?" + q.toString();
  f.title = "Request a quote";
  f.loading = "lazy";
  f.style.cssText = "width:100%;max-width:640px;border:0;height:620px;display:block;color-scheme:normal";
  var target = s.dataset.target && document.querySelector(s.dataset.target);
  if (target) target.appendChild(f); else s.parentNode.insertBefore(f, s.nextSibling);

  window.addEventListener("message", function (e) {
    if (e.origin === origin && e.source === f.contentWindow && e.data && e.data.nucleusHeight) {
      f.style.height = e.data.nucleusHeight + 8 + "px";
    }
  });
})();
