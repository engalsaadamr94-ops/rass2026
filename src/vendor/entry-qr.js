// Exposes a tiny QR renderer to the browser (SVG, error-correction M) for tax-invoice QR codes.
import qrcode from 'qrcode-generator';
window.RASSQR = function (text, cell) {
  var q = qrcode(0, 'M'); q.addData(text, 'Byte'); q.make();
  var n = q.getModuleCount(), c = cell || 3, s = n * c, d = '';
  for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) d += 'M' + k * c + ' ' + r * c + 'h' + c + 'v' + c + 'h-' + c + 'z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
};
