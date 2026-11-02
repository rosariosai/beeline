// External (MV3 forbids inline scripts): applies the saved theme before first paint.
try {
  var t = localStorage.getItem('tilenest-theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
