const passwordLength = 'const length=[...value].length;return length>=15&&length<=128';

export function patchStaffPassword(source) {
  const required = /\.min\(8,"(?:Password|Confirm password) must be at least 8 characters long"\)/g;
  const optional = /(,gender:([\w$]+)\.z\.string\(\)\.optional\(\),password:\2\.z\.string\(\))\.optional\(\)/g;
  if ([...source.matchAll(required)].length !== 2 || [...source.matchAll(optional)].length !== 1) {
    throw new Error('Unexpected preserved staff form password schema');
  }
  const message = '"Use a password between 15 and 128 characters."';
  return source.replaceAll(required, `.refine(value=>{${passwordLength}},${message})`)
    .replaceAll(optional, (_match, field) =>
      `${field}.refine(value=>{if(value==="")return true;${passwordLength}},${message}).optional()`);
}
