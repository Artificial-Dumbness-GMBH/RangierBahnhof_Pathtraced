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
w.pathtracing.passeGroesseAn(); results.resizeReset=p.samples===0;
for(const t of p.ziele)t.setSize(160,90); p.uniforms.aufloesung.value.set(160,90);
rangierbahnhof.baueAuf([9,7,5]);
w.zeichne(); results.rebuildReset=p.samples===1;
results.rebuildFinite=p.nodes.every(Number.isFinite);
results.pbrInAtlas=p.sortiert.some(t => t[30]>=0 && t[31]>=0);
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
await page.click('#raymarching');
assert.equal(await page.locator('#raymarching').getAttribute('aria-pressed'), 'true');
assert.equal(await page.locator('#pathtracing').getAttribute('aria-pressed'), 'false');
await page.evaluate(() => rangierbahnhof.welt.zeichne());
const reliefPixelDifferenz = await page.evaluate(async () => {
  const THREE = await import('/js/lib/three.module.js');
  const { pbrMaterial, reliefAktiv } = await import('/js/pbr.js');
  const { zeichner } = rangierbahnhof.welt;
  const szene = new THREE.Scene();
  szene.add(new THREE.HemisphereLight(0xffffff, 0x808080, 2));
  const material = pbrMaterial(0xb77159, 'ziegel');
  const geo = new THREE.PlaneGeometry(4, 4);
  szene.add(new THREE.Mesh(geo, material));
  const kamera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
  kamera.position.set(3.5, 0, 2.5);
  kamera.lookAt(0, 0, 0);
  const ziel = new THREE.WebGLRenderTarget(96, 96);
  const raster = new Uint8Array(96 * 96 * 4);
  const relief = new Uint8Array(raster.length);
  try {
    zeichner.setRenderTarget(ziel);
    reliefAktiv.value = false;
    zeichner.render(szene, kamera);
    zeichner.readRenderTargetPixels(ziel, 0, 0, 96, 96, raster);
    reliefAktiv.value = true;
    zeichner.render(szene, kamera);
    zeichner.readRenderTargetPixels(ziel, 0, 0, 96, 96, relief);
    return raster.filter((pixel, i) => Math.abs(pixel - relief[i]) > 3).length;
  } finally {
    zeichner.setRenderTarget(null);
    ziel.dispose();
    geo.dispose();
    material.dispose();
  }
});
assert.ok(reliefPixelDifferenz > 100, 'raymarching changes visible surface pixels');
console.log('Relief changed color channels:', reliefPixelDifferenz);
await page.click('#raymarching');
assert.equal(await page.locator('#raymarching').getAttribute('aria-pressed'), 'false');
await page.click('#pathtracing');
assert.equal(await page.evaluate(()=>{const w=rangierbahnhof.welt;w.zeichne();return w.pathtracing.samples;}),1,'reactivation reset');
assert.deepEqual(errors,[],'browser and shader errors');
console.log('Pathtracing browser checks passed.');
}finally{if(browser)await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
