const assert = require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
let browser;
try {
browser=await chromium.launch({...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:800,height:600}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
await page.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window); window.requestAnimationFrame=fn=>raf(t=>{if(!window.pauseRender) fn(t);});});
await page.goto(process.env.TEST_URL || 'http://localhost:8080');
await page.waitForFunction(()=>window.rangierbahnhof);
await page.evaluate(()=>{
const p=rangierbahnhof.welt.pathtracing;
for(const t of p.ziele)t.setSize(160,90); p.uniforms.aufloesung.value.set(160,90);
});
await page.click('#pathtracing');
await page.waitForFunction(()=>rangierbahnhof.welt.pathtracing.samples>=4,{},{timeout:120000});
await page.evaluate(()=>{window.pauseRender=true;});
console.log('initial',await page.evaluate(()=>({samples:rangierbahnhof.welt.pathtracing.samples,triangles:rangierbahnhof.welt.pathtracing.sortiert.length,atlas:rangierbahnhof.welt.pathtracing.maps.length})));
// One explicit frame per change makes reset assertions independent of frame rate.
const checks=await page.evaluate(()=>{
const w=rangierbahnhof.welt,p=w.pathtracing;
let results={};
w.kamera.position.x+=2; w.zeichne(); results.cameraReset=p.samples===1;
w.zeichne(); results.accumulates=p.samples===2;
const nodes=p.nodes, atlas=p.uniforms.atlas.value;
rangierbahnhof.lok.gruppe.position.x+=1; w.zeichne();
results.motionReset=p.samples===1; results.bvhRefit=nodes===p.nodes; results.atlasReused=atlas===p.uniforms.atlas.value;
w.volumenlichtAktiv=!w.volumenlichtAktiv; w.zeichne(); results.fogReset=p.samples===1;
w.pathtracing.passeGroesseAn(); results.resizeReset=p.samples===0;
for(const t of p.ziele)t.setSize(160,90); p.uniforms.aufloesung.value.set(160,90);
rangierbahnhof.baueAuf([9,7,5]);
w.zeichne(); results.rebuildReset=p.samples===1;
results.rebuildFinite=p.nodes.every(Number.isFinite);
return results;
});
console.log('checks',checks);
for(const [name,passed] of Object.entries(checks)) assert.equal(passed,true,name);
// Verify actual GPU output, not just JavaScript's sample counter.
const pixels=await page.evaluate(()=>{
  const w=rangierbahnhof.welt, p=w.pathtracing;
  const data=new Float32Array(160*90*4);
  w.zeichner.readRenderTargetPixels(p.ziele[0],0,0,160,90,data);
  return {finite:data.every(Number.isFinite), lit:data.some((v,i)=>i%4!==3 && v>0.01)};
});
assert.equal(pixels.finite,true,'finite GPU output');
assert.equal(pixels.lit,true,'non-black GPU output');
await page.click('#pathtracing');
assert.equal(await page.evaluate(()=>{const w=rangierbahnhof.welt;w.zeichne();return w.pathtracingAktiv;}),false,'raster toggle');
await page.click('#pathtracing');
assert.equal(await page.evaluate(()=>{const w=rangierbahnhof.welt;w.zeichne();return w.pathtracing.samples;}),1,'reactivation reset');
assert.deepEqual(errors,[],'browser and shader errors');
console.log('Pathtracing browser checks passed.');
}finally{if(browser)await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
