export const CAR_DAMAGE_UNIFORM_NAMES = ["uDamage", "uStrength"] as const;

// Copy of the PixiJS 8 default filter vertex stage (uOutputFrame, uOutputTexture, uInputSize, aPosition, vTextureCoord).
export const CAR_DAMAGE_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

// Tone-only pass: no spatial pattern. Spatial damage marks are Pixi children of the car container (carDamageMarks.ts, Effects.ts),
// so they rotate with the car body. The only texture read is the base sampler below.
export const CAR_DAMAGE_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uDamage;
uniform float uStrength;

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  if (src.a < 0.001) {
    finalColor = src;
    return;
  }
  float d = clamp(uDamage, 0.0, 1.0) * uStrength;
  vec3 rgb = src.rgb / src.a;

  float gray = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(rgb, vec3(gray), d * 0.8);
  rgb *= 1.0 - d * 0.45;

  finalColor = vec4(clamp(rgb, 0.0, 1.0) * src.a, src.a);
}
`;
