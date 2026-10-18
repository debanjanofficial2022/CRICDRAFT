// Builds CricDraft: dist/site (static website: index.html, app.js, data.js) and dist/cricdraft.html (single file).
import fs from "fs";
const strip = f => fs.readFileSync(f, "utf8").split("\n").filter(l => !/^import /.test(l) && !/^export \{/.test(l)).map(l => l.replace(/^export (const|function|let) /, "$1 ")).join("\n");
const code = "(()=>{\n" + ["src/engine.js", "src/game.js", "src/ui.js"].map(strip).join("\n") + "\n})();";
const data = "window.CRICDRAFT_DATA=" + fs.readFileSync("data/ratings.json", "utf8").replace(/</g, "\\u003c") + ";";
const tpl = fs.readFileSync("src/template.html", "utf8");
const head = '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>[hidden]{display:none!important}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}</style>\n';
const v = Date.now().toString(36);
fs.mkdirSync("dist/site", { recursive: true });
fs.writeFileSync("dist/site/app.js", code);
fs.writeFileSync("dist/site/data.js", data);
fs.writeFileSync("dist/site/index.html", head + tpl.replace("__SCRIPTS__", `<script src="data.js?v=${v}"></script>\n<script src="app.js?v=${v}"></script>`) + "\n</html>\n");
fs.writeFileSync("dist/cricdraft.html", tpl.replace("__SCRIPTS__", () => `<script>${data}</script>\n<script>${code}</script>`));
console.log("site", fs.statSync("dist/site/index.html").size, fs.statSync("dist/site/app.js").size, fs.statSync("dist/site/data.js").size, "single", fs.statSync("dist/cricdraft.html").size);
