const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require('node:path').join(__dirname,'../privacy-preferences.js'),'utf8');
function fixture(saved, blocked=false) {
    const data = new Map(Object.entries(saved || {})), listeners={}, events=[], cookies=[];
    let reloads=0, interval;
    const storage={getItem:k=>{if(blocked)throw Error();return data.get(k)||null;},setItem:(k,v)=>{if(blocked)throw Error();data.set(k,v);},removeItem:k=>data.delete(k)};
    const document={dispatchEvent:e=>events.push(e),get cookie(){return '_ga=old; _ga_4JVRVNQNTD=old';},set cookie(v){cookies.push(v);}};
    const window={localStorage:storage,sessionStorage:storage,location:{hostname:'klem.co.il',reload:()=>reloads++},addEventListener:(n,f)=>listeners[n]=f};
    vm.runInNewContext(code,{window,document,Date,JSON,Object,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},setInterval:f=>interval=f});
    return {api:window.klemPrivacy,data,events,cookies,listeners,reloads:()=>reloads,interval};
}
test('defaults denied, ignores legacy approval, removes optional identifiers',()=>{
    const s=fixture({klem_replay_consent_v1:JSON.stringify({allowed:true,expires:Date.now()+99999}),klem_openai_click:'old',klem_replay_visitor:'old'});
    for(const purpose of ['analytics','replay','advertising']) assert.equal(s.api.allows(purpose),false);
    assert.equal(s.data.size,0); assert.ok(s.cookies.some(c=>c.includes('_ga=')));
});
test('stores versioned choices, restores them, and withdrawal clears tracking',()=>{
    const s=fixture(); s.api.choose({analytics:true,replay:true,advertising:false});
    assert.equal(s.api.allows('advertising'),false);
    const receipt=JSON.parse(s.data.get('klem_privacy_v2'));
    assert.equal(receipt.version,2); assert.equal(receipt.expires-receipt.decidedAt,30*86400000);
    const restored=fixture(Object.fromEntries(s.data)); assert.equal(restored.api.allows('replay'),true);
    restored.api.choose({}); assert.equal(restored.reloads(),1); assert.equal(restored.api.allows('replay'),false);
});
test('expired or malformed consent fails closed; other-tab withdrawal stops tracking',()=>{
    const s=fixture();s.api.choose({analytics:true});s.data.delete('klem_privacy_v2');s.listeners.storage({key:'klem_privacy_v2'});
    assert.equal(s.api.allows('analytics'),false);assert.equal(s.reloads(),1);
    for(const value of ['invalid', JSON.stringify({version:2,expires:0}),JSON.stringify({version:1,expires:Date.now()+999999})]) assert.equal(fixture({klem_privacy_v2:value}).api.current(),null);
});
test('blocked storage keeps explicit choice in memory only',()=>{
    const s=fixture({},true);assert.equal(s.api.allows('analytics'),false);s.api.choose({replay:true});assert.equal(s.api.allows('replay'),true);assert.equal(s.data.size,0);
});
