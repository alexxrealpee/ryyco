import type { Express, Request, Response } from 'express';

const base = 'https://firestore.googleapis.com/v1/projects/studio-9002217802-13e05/databases/ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15/documents';
const profiles = ['uid','email','createdAt','role','plan','subscriptionPlan','subscriptionAnchorDay','username','displayName','storeName','bio','currency','category','layout','isClosed','suspended','archived',
  'subscriptionStatus','subscriptionTrialExpires','subscriptionPaidUntil','scheduleEnabled','openTime','closeTime',
  'restaurantDaysOpen','weeklySchedule','phone','whatsapp','customerServiceWhatsapp','ownerWhatsapp','address','mapUrl','restaurantReference',
  'lat','lng','restaurantAcceptsDelivery','restaurantAcceptsTakeaway','restaurantPaymentMethods','restaurantDeliveryTime',
  'restaurantAddress','restaurantCity','rating','ratingCount'];
const products = ['userId','name','description','price','compareAtPrice','packagingCost','category','stock',
  'variantsText','variantsList','variantPrices','hasFlavors','allowsHalfAndHalf','flavorsText','flavorsList',
  'allowSingleFlavor','addons','active','storeName','storeUsername','createdAt','imageFileName'];
const validId = (id: string) => /^[A-Za-z0-9_.@ -]{1,150}$/.test(id);
function decode(value: any): any {
  if (value.mapValue) return fields(value.mapValue.fields || {});
  if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
  if ('integerValue' in value) return Number(value.integerValue);
  for (const key of ['doubleValue','stringValue','booleanValue','timestampValue','geoPointValue','referenceValue']) {
    if (key in value) return value[key];
  }
  return null;
}
const fields = (data: Record<string, any>) => Object.fromEntries(Object.entries(data).map(([k,v]) => [k,decode(v)]));
async function read(url: string, query?: object) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000),
    ...(query ? {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(query)} : {}) });
  if (!response.ok) throw new Error('catalog-upstream');
  return response.json();
}

const historicalPackagingCosts: Record<string, number> = {
  JnAZQN6aWNOx6jtZetnc: 1000,
  BZjf4unO3zGX03I5S8v9: 1000,
  zFVYV5NdYEqA8ojC7OU4: 2000,
  '3wEsOLiHHJjC77OOsaYR': 500
};

export async function catalogPage(req: Request, res: Response) {
  res.setHeader('Cache-Control','no-store');
  const kind = req.query.kind ?? 'products';
  const after = String(req.query.after ?? '');
  if (!['stores','products'].includes(String(kind)) || (after && !validId(after))) {
    res.status(400).json({error:'Solicitud de catálogo inválida.'}); return;
  }
  const count = Math.min(24,Math.max(1,Math.trunc(Number(req.query.limit) || 12)));
  const collection = kind === 'stores' ? 'profiles' : 'products';
  const query: any = {from:[{collectionId:collection}],select:{fields:(kind === 'stores' ? profiles : products).map(fieldPath=>({fieldPath}))},
    orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}]};
  if (kind === 'products') {
    query.limit = count;
    if (after) query.startAt = {before:false,values:[{referenceValue:base.replace('https://firestore.googleapis.com/v1/','')+'/products/'+after}]};
  }
  try {
    const rows = await read(base+':runQuery',{structuredQuery:query});
    if (!Array.isArray(rows) || !rows.length || rows.some(row=>row.error || (!row.document && !row.readTime))) throw Error('unconfirmed');
    const docs = rows.filter(row=>row.document).map(row=>row.document);
    const items = docs.map(document=>{
      const data = fields(document.fields || {});
      const id = document.name.split('/').pop();
      if (kind === 'stores') {
        data.uid ??= id;
      } else {
        data.id = id;
        if ((data.packagingCost === undefined || data.packagingCost === null) && id && historicalPackagingCosts[id] !== undefined) {
          data.packagingCost = historicalPackagingCosts[id];
        }
      }
      data[kind === 'stores' ? 'photoURL' : 'imageURL'] = '/api/catalog-image.php?'+new URLSearchParams({kind:String(kind),id,v:document.updateTime || ''});
      return data;
    });
    res.json({source:'firestore-server',kind,items,hasMore:kind === 'products' && items.length === count,
      cursor:docs.at(-1)?.name.split('/').pop() || null,confirmedAt:new Date().toISOString()});
  } catch { res.status(503).json({error:'No se pudo consultar el catálogo en vivo.'}); }
}

export async function catalogImage(req: Request, res: Response) {
  res.setHeader('Cache-Control','no-store');
  const kind=String(req.query.kind || ''), id=String(req.query.id || ''), version=String(req.query.v || '');
  if (!['stores','products'].includes(kind) || !validId(id) || version.length>80) {res.sendStatus(400);return;}
  const collection=kind==='stores'?'profiles':'products', field=kind==='stores'?'photoURL':'imageURL';
  try {
    const document = await read(`${base}/${collection}/${encodeURIComponent(id)}?mask.fieldPaths=${field}`);
    const original = document.fields?.[field]?.stringValue || '';
    const sameVersion = version && document.updateTime === version;
    const cache = sameVersion ? 'public, max-age=31536000, immutable' : 'no-store';
    const image = /^data:image\/(jpeg|png|webp|gif|avif);base64,([A-Za-z0-9+/=\s]+)$/.exec(original);
    if (image) {
      const bytes = Buffer.from(image[2],'base64');
      if (bytes.length > 5*1024*1024) {res.sendStatus(413);return;}
      res.setHeader('Cache-Control',cache);
      res.type('image/'+image[1]).send(bytes); return;
    }
    if (/^https:\/\/[^\s\r\n]+$/.test(original) || /^\/(?!\/)[^\s\r\n\\]*$/.test(original)) {
      res.setHeader('Cache-Control',cache);res.redirect(302,original);return;
    }
    res.sendStatus(404);
  } catch {res.sendStatus(503);}
}

export function registerCatalogPageRoutes(app: Express) {
  app.get('/api/catalog-page.php',catalogPage);
  app.get('/api/catalog-image.php',catalogImage);
}
