// Beide Durchgänge verwenden die lineare Sichttiefe des ersten Treffers.
// Null kennzeichnet den Himmel. Gefilterte Farben fließen nie in die Akkumulation zurück.
const tiefe = /* glsl */ `
float tiefenGewicht(float z, float refZ) {
  if (z == 0.0 || refZ == 0.0) return z == refZ ? 1.0 : 0.0;
  return exp(-abs(z-refZ) / max(0.15, 0.018*refZ));
}
vec4 pixel(ivec2 ort) {
  return texelFetch(bild, clamp(ort, ivec2(0), textureSize(bild,0)-1), 0);
}`;

export const denoiser = /* glsl */ `
in vec2 bildUv;
out vec4 ausgabe;
uniform highp sampler2D bild;
uniform float samples;
${tiefe}
void main() {
  ivec2 ort = ivec2(gl_FragCoord.xy);
  vec4 mitte = pixel(ort);
  vec3 summe = vec3(0.0);
  float gewichte = 0.0;
  const vec3 luma = vec3(0.2126,0.7152,0.0722);
  float hell = log(1.0 + dot(mitte.rgb,luma));
  for (int y=-2; y<=2; y++) for (int x=-2; x<=2; x++) {
    vec4 probe = pixel(ort+ivec2(x,y));
    float delta = log(1.0 + dot(probe.rgb,luma)) - hell;
    float gewicht = exp(-0.4*float(x*x+y*y) - abs(delta)*2.0) * tiefenGewicht(probe.a,mitte.a);
    summe += gewicht*probe.rgb;
    gewichte += gewicht;
  }
  float staerke = 0.95 / sqrt(1.0 + 0.1*(samples-1.0));
  ausgabe = vec4(mix(mitte.rgb,summe/gewichte,staerke),mitte.a);
}`;

export const upscaler = /* glsl */ `
in vec2 bildUv;
out vec4 ausgabe;
#define gl_FragColor ausgabe
uniform highp sampler2D bild;
${tiefe}
void main() {
  vec2 ort = bildUv * vec2(textureSize(bild,0)) - 0.5;
  ivec2 basis = ivec2(floor(ort));
  vec2 anteil = fract(ort);
  float refZ = pixel(ivec2(floor(ort+0.5))).a;
  vec3 summe = vec3(0.0);
  float gewichte = 0.0;
  for (int y=0; y<=1; y++) for (int x=0; x<=1; x++) {
    vec4 probe = pixel(basis+ivec2(x,y));
    vec2 w = mix(1.0-anteil, anteil, vec2(x,y));
    float gewicht = w.x*w.y*tiefenGewicht(probe.a,refZ);
    summe += gewicht*probe.rgb;
    gewichte += gewicht;
  }
  ausgabe = vec4(summe/gewichte,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
