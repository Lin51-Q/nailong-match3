"""Normalize user-supplied images; never modify the originals."""
from pathlib import Path
import sys, json
from collections import deque
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/python'))
from PIL import Image, ImageOps, ImageDraw

OUT = ROOT / 'public/assets'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'assets/source'
SOURCE.mkdir(parents=True, exist_ok=True)
FILES = [
    ('chill', '256d2eca39dbb6fdd84939224f24ab18962b37d9.jpg', (0.16,0.02,0.80,0.64)),
    ('think', '7ee21c18ebc4b745ef9b6b1289fc1e178b8215e4.jpg', (0.12,0.07,0.78,0.74)),
    ('smug', 'dfaf382ad40735fa77ff92bdd8510fb30e2408e4.jpg', (0.15,0.08,0.85,0.68)),
    ('happy', '6949a5efef200fMJ.jpeg', (0.13,0.08,0.84,0.78)),
    ('laugh', '6949a5ec7621fcFM.jpeg', (0.26,0.01,0.93,0.69)),
    ('pink', '6949a5f0b654cOQt.jpeg', (0.04,0.01,0.75,0.70)),
    ('rainbow', 'v2-2df512e2f54db889c5a2667fd57518b4_r.webp', (0.06,0.00,0.76,0.70)),
    ('hero', 'e6ef7e08b3de9c824ce36e8b2a81800a18d8436d.jpg', None),
]

def cutout(im, conservative=False):
    im = im.convert('RGBA')
    w,h=im.size
    px=im.load(); seen=bytearray(w*h); q=deque()
    def eligible(x,y):
        r,g,b,_=px[x,y]
        return min(r,g,b) > (237 if conservative else 185) and max(r,g,b)-min(r,g,b) < (18 if conservative else 32)
    def add(x,y):
        i=y*w+x
        if not seen[i] and eligible(x,y): seen[i]=1; q.append((x,y))
    for x in range(w): add(x,0); add(x,h-1)
    for y in range(h): add(0,y); add(w-1,y)
    while q:
        x,y=q.popleft(); r,g,b,_=px[x,y]; px[x,y]=(r,g,b,0)
        if x: add(x-1,y)
        if x+1<w: add(x+1,y)
        if y: add(x,y-1)
        if y+1<h: add(x,y+1)
    return im

manifest=[]
for name,filename,crop in FILES:
    original=ImageOps.exif_transpose(Image.open(ROOT/'image'/filename)).convert('RGBA')
    if crop:
        w,h=original.size
        original=original.crop(tuple(round(v*(w if i%2==0 else h)) for i,v in enumerate(crop)))
    original.thumbnail((900,900), Image.Resampling.LANCZOS)
    im=cutout(original, name=='laugh')
    # Fit to a consistent transparent square. All final portrait sources are 512px.
    size=768 if name=='hero' else 512
    fitted=ImageOps.contain(im,(int(size*.93),int(size*.93)),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(size,size))
    canvas.alpha_composite(fitted,((size-fitted.width)//2,(size-fitted.height)//2))
    canvas.save(SOURCE/f'{name}.png')
    web=canvas.resize((512,512) if name=='hero' else (256,256),Image.Resampling.LANCZOS)
    web.save(OUT/f'{name}.webp','WEBP',quality=86,method=6)
    manifest.append({'id':name,'original':filename,'source':f'assets/source/{name}.png','web':f'assets/{name}.webp','bytes':(OUT/f'{name}.webp').stat().st_size})
sheet=Image.new('RGB',(4*256,2*280),'#fff5de')
draw=ImageDraw.Draw(sheet)
for i,item in enumerate(manifest):
    im=Image.open(OUT/f"{item['id']}.webp").resize((240,240))
    x=(i%4)*256+8;y=(i//4)*280+5
    sheet.paste(im,(x,y),im);draw.text((x,y+243),item['id'],fill='#473528')
(ROOT/'docs').mkdir(exist_ok=True)
sheet.save(ROOT/'docs/asset-preview.jpg',quality=90)
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'images':len(manifest),'web_bytes':sum(i['bytes'] for i in manifest)},indent=2))
