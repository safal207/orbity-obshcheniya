import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sprite = readFileSync(new URL('../lumi-portraits.webp', import.meta.url)).toString('base64');
const portrait = `data:image/webp;base64,${sprite}`;
const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden}
    body{font-family:Inter,ui-rounded,"Segoe UI",system-ui,sans-serif;background:#211e3d;color:white}
    .card{position:relative;width:1200px;height:630px;padding:72px 74px;overflow:hidden;
      background:radial-gradient(circle at 91% 18%,#6655a566,transparent 34%),
                 radial-gradient(circle at 12% 102%,#46558b55,transparent 36%),#211e3d}
    .star{position:absolute;width:6px;height:6px;border-radius:50%;background:#e9ddff88}
    .orbit{position:absolute;right:-10px;top:105px;width:440px;height:440px;border:5px solid #baa4f266;border-radius:50%}
    .arc{position:absolute;right:-30px;top:145px;width:500px;height:330px;border:6px solid #ffd59fbb;border-left-color:transparent;border-bottom-color:transparent;border-radius:50%;transform:rotate(-12deg)}
    .brand{font-size:28px;font-weight:900;letter-spacing:.05em;color:#dacbff}
    h1{font-size:64px;line-height:1.08;letter-spacing:-.045em;margin:28px 0 22px;max-width:690px}
    .sub{font-size:28px;line-height:1.5;color:#e7e0f8;max-width:690px;margin:0}
    .pill{display:inline-flex;align-items:center;margin-top:48px;padding:13px 26px;border-radius:999px;background:#6650ce;border:2px solid #bba6fc;font-size:25px;font-weight:800}
    .avatar{position:absolute;right:45px;top:178px;width:300px;height:300px;border-radius:50%;overflow:hidden;
      box-shadow:0 0 0 7px #bba6fc99,0 0 0 18px #9c82e428,0 18px 36px #0d092633;background:#292344}
    .avatar img{display:block;width:900px;height:300px;max-width:none;transform:translateX(0)}
    .caption{position:absolute;right:52px;top:502px;width:300px;text-align:center;color:#e3d7ff;font-size:24px;font-weight:800}
  </style></head><body><main class="card">
    <span class="star" style="left:310px;top:76px"></span><span class="star" style="left:518px;top:130px"></span>
    <span class="star" style="left:782px;top:82px"></span><span class="star" style="left:690px;top:527px"></span>
    <div class="orbit"></div><div class="arc"></div>
    <div class="brand">ОРБИТЫ ОБЩЕНИЯ</div>
    <h1>Станем ближе<br>друг к другу</h1>
    <p class="sub">Короткие практики, чтобы слушать, говорить<br>и договариваться — один разговор за раз.</p>
    <div class="pill">✦&nbsp;&nbsp;Начать с маленького шага</div>
    <div class="avatar"><img src="${portrait}" alt=""></div>
    <div class="caption">Луми · ваш спутник</div>
  </main></body></html>`, { waitUntil: 'load' });
  await page.screenshot({ path: out('orbity-og.png') });

  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:512px;height:512px;overflow:hidden}
    body{background:radial-gradient(circle at 55% 42%,#574b84,#211e3d 72%);display:grid;place-items:center}
    .ring{width:404px;height:404px;border-radius:50%;overflow:hidden;border:8px solid #bba6fc;
      box-shadow:0 0 0 12px #8e73d233,0 20px 42px #0e0a273d;background:#292344}
    img{display:block;width:1212px;height:404px;max-width:none;transform:translateX(0)}
  </style></head><body><div class="ring"><img src="${portrait}" alt=""></div></body></html>`, { waitUntil: 'load' });
  await page.screenshot({ path: out('orbity-icon.png') });
} finally {
  await browser.close();
}

console.log('Rendered orbity-og.png (1200x630) and orbity-icon.png (512x512).');
