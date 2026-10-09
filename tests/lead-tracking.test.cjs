const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const analytics = fs.readFileSync(path.join(root, 'analytics.js'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const formCode = script.slice(script.indexOf('// Contact form:'), script.indexOf('// ===================== ACCESSIBILITY TOOLBAR'));
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup({ hostname = 'klem.co.il', search = '', storage = new Map(), blockStorage = false, rejectBeacon = false } = {}) {
    const listeners = new Map();
    const scripts = [], beacons = [], requests = [];
    const fields = Object.fromEntries(Object.entries({name:'Test person', phone:'0000000000', email:'test@example.com', message:'Test only'}).map(([id, value]) => [id, {
        value, attrs: {}, classList: {add(){}, remove(){}}, focus(){}, addEventListener(){},
        setAttribute(k,v){this.attrs[k]=v;}, removeAttribute(k){delete this.attrs[k];}, getAttribute(k){return this.attrs[k];}
    }]));
    const status = {textContent:''}, button = {disabled:false};
    let submit, resets = 0;
    const form = { querySelector: () => button, addEventListener: (name, fn) => { if(name === 'submit') submit = fn; }, reset(){resets++;} };
    const document = {
        head: {appendChild: el => scripts.push(el)},
        body: {appendChild: el => {if(rejectBeacon) throw Error('blocked'); beacons.push(el);}},
        createElement: tag => ({tag, remove(){this.removed=true;}}),
        addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
        dispatchEvent: event => { for (const fn of listeners.get(event.type) || []) fn(event); },
        querySelector: selector => selector === '.contact-form' ? form : null,
        getElementById: id => id === 'formStatus' ? status : fields[id] || {textContent:'', classList:{add(){},remove(){}}},
    };
    const localStorage = {
        getItem(k){if(blockStorage) throw Error('blocked');return storage.get(k) ?? null;},
        setItem(k,v){if(blockStorage) throw Error('blocked');storage.set(k,v);},
        removeItem(k){if(blockStorage) throw Error('blocked');storage.delete(k);},
    };
    const window = {location:{hostname, search, href:'https://' + hostname + '/' + search}, localStorage, crypto:require('node:crypto').webcrypto};
    const context = vm.createContext({window,document,URL,URLSearchParams,Date,Math,JSON,
        CustomEvent: class {constructor(type){this.type=type;}},
        FormData: class { constructor(){return Object.entries(fields).map(([k,v])=>[k,v.value]);} },
        fetch: (url, options) => new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),
    });
    vm.runInContext(analytics, context);
    vm.runInContext(formCode, context);
    return {window, document, scripts, beacons, requests, fields, status, button, storage,
        submit: () => submit({preventDefault(){}}),
        click: href => document.dispatchEvent({type:'click',target:{closest:()=>({href})}}),
        events: () => Array.from(window.dataLayer || [], a=>Array.from(a)).filter(a=>a[0]==='event'),
        resets: () => resets,
    };
}

test('accepted form produces one lead in each destination and no contact data', async () => {
    const s = setup({search:'?openai_click_id=opaque-click'});
    assert.equal(s.beacons.length,0);
    s.submit(); s.submit();
    assert.equal(s.requests.length,1);
    assert.equal(s.events().length,0);
    assert.equal(s.button.disabled,true);
    s.requests[0].resolve({ok:true}); await tick();
    assert.equal(s.resets(),1);
    assert.equal(s.button.disabled,false);
    assert.deepEqual(s.events().map(e=>e[1]),['generate_lead']);
    assert.equal(s.beacons.length,1);
    const beacon=s.beacons[0], u=new URL(beacon.src);
    assert.equal(u.searchParams.get('event'),'lead_created');
    assert.equal(u.searchParams.get('oppref'),'opaque-click');
    assert.equal(u.searchParams.get('data[type]'),'customer_action');
    assert.deepEqual([...u.searchParams.keys()].sort(),['data[type]','event','event_id','oppref','pid']);
    assert.equal(beacon.referrerPolicy,'origin');
    const payload=JSON.stringify(s.events())+beacon.src;
    for(const f of Object.values(s.fields)) assert.equal(payload.includes(f.value),false);
    beacon.onload(); assert.equal(beacon.removed,true);
});

test('invalid input and failed submissions produce no leads; retry can succeed', async () => {
    const s=setup(); s.fields.name.value=''; s.submit();
    assert.equal(s.requests.length,0);
    s.fields.name.value='Test'; s.submit(); s.requests[0].resolve({ok:false,status:500}); await tick();
    assert.equal(s.events().length,0); assert.equal(s.beacons.length,0); assert.equal(s.resets(),0);
    s.submit(); s.requests[1].reject(Error('offline')); await tick();
    assert.equal(s.events().length,0); assert.equal(s.button.disabled,false);
    s.submit(); s.requests[2].resolve({ok:true}); await tick();
    assert.equal(s.events().filter(e=>e[1]==='generate_lead').length,1);
});

test('WhatsApp, telephone and email clicks are attempts, never lead conversions', () => {
    const s=setup();
    for(const href of ['https://wa.me/972587222680?text=private','tel:+97239153556','mailto:info@klemantina-group.co.il','https://klem.co.il/faq','https://example.com']) s.click(href);
    assert.deepEqual(s.events().map(e=>e[1]),['whatsapp_click','phone_click','email_click']);
    assert.equal(s.beacons.length,0);
    assert.equal(JSON.stringify(s.events()).includes('private'),false);
});

test('previews, localhost and old domain send no production tracking', async () => {
    for(const hostname of ['localhost','deploy-preview-5--test.netlify.app','klemantina-group.co.il']) {
        const s=setup({hostname}); s.submit(); s.requests[0].resolve({ok:true}); await tick();
        assert.equal(s.scripts.length,0); assert.equal(s.events().length,0); assert.equal(s.beacons.length,0);
    }
});

test('click attribution survives navigation, expires and accepts both parameter names', async () => {
    const storage=new Map(); setup({search:'?oppref=first-click',storage});
    const stored=storage.get('klem_openai_click');
    const s=setup({storage});
    assert.equal(storage.get('klem_openai_click'),stored);
    s.submit(); s.requests[0].resolve({ok:true}); await tick();
    assert.equal(new URL(s.beacons[0].src).searchParams.get('oppref'),'first-click');
    storage.set('klem_openai_click',JSON.stringify({value:'old-click',expiresAt:Date.now()-1}));
    const expired=setup({storage}); expired.submit(); expired.requests[0].resolve({ok:true}); await tick();
    assert.equal(new URL(expired.beacons[0].src).searchParams.has('oppref'),false);
    assert.equal(storage.has('klem_openai_click'),false);
});

test('blocked storage or analytics does not prevent a saved enquiry', async () => {
    const s=setup({search:'?oppref=same-page',blockStorage:true});
    s.window.gtag=()=>{throw Error('blocked');};
    s.submit(); s.requests[0].resolve({ok:true}); await tick();
    assert.equal(s.resets(),1); assert.equal(s.button.disabled,false);
    assert.equal(new URL(s.beacons[0].src).searchParams.get('oppref'),'same-page');
    const blocked=setup({rejectBeacon:true}); blocked.submit(); blocked.requests[0].resolve({ok:true}); await tick();
    assert.equal(blocked.resets(),1);
    assert.match(blocked.status.textContent,/בהצלחה/);
});
