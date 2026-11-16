import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const buildId = 'euAYl85haEyQ5Bfnz2vP3';
const appRouter = 'static/chunks/1255-8befde0980f5cba9.js';
const pagesRouter = 'static/chunks/main-972afb5bee8f6c4e.js';
const serverRouter = 'server/chunks/8810.js';
const webpack = 'static/chunks/webpack-d17cc3ba4bb56920.js';
const middleware = 'server/src/middleware.js';

function replaceExpected(source, search, replacement, file, expected = 1) {
  const count = typeof search === 'string'
    ? source.split(search).length - 1
    : [...source.matchAll(new RegExp(search.source, `${search.flags}g`))].length;
  if (count !== expected) {
    throw new Error(`Unexpected original admin patch count in ${file}`);
  }
  return expected === 1 ? source.replace(search, replacement) : source.replaceAll(search, replacement);
}

function patchRouter(source, basePath, file) {
  source = replaceExpected(source, /addPathPrefix\)\([\w$]+,""\)/, match => {
    return match.replace('""', JSON.stringify(basePath));
  }, file);
  source = replaceExpected(source, /pathHasPrefix\)\([\w$]+,""\)/, match => {
    return match.replace('""', JSON.stringify(basePath));
  }, file);
  return replaceExpected(source,
    /function ([\w$]+)\(([\w$]+)\)\{return \2\}(?=Object\.defineProperty\([\w$]+,"__esModule",\{value:!0\}\),Object\.defineProperty\([\w$]+,"removeBasePath")/,
    (_match, name, pathname) => `function ${name}(${pathname}){return ${pathname}.slice(${basePath.length})||"/"}`,
    file,
  );
}

function updateJson(file, update) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  update(json);
  writeFileSync(file, JSON.stringify(json));
}

export function applyBasePath(appDir, basePath) {
  if (basePath !== '/admin') throw new Error('The original admin mount must be /admin');

  const nextDir = join(appDir, '.next');
  if (readFileSync(join(nextDir, 'BUILD_ID'), 'utf8').trim() !== buildId) {
    throw new Error('Unexpected original admin Next.js build');
  }

  const serverFile = join(appDir, 'server.js');
  const server = readFileSync(serverFile, 'utf8');
  writeFileSync(serverFile, replaceExpected(server, /const nextConfig = (\{[^\n]+\})/, (_match, json) => {
    const config = JSON.parse(json);
    if (config.basePath !== '' || config.assetPrefix !== '') throw new Error('Unexpected original admin mount');
    config.basePath = basePath;
    config.assetPrefix = basePath;
    config.images.path = `${basePath}${config.images.path}`;
    return `const nextConfig = ${JSON.stringify(config)}`;
  }, 'server.js'));

  // Use the existing protected sign-in URL with the original root page and session handling.
  updateJson(join(nextDir, 'routes-manifest.json'), manifest => {
    manifest.basePath = basePath;
    manifest.rewrites.beforeFiles.push({
      source: `${basePath}/sign-in`,
      destination: basePath,
      regex: '^/admin/sign-in(?:/)?$',
    });
  });
  updateJson(join(nextDir, 'server/middleware-manifest.json'), manifest => {
    for (const matcher of manifest.middleware['/'].matchers) {
      matcher.regexp = replaceExpected(matcher.regexp, /^\^/, '^\\/admin', 'middleware-manifest.json');
    }
  });

  for (const relative of readdirSync(nextDir, { recursive: true })) {
    if (!/\.(?:js|html|rsc|css|meta)$/.test(relative)) continue;
    const file = join(nextDir, relative);
    const original = readFileSync(file, 'utf8');
    let next = original
      .replace(/(?<![\w/])\/_next\/(?:static\/|image(?=["'?]))/g, asset => `${basePath}${asset}`)
      .replace(/(?<![\w/])\/(?:logo\/|No_Image_Available\.jpg)/g, asset => `${basePath}${asset}`)
      .replace(/%2F(?:logo%2F|No_Image_Available\.jpg)/g, asset => `${encodeURIComponent(basePath)}${asset}`);

    if (relative === appRouter || relative === pagesRouter || relative === serverRouter) {
      next = patchRouter(next, basePath, relative);
    }
    if (relative === webpack) {
      next = replaceExpected(next, 'r.p="/_next/"', `r.p="${basePath}/_next/"`, relative);
    }
    if (relative.endsWith('_client-reference-manifest.js')) {
      next = next.replaceAll('"prefix":"/_next/"', `"prefix":"${basePath}/_next/"`);
    }
    if (relative === middleware) {
      next = replaceExpected(next, '["/","/register","/verify-otp"]', '["/","/sign-in","/register","/verify-otp"]', relative);
      next = replaceExpected(next, 'new URL("/",c)', `new URL("${basePath}/sign-in",c)`, relative);
      next = replaceExpected(next, 'new URL(bg,c)', `new URL("${basePath}"+bg,c)`, relative, 2);
    }
    if (relative.endsWith('.js')) {
      next = next.replaceAll('location.href="/"', `location.href="${basePath}/sign-in"`);
      next = next.replaceAll('/api/fraud-check?', `${basePath}/api/fraud-check?`);
    }
    if (relative.endsWith('.html')) {
      next = next.replaceAll('href="/dashboard', `href="${basePath}/dashboard`);
      next = next.replaceAll('\\"p\\":\\"\\"', `\\"p\\":\\"${basePath}\\"`);
    }
    if (relative.endsWith('.rsc')) next = next.replaceAll('"p":""', `"p":"${basePath}"`);
    if (/\.(?:html|rsc)$/.test(relative)) {
      next = next.replace(/(?<![\w/])\/favicon\.ico/g, asset => `${basePath}${asset}`);
    }
    if (next !== original) writeFileSync(file, next);
  }
}
